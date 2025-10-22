// dataEditor.ts - Manages the webview for editing table data

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { SqlGenerator } from './sqlGenerator';
import { IndexManagerView } from './indexManagerView';
import { parsePostgresArrayLiteral, applyEnumLabelsToColumns } from './pgUtils';
import type {
    ColumnInfo,
    PrimaryKeyInfo,
    SortDescriptor,
    FilterMap,
    TablePreferences,
    TableStatePayload,
    GridChange,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    QueryResultRow,
    ColumnTypeMetadata
} from './types';
import { isWebviewToExtension } from './types';

interface PanelState {
    page: number;
    sort: SortDescriptor | null;
    filters: FilterMap;
    searchTerm: string;
}

interface CachedSchemaMetadata {
    columns: ColumnInfo[];
    columnsResultRows: QueryResultRow[];
    enumLabelsByOid: Record<number, string[]>;
}

export class DataEditor {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly initializedPanels = new Set<vscode.WebviewPanel>();
    private readonly panelState = new Map<vscode.WebviewPanel, PanelState>();
    private paginationSize = 100;
    // Cache schema/enum metadata keyed by panel key (connection:schema.table)
    private schemaCache: Map<string, CachedSchemaMetadata> = new Map();

    constructor(context: vscode.ExtensionContext, connectionManager: ConnectionManager) {
        this.context = context;
        this.connectionManager = connectionManager;
    }

    async openTable(item: DatabaseTreeItem): Promise<void> {
        const connectionId = item.connectionId;
        const schemaName = item.schemaName;
        const tableName = item.tableName;

        if (!connectionId || !schemaName || !tableName) {
            vscode.window.showErrorMessage('Unable to open table - missing connection or table information.');
            return;
        }

        const panelKey = this.buildPanelKey(connectionId, schemaName, tableName);
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.One);
            const state = this.getPanelState(existingPanel);
            await this.loadTableData(existingPanel, connectionId, schemaName, tableName, state.page);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresDataEditor',
            `${schemaName}.${tableName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
            }
        );

        this.panels.set(panelKey, panel);
        this.panelState.set(panel, this.createDefaultPanelState());

        const messageDisposable = panel.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage | unknown) => {
            if (!isWebviewToExtension(message)) {
                vscode.window.showErrorMessage('Invalid webview message received');
                return;
            }
            await this.handleMessage(message, panel, connectionId, schemaName, tableName);
        });
        this.context.subscriptions.push(messageDisposable);

        panel.onDidDispose(() => {
            messageDisposable.dispose();
            this.panels.delete(panelKey);
            this.initializedPanels.delete(panel);
            this.panelState.delete(panel);
            // Remove cached schema metadata for this panel to free memory
            this.schemaCache.delete(panelKey);
        });

        await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
    }

    private buildPanelKey(connectionId: string, schemaName: string, tableName: string): string {
        return `${connectionId}:${schemaName}.${tableName}`;
    }

    private createDefaultPanelState(): PanelState {
        return {
            page: 0,
            sort: null,
            filters: {},
            searchTerm: ''
        };
    }

    private getPanelState(panel: vscode.WebviewPanel): PanelState {
        let state = this.panelState.get(panel);
        if (!state) {
            state = this.createDefaultPanelState();
            this.panelState.set(panel, state);
        }
        return state;
    }

    private async loadTableData(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        page: number = 0
    ): Promise<void> {
        const state = this.getPanelState(panel);
        state.page = page;

        const payload = await this.fetchTableState(connectionId, schemaName, tableName, state);
        if (!payload) {
            return;
        }

        const webview = panel.webview;

        if (!this.initializedPanels.has(panel)) {
            panel.webview.html = this.buildWebviewHtml(webview, payload);
            this.initializedPanels.add(panel);
        } else {
            webview.postMessage({
                command: 'loadData',
                payload
            });
        }
    }

    private async fetchTableState(
        connectionId: string,
        schemaName: string,
        tableName: string,
        state: PanelState
    ): Promise<TableStatePayload | null> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            vscode.window.showErrorMessage('No active PostgreSQL connection. Please connect and try again.');
            return null;
        }

        this.connectionManager.markBusy(connectionId);

        try {
            const cacheKey = `${connectionId}:${schemaName}.${tableName}`;
            let cached = this.schemaCache.get(cacheKey);
            let columns: ColumnInfo[] = [];
            let columnsResultRows: any[] = [];
            let enumLabelsByOid: Record<number, string[]> = {};
            if (cached) {
                ({ columns, columnsResultRows, enumLabelsByOid } = cached);
            } else {
                // Fetch typed column information including type OIDs so we can
                // detect enums and array element types accurately.
                const columnsResult = await client.query(
                    `SELECT a.attname AS column_name,
                            pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                            NOT a.attnotnull AS is_nullable,
                            t.oid AS typoid,
                            t.typname AS typname,
                            t.typtype AS typtype,
                            t.typelem AS typelem
                     FROM pg_attribute a
                     JOIN pg_class c ON a.attrelid = c.oid
                     JOIN pg_namespace n ON c.relnamespace = n.oid
                     JOIN pg_type t ON a.atttypid = t.oid
                     WHERE n.nspname = $1
                       AND c.relname = $2
                       AND a.attnum > 0
                       AND NOT a.attisdropped
                     ORDER BY a.attnum;`,
                    [schemaName, tableName]
                );

                // Map basic column metadata and collect candidate type OIDs for
                // additional inspection (enums & element types).
                const candidateTypeOids: number[] = [];
                for (const r of columnsResult.rows) {
                    const typoid = Number(r.typoid) || 0;
                    const typelem = Number(r.typelem) || 0;
                    if (typoid) candidateTypeOids.push(typoid);
                    if (typelem) candidateTypeOids.push(typelem);
                    columns.push({
                        name: r.column_name,
                        type: r.data_type,
                        nullable: Boolean(r.is_nullable)
                    });
                    columnsResultRows.push(r);
                }

                // Deduplicate OIDs
                const uniqueTypeOids = Array.from(new Set(candidateTypeOids));

                // Fetch type metadata for the collected type OIDs so we can detect
                // which are enum types and which are array element types.
                const typeInfoMap: Record<number, { typname: string; typtype: string; typelem: number; oid: number }> = {};
                if (uniqueTypeOids.length > 0) {
                    const typeRows = await client.query(
                        `SELECT oid, typname, typtype, typelem FROM pg_type WHERE oid = ANY($1::oid[])`,
                        [uniqueTypeOids]
                    );
                    for (const tr of typeRows.rows) {
                        typeInfoMap[Number(tr.oid)] = {
                            typname: tr.typname,
                            typtype: tr.typtype,
                            typelem: Number(tr.typelem) || 0,
                            oid: Number(tr.oid)
                        };
                    }
                }

                // Identify enum type OIDs to fetch their labels
                const enumTypeOids: number[] = [];
                for (const oidStr of Object.keys(typeInfoMap)) {
                    const oid = Number(oidStr);
                    const info = typeInfoMap[oid];
                    if (info && info.typtype === 'e') {
                        enumTypeOids.push(oid);
                    }
                }

                // Also check array element types referenced by columns for enum element types
                for (const colRow of columnsResult.rows) {
                    const elemOid = Number(colRow.typelem) || 0;
                    if (elemOid && typeInfoMap[elemOid] && typeInfoMap[elemOid].typtype === 'e') {
                        if (!enumTypeOids.includes(elemOid)) {
                            enumTypeOids.push(elemOid);
                        }
                    }
                }

                // Fetch enum labels grouped by enum type oid
                if (enumTypeOids.length > 0) {
                    const enumRows = await client.query(
                        `SELECT enumtypid::oid AS enumtypid, enumlabel
                         FROM pg_enum
                         WHERE enumtypid = ANY($1::oid[])
                         ORDER BY enumtypid, enumsortorder`,
                        [enumTypeOids]
                    );
                    for (const er of enumRows.rows) {
                        const typ = Number(er.enumtypid);
                        enumLabelsByOid[typ] = enumLabelsByOid[typ] || [];
                        enumLabelsByOid[typ].push(String(er.enumlabel));
                    }
                }

                // Attach enum labels to matching columns and cache
                applyEnumLabelsToColumns(columns, columnsResultRows, enumLabelsByOid);
                cached = { columns, columnsResultRows, enumLabelsByOid };
                this.schemaCache.set(cacheKey, cached);
            }

            const pkResult = await client.query(
                `SELECT a.attname
                 FROM pg_index i
                 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                 WHERE i.indrelid = $1::regclass AND i.indisprimary`,
                [`${schemaName}.${tableName}`]
            );

            const primaryKey: PrimaryKeyInfo = {
                columns: pkResult.rows.map(row => row.attname)
            };

            // Fetch unique constraints
            const uniqueResult = await client.query(
                `SELECT a.attname
                 FROM pg_constraint c
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                 JOIN pg_class t ON t.oid = c.conrelid
                 JOIN pg_namespace n ON n.oid = t.relnamespace
                 WHERE t.relname = $1 AND n.nspname = $2 AND c.contype = 'u'`,
                [tableName, schemaName || 'public']
            );
            const uniqueColumns = new Set(uniqueResult.rows.map(row => row.attname));

            // Fetch indexed columns
            const indexResult = await client.query(
                `SELECT DISTINCT a.attname
                 FROM pg_index i
                 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                 JOIN pg_class t ON t.oid = i.indrelid
                 JOIN pg_namespace n ON n.oid = t.relnamespace
                 WHERE t.relname = $1 AND n.nspname = $2 AND NOT i.indisprimary`,
                [tableName, schemaName || 'public']
            );
            const indexedColumns = new Set(indexResult.rows.map(row => row.attname));

            // Fetch foreign key information
            // Using a simpler, more reliable query that doesn't rely on array operations
            const fkResult = await client.query(
                `SELECT
                    a.attname as column_name,
                    t2.relname as referenced_table,
                    n2.nspname as referenced_schema,
                    a2.attname as referenced_column
                 FROM pg_constraint c
                 JOIN pg_class t ON t.oid = c.conrelid
                 JOIN pg_namespace n ON n.oid = t.relnamespace
                 JOIN pg_class t2 ON t2.oid = c.confrelid
                 JOIN pg_namespace n2 ON n2.oid = t2.relnamespace,
                 LATERAL (SELECT unnest(c.conkey) as conkey_val) fk,
                 LATERAL (SELECT unnest(c.confkey) as confkey_val) rf,
                 pg_attribute a,
                 pg_attribute a2
                 WHERE t.relname = $1 
                   AND n.nspname = $2 
                   AND c.contype = 'f'
                   AND a.attrelid = c.conrelid 
                   AND a.attnum = fk.conkey_val
                   AND a2.attrelid = c.confrelid
                   AND a2.attnum = rf.confkey_val
                   AND fk.conkey_val = rf.confkey_val`,
                [tableName, schemaName || 'public']
            );
            console.log(`[DataEditor] FK query returned ${fkResult.rows.length} rows for ${schemaName}.${tableName}`);
            const foreignKeys: Record<string, { referencedSchema: string; referencedTable: string; referencedColumn: string }> = {};
            for (const row of fkResult.rows) {
                console.log(`[DataEditor] FK found: ${row.column_name} -> ${row.referenced_schema}.${row.referenced_table}.${row.referenced_column}`);
                foreignKeys[row.column_name] = {
                    referencedSchema: row.referenced_schema,
                    referencedTable: row.referenced_table,
                    referencedColumn: row.referenced_column
                };
            }
            console.log(`[DataEditor] Final FK map:`, Object.keys(foreignKeys));

            // Enrich columns with constraint and index information
            columns = columns.map(col => {
                const enriched = {
                    ...col,
                    isUnique: uniqueColumns.has(col.name),
                    isIndexed: indexedColumns.has(col.name),
                    foreignKey: foreignKeys[col.name]
                };
                if (col.name === 'conversation_id') {
                    console.log(`[DataEditor] Enriching conversation_id:`, enriched.foreignKey);
                }
                return enriched;
            });

            const offset = state.page * this.paginationSize;
            const qualifiedTable = `${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)}`;

            const { whereClause, values } = this.buildWhereClause(columns, state.filters, state.searchTerm);

            const columnNames = new Set(columns.map(column => column.name));
            let sort = state.sort;
            if (sort && !columnNames.has(sort.column)) {
                sort = null;
                state.sort = null;
            }
            const orderClause = sort
                ? `ORDER BY ${this.quoteIdentifier(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
                : '';

            const limitPlaceholder = `$${values.length + 1}`;
            const offsetPlaceholder = `$${values.length + 2}`;

            const clauseSegments = [whereClause, orderClause].filter(segment => segment.length > 0).join(' ');
            const clauseSql = clauseSegments.length > 0 ? ` ${clauseSegments}` : '';

            const dataQuery = `SELECT * FROM ${qualifiedTable}${clauseSql} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;
            const dataValues = [...values, this.paginationSize, offset];
            const dataResult = await client.query(dataQuery, dataValues);

            // Normalize returned values for JSON, arrays and enums so the
            // webview receives JS-native types (objects/arrays) rather than
            // Postgres textual representations.
            const normalizedRows: Record<string, unknown>[] = dataResult.rows.map((row: any) => {
                const copy: Record<string, unknown> = { ...row };
                for (const col of columns) {
                    const raw = row[col.name];
                    try {
                        // JSON / JSONB: ensure JS objects rather than raw strings
                        if (col.type === 'json' || col.type === 'jsonb') {
                            if (typeof raw === 'string') {
                                try {
                                    copy[col.name] = JSON.parse(raw);
                                } catch {
                                    copy[col.name] = raw;
                                }
                            } else {
                                copy[col.name] = raw;
                            }
                            continue;
                        }

                        // Array types: attempt to convert Postgres array literals
                        // into JS arrays if driver returned them as strings.
                        if (String(col.type).endsWith('[]')) {
                            if (Array.isArray(raw)) {
                                copy[col.name] = raw;
                                continue;
                            }
                            if (typeof raw === 'string') {
                                try {
                                    const parsed = JSON.parse(raw);
                                    if (Array.isArray(parsed)) {
                                        copy[col.name] = parsed;
                                        continue;
                                    }
                                } catch {
                                    // fall through to Postgres literal parser
                                }
                                // Use centralized parser
                                copy[col.name] = parsePostgresArrayLiteral(raw, col.type);
                                continue;
                            }
                        }

                        // Enums are returned as strings already; leave as-is.
                        copy[col.name] = raw;
                    } catch (err) {
                        // Best-effort: leave original raw value if any conversion fails
                        copy[col.name] = raw;
                    }
                }
                return copy;
            });

            const countQuery = `SELECT COUNT(*)::int AS total FROM ${qualifiedTable}${whereClause ? ` ${whereClause}` : ''}`;
            const countResult = await client.query(countQuery, values);

            const totalRows: number = countResult.rows[0]?.total ?? dataResult.rowCount ?? 0;

            const prefs = await this.loadTablePreferences(schemaName, tableName);

            return {
                schemaName,
                tableName,
                columns,
                primaryKey,
                // Return normalized rows (JSON/arrays/enums converted) so the
                // webview always receives JS-native types rather than raw driver values.
                rows: normalizedRows,
                currentPage: state.page,
                totalRows,
                paginationSize: this.paginationSize,
                sort: state.sort,
                filters: state.filters,
                searchTerm: state.searchTerm,
                tablePreferences: prefs
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table data: ${error}`);
            return null;
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async handleMessage(
        message: WebviewToExtensionMessage,
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        try {
            switch (message.command) {
                case 'loadPage': {
                    const page = Math.max(0, Number(message.pageNumber ?? 0));
                    await this.loadTableData(panel, connectionId, schemaName, tableName, page);
                    break;
                }
                case 'executeChanges': {
                    const changes = Array.isArray(message.changes) ? message.changes : [];
                    const batchMode = Boolean(message.batchMode);
                    const bypassValidation = Boolean(message.bypassValidation);
                    await this.executeChanges(
                        panel,
                        connectionId,
                        schemaName,
                        tableName,
                        changes,
                        batchMode,
                        bypassValidation
                    );
                    break;
                }
                case 'previewChanges': {
                    const changes = Array.isArray(message.changes) ? message.changes : [];
                    await this.previewSql(
                        panel,
                        schemaName,
                        tableName,
                        changes
                    );
                    break;
                }
                case 'search': {
                    const state = this.getPanelState(panel);
                    const rawTerm = typeof message.term === 'string' ? message.term : '';
                    state.searchTerm = rawTerm ?? '';
                    state.page = 0;
                    await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
                    break;
                }
                case 'applySort': {
                    const nextSort = message.sort ?? null;
                    const state = this.getPanelState(panel);
                    state.sort = nextSort && nextSort.column && nextSort.direction ? nextSort : null;
                    state.page = 0;
                    await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
                    break;
                }
                case 'applyFilters': {
                    const incoming = message.filters ?? {};
                    const normalized: FilterMap = {};
                    for (const [key, value] of Object.entries(incoming)) {
                        if (typeof value === 'string') {
                            normalized[key] = value;
                        }
                    }
                    const state = this.getPanelState(panel);
                    state.filters = normalized;
                    state.page = 0;
                    await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
                    break;
                }
                case 'applyFilters': {
                    const incoming = message.filters ?? {};
                    const normalized: FilterMap = {};
                    for (const [key, value] of Object.entries(incoming)) {
                        if (typeof value === 'string') {
                            normalized[key] = value;
                        }
                    }
                    const state = this.getPanelState(panel);
                    state.filters = normalized;
                    state.page = 0;
                    await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
                    break;
                }
                case 'refresh': {
                    const state = this.getPanelState(panel);
                    await this.loadTableData(panel, connectionId, schemaName, tableName, state.page);
                    break;
                }
                case 'saveTablePreferences': {
                    const prefs = message.prefs ?? {};
                    await this.saveTablePreferences(panel, schemaName, tableName, prefs);
                    break;
                }
                case 'resetTablePreferences': {
                    await this.resetTablePreferences(panel, schemaName, tableName);
                    break;
                }
                case 'openIndexManager': {
                    // Open the index manager for this table
                    const indexManagerView = new IndexManagerView(this.context, this.connectionManager);
                    const mockItem: Partial<DatabaseTreeItem> = {
                        connectionId,
                        schemaName,
                        tableName,
                        type: 'table'
                    };
                    await indexManagerView.openIndexManager(mockItem as DatabaseTreeItem);
                    break;
                }
                case 'loadForeignKeyRows': {
                    // Load rows from the foreign key referenced table
                    console.log(`[DataEditor] Received loadForeignKeyRows for ${schemaName}.${tableName}.${message.columnName}`);
                    await this.loadForeignKeyRows(panel, connectionId, schemaName, tableName, message.columnName);
                    break;
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorInfo = {
                message: errorMsg,
                stack: error instanceof Error ? error.stack : undefined
            };
            const webviewError: ExtensionToWebviewMessage = {
                command: 'webviewError',
                error: errorInfo
            };
            panel.webview.postMessage(webviewError);
        }
    }

    private async executeChanges(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        changes: GridChange[],
        batchMode: boolean,
        bypassValidation: boolean = false
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            panel.webview.postMessage({ command: 'executionComplete', success: false, error: 'No connection available' });
            return;
        }

        if (changes.length === 0) {
            panel.webview.postMessage({ command: 'showMessage', text: 'No pending changes to execute.' });
            panel.webview.postMessage({ command: 'executionComplete', success: true });
            return;
        }

        // Perform server-side validation to guard against obvious
        // client-side bypasses (e.g. non-numeric values for numeric columns)
        // unless the user explicitly requested to bypass validation.
        if (!bypassValidation) {
            try {
                const { validateChangesAgainstSchema } = await import('./sqlValidator');
                // Use cached schema metadata when possible to speed up validation.
                const cacheKey = `${connectionId}:${schemaName}.${tableName}`;
                const cached = this.schemaCache.get(cacheKey);
                let validationErrors: string[] = [];
                if (cached) {
                    // If cached, the validator can rely on the provided client but
                    // may avoid querying type OIDs for enums; pass through as normal
                    validationErrors = await validateChangesAgainstSchema(client, schemaName, tableName, changes);
                } else {
                    validationErrors = await validateChangesAgainstSchema(client, schemaName, tableName, changes);
                }
                if (validationErrors.length > 0) {
                    const message = `Validation failed:\n${validationErrors.join('\n')}`;
                    panel.webview.postMessage({ command: 'executionComplete', success: false, error: message });
                    return;
                }
            } catch (validationErr) {
                // If validation infrastructure fails, surface a readable error
                const m = validationErr instanceof Error ? validationErr.message : String(validationErr);
                panel.webview.postMessage({ command: 'executionComplete', success: false, error: `Validation step failed: ${m}` });
                return;
            }
        }

        this.connectionManager.markBusy(connectionId);

        try {
            // Always use batch mode (transactions) for data safety
            await client.query('BEGIN');

            for (const change of changes) {
                const sql = SqlGenerator.generateSql(schemaName, tableName, change);
                await client.query(sql.query, sql.values);
            }

            await client.query('COMMIT');

            panel.webview.postMessage({ command: 'executionComplete', success: true });
            await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Failed to rollback transaction', rollbackError);
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to execute changes: ${errorMessage}`);
            panel.webview.postMessage({ command: 'executionComplete', success: false, error: errorMessage });
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async previewSql(
        panel: vscode.WebviewPanel,
        schemaName: string,
        tableName: string,
        changes: GridChange[]
    ): Promise<void> {
        if (changes.length === 0) {
            panel.webview.postMessage({ command: 'sqlPreview', payload: '/* No changes to preview */' });
            return;
        }

        let payload: string;
        try {
            const statements = changes.map(change => {
                const sql = SqlGenerator.generateSql(schemaName, tableName, change);
                const formatted = this.formatSqlForDisplay(sql.query);
                return SqlGenerator.formatSqlWithValues(formatted, sql.values);
            });
            payload = statements.join(';\n\n');
        } catch (err) {
            payload = `/* Failed to generate SQL: ${err instanceof Error ? err.message : String(err)} */`;
        }

    const isError = typeof payload === 'string' && payload.startsWith('/* Failed to generate SQL');
    panel.webview.postMessage({ command: 'sqlPreview', payload, error: isError });
    }

    private formatSqlForDisplay(query: string): string {
        // Format SQL with proper indentation for readability in preview
        // INSERT INTO ... (\n  ...\n) VALUES (\n  ...\n)
        // UPDATE ... SET\n  ...\nWHERE\n  ...
        // DELETE FROM ... WHERE\n  ...
        
        let formatted = query;
        
        // Format INSERT
        formatted = formatted.replace(
            /INSERT INTO (\S+) \(([^)]+)\) VALUES \(([^)]+)\)/i,
            (match, table, cols, vals) => {
                return `INSERT INTO ${table}\n  (${cols})\nVALUES\n  (${vals})`;
            }
        );
        
        // Format UPDATE with SET and WHERE
        formatted = formatted.replace(
            /UPDATE (\S+) SET (.+) WHERE (.+)/i,
            (match, table, setClauses, whereClause) => {
                // Split SET clauses by comma
                const sets = setClauses.split(',').map((s: string) => s.trim()).join(',\n  ');
                // Split WHERE clauses by AND
                const wheres = whereClause.split(' AND ').map((w: string) => w.trim()).join('\n  AND ');
                return `UPDATE ${table}\nSET\n  ${sets}\nWHERE\n  ${wheres}`;
            }
        );
        
        // Format DELETE with WHERE
        formatted = formatted.replace(
            /DELETE FROM (\S+) WHERE (.+)/i,
            (match, table, whereClause) => {
                const wheres = whereClause.split(' AND ').map((w: string) => w.trim()).join('\n  AND ');
                return `DELETE FROM ${table}\nWHERE\n  ${wheres}`;
            }
        );
        
        return formatted;
    }

    private buildWebviewHtml(webview: vscode.Webview, state: TableStatePayload): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'data-editor', 'main.js')
        );
        const baseStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.css')
        );
        const appStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css')
        );

        const nonce = this.getNonce();
        const initialState = JSON.stringify(state).replace(/</g, '\\u003c');
        const cspSource = webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; font-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${state.schemaName}.${state.tableName}</title>
    <link rel="stylesheet" href="${baseStyleUri}">
    <link rel="stylesheet" href="${appStyleUri}">
</head>
<body>
    <div id="app">Loading…</div>
    <script nonce="${nonce}">
        window.initialState = ${initialState};
        window.acquireVsCodeApi = acquireVsCodeApi;
    </script>
    <script src="${scriptUri}" nonce="${nonce}" type="module"></script>
</body>
</html>`;
    }

    private quoteIdentifier(value: string): string {
        return '"' + value.replace(/"/g, '""') + '"';
    }

    private buildWhereClause(
        columns: ColumnInfo[],
        filters: FilterMap,
        searchTerm: string
    ): { whereClause: string; values: unknown[] } {
        const clauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;
        const validColumns = new Set(columns.map(column => column.name));

        for (const [columnName, rawValue] of Object.entries(filters ?? {})) {
            if (!validColumns.has(columnName)) {
                continue;
            }
            const value = typeof rawValue === 'string' ? rawValue.trim() : '';
            if (!value) {
                continue;
            }
            const placeholder = `$${paramIndex++}`;
            clauses.push(`CAST(${this.quoteIdentifier(columnName)} AS TEXT) ILIKE ${placeholder}`);
            values.push(`%${value}%`);
        }

        const searchValue = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        if (searchValue) {
            const placeholderIndex = paramIndex++;
            const placeholder = `$${placeholderIndex}`;
            const columnClauses = columns.map(column => `CAST(${this.quoteIdentifier(column.name)} AS TEXT) ILIKE ${placeholder}`);
            clauses.push(`(${columnClauses.join(' OR ')})`);
            values.push(`%${searchValue}%`);
        }

        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        return { whereClause, values };
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }

    /**
     * Basic Postgres array literal parser. Converts strings like
     * '{a,b,"c,d",NULL}' into JS arrays. This is intentionally
     * lightweight and aimed at common use-cases (text/number arrays).
     */
    // parsePostgresArrayLiteral and castArrayElement moved to src/pgUtils.ts

    // New message handlers for table preferences
    private async saveTablePreferences(panel: vscode.WebviewPanel, schemaName: string, tableName: string, prefs: any) {
        // Persist preferences into globalState keyed by table identifier
        const key = `tablePrefs:${schemaName}.${tableName}`;
        try {
            await this.context.globalState.update(key, prefs);
            panel.webview.postMessage({ command: 'saveTablePreferencesResult', payload: { success: true } });
        } catch (err) {
            panel.webview.postMessage({ command: 'saveTablePreferencesResult', payload: { success: false, error: String(err) } });
        }
    }

    private async loadTablePreferences(schemaName: string, tableName: string) {
        const key = `tablePrefs:${schemaName}.${tableName}`;
        return this.context.globalState.get<any>(key, {});
}

    private async resetTablePreferences(panel: vscode.WebviewPanel, schemaName: string, tableName: string) {
        const key = `tablePrefs:${schemaName}.${tableName}`;
        try {
            await this.context.globalState.update(key, undefined);
            panel.webview.postMessage({ command: 'resetTablePreferencesResult', payload: { success: true } });
        } catch (err) {
            panel.webview.postMessage({ command: 'resetTablePreferencesResult', payload: { success: false, error: String(err) } });
        }
    }

    private async loadForeignKeyRows(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        columnName: string
    ): Promise<void> {
        console.log(`[DataEditor] loadForeignKeyRows called for ${schemaName}.${tableName}.${columnName}`);
        try {
            const client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                console.log('[DataEditor] No client available');
                panel.webview.postMessage({
                    command: 'webviewError',
                    error: { message: 'No active connection available' }
                });
                return;
            }

            this.connectionManager.markBusy(connectionId);

            // First, get the column info to find the FK reference
            const cacheKey = `${connectionId}:${schemaName}.${tableName}`;
            console.log(`[DataEditor] Looking for cache key: ${cacheKey}`);
            const cached = this.schemaCache.get(cacheKey);
            let column: ColumnInfo | undefined;

            if (cached) {
                console.log(`[DataEditor] Cache found, searching for column ${columnName}`);
                column = cached.columns.find(c => c.name === columnName);
                console.log(`[DataEditor] Column found:`, column ? 'yes' : 'no', column?.foreignKey);
            } else {
                // If not cached, we need to look it up
                // For now, just return an error
                console.log('[DataEditor] Cache not found for key:', cacheKey);
                console.log('[DataEditor] Available cache keys:', Array.from(this.schemaCache.keys()));
                panel.webview.postMessage({
                    command: 'webviewError',
                    error: { message: 'Column information not available' }
                });
                return;
            }

            if (!column || !column.foreignKey) {
                console.log('[DataEditor] Column is not a foreign key or column not found');
                panel.webview.postMessage({
                    command: 'webviewError',
                    error: { message: 'Column is not a foreign key' }
                });
                return;
            }

            const { referencedSchema, referencedTable, referencedColumn } = column.foreignKey;
            console.log(`[DataEditor] FK references: ${referencedSchema}.${referencedTable}.${referencedColumn}`);

            // Query the referenced table to get rows (limit to 1000 for performance)
            const quotedSchema = `"${referencedSchema}"`;
            const quotedTable = `"${referencedTable}"`;
            const query = `SELECT * FROM ${quotedSchema}.${quotedTable} LIMIT 1000`;
            console.log(`[DataEditor] Executing query: ${query}`);

            const result = await client.query(query);
            const rows = result.rows || [];
            console.log(`[DataEditor] Query returned ${rows.length} rows`);

            // Find the primary key of the referenced table to return it
            const pkResult = await client.query(
                `SELECT a.attname
                 FROM pg_index i
                 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                 JOIN pg_class t ON t.oid = i.indrelid
                 JOIN pg_class idx ON idx.oid = i.indexrelid
                 JOIN pg_namespace n ON n.oid = t.relnamespace
                 WHERE n.nspname = $1 AND t.relname = $2 AND i.indisprimary
                 ORDER BY a.attnum`,
                [referencedSchema, referencedTable]
            );

            let pkColumn = referencedColumn;
            if (pkResult.rows && pkResult.rows.length > 0) {
                pkColumn = (pkResult.rows[0] as any).attname;
            }
            console.log(`[DataEditor] Using PK column: ${pkColumn}`);

            console.log('[DataEditor] Sending foreignKeyRows message to webview');
            panel.webview.postMessage({
                command: 'foreignKeyRows',
                rows,
                pkColumn
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log('[DataEditor] Error loading FK rows:', errorMsg);
            panel.webview.postMessage({
                command: 'webviewError',
                error: { message: `Failed to load foreign key rows: ${errorMsg}` }
            });
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

}