import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { quoteIdentifier } from './tableSqlBuilder';

interface SchemaDesignerColumnDraft {
    id: string;
    name: string;
    originalName: string | null;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    comment: string | null;
    isPrimaryKey: boolean;
    isNew: boolean;
    markedForDrop: boolean;
}

type SchemaDesignerConstraintType = 'index' | 'uniqueIndex' | 'foreignKey';

interface SchemaDesignerConstraintDraft {
    id: string;
    name: string;
    originalName: string | null;
    type: SchemaDesignerConstraintType;
    columns: string[];
    referencedSchema: string | null;
    referencedTable: string | null;
    referencedColumns: string[];
    onUpdate: string | null;
    onDelete: string | null;
    method: string | null;
    isNew: boolean;
    markedForDrop: boolean;
}

interface SchemaDesignerInitialPayload {
    view: 'schemaDesigner';
    schemaName: string;
    tableName: string;
    columns: SchemaDesignerColumnState[];
    constraints: SchemaDesignerConstraintState[];
    typeOptions: string[];
    indexMethodOptions: string[];
    primaryKey: {
        columns: string[];
        constraintName: string | null;
    };
}

interface SchemaDesignerColumnState {
    id: string;
    name: string;
    originalName: string | null;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    comment: string | null;
    isPrimaryKey: boolean;
    isNew: boolean;
    markedForDrop: boolean;
}

interface SchemaDesignerConstraintState {
    id: string;
    name: string;
    originalName: string | null;
    type: SchemaDesignerConstraintType;
    columns: string[];
    referencedSchema: string | null;
    referencedTable: string | null;
    referencedColumns: string[];
    onUpdate: string | null;
    onDelete: string | null;
    method: string | null;
    isNew: boolean;
    markedForDrop: boolean;
}

interface SchemaDesignerOriginalColumn {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    comment: string | null;
    isPrimaryKey: boolean;
}

interface SchemaDesignerOriginalState {
    columns: SchemaDesignerOriginalColumn[];
    constraints: SchemaDesignerConstraintState[];
    primaryKeyColumns: string[];
    primaryKeyConstraintName: string | null;
}

interface PreviewResult {
    statements: string[];
    warnings: string[];
}

interface PreviewMessagePayload {
    sql: string;
    warnings?: string[];
}

const COMMON_TYPES = [
    'bigint',
    'boolean',
    'bytea',
    'date',
    'double precision',
    'integer',
    'json',
    'jsonb',
    'numeric',
    'real',
    'serial',
    'smallint',
    'text',
    'timestamp without time zone',
    'timestamp with time zone',
    'uuid',
    'varchar(255)'
];

export class SchemaDesigner {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly originalState = new Map<vscode.WebviewPanel, SchemaDesignerOriginalState>();

    constructor(context: vscode.ExtensionContext, connectionManager: ConnectionManager) {
        this.context = context;
        this.connectionManager = connectionManager;
    }

    async openDesigner(item: DatabaseTreeItem): Promise<void> {
        if (!item || item.type !== 'table') {
            vscode.window.showErrorMessage('Schema designer must be opened from a table node.');
            return;
        }

        const { connectionId, schemaName, tableName } = item;
        if (!connectionId || !schemaName || !tableName) {
            vscode.window.showErrorMessage('Missing connection or table details for schema designer.');
            return;
        }

        const panelKey = this.buildPanelKey(connectionId, schemaName, tableName);
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.One);
            await this.loadStructure(existingPanel, connectionId, schemaName, tableName, true);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresSchemaDesigner',
            `Alter ${schemaName}.${tableName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
            }
        );

        this.panels.set(panelKey, panel);

        const disposable = panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(panel, connectionId, schemaName, tableName, message);
        });

        this.context.subscriptions.push(disposable);

        panel.onDidDispose(() => {
            disposable.dispose();
            this.panels.delete(panelKey);
            this.originalState.delete(panel);
        });

        await this.loadStructure(panel, connectionId, schemaName, tableName, false);
    }

    private buildPanelKey(connectionId: string, schemaName: string, tableName: string): string {
        return `${connectionId}:${schemaName}.${tableName}:schemaDesigner`;
    }

    private async loadStructure(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        postMessageOnly: boolean
    ): Promise<void> {
        const state = await this.fetchStructure(connectionId, schemaName, tableName);
        if (!state) {
            if (postMessageOnly) {
                panel.webview.postMessage({
                    command: 'executionError',
                    error: 'Failed to fetch table structure. Check your connection and try again.'
                });
            }
            return;
        }

        this.originalState.set(panel, {
            columns: state.columns.map(column => ({
                name: column.name,
                type: column.type,
                nullable: column.nullable,
                defaultValue: column.defaultValue,
                comment: column.comment,
                isPrimaryKey: column.isPrimaryKey
            })),
            constraints: state.constraints.map(constraint => ({
                id: constraint.id,
                name: constraint.name,
                originalName: constraint.originalName,
                type: constraint.type,
                columns: [...constraint.columns],
                referencedSchema: constraint.referencedSchema,
                referencedTable: constraint.referencedTable,
                referencedColumns: [...constraint.referencedColumns],
                onUpdate: constraint.onUpdate,
                onDelete: constraint.onDelete,
                method: constraint.method,
                isNew: false,
                markedForDrop: false
            })),
            primaryKeyColumns: state.primaryKey.columns,
            primaryKeyConstraintName: state.primaryKey.constraintName
        });

        if (postMessageOnly) {
            panel.webview.postMessage({ command: 'loadState', payload: state });
            return;
        }

        panel.webview.html = this.buildWebviewHtml(panel.webview, state);
    }

    private async fetchStructure(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<SchemaDesignerInitialPayload | null> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            vscode.window.showErrorMessage('No active PostgreSQL connection. Please connect and try again.');
            return null;
        }

        this.connectionManager.markBusy(connectionId);

        try {
            const columnsResult = await client.query(
                `SELECT
                    a.attnum,
                    a.attname AS column_name,
                    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                    NOT a.attnotnull AS is_nullable,
                    pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
                    pg_catalog.col_description(a.attrelid, a.attnum) AS comment,
                    EXISTS (
                        SELECT 1
                        FROM pg_index i
                        WHERE i.indrelid = a.attrelid
                          AND i.indisprimary
                          AND a.attnum = ANY(i.indkey)
                    ) AS is_primary
                FROM pg_attribute a
                LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                WHERE a.attrelid = $1::regclass
                  AND a.attnum > 0
                  AND NOT a.attisdropped
                ORDER BY a.attnum;
                `,
                [`${schemaName}.${tableName}`]
            );

            const constraintResult = await client.query(
                `SELECT conname
                 FROM pg_catalog.pg_constraint
                 WHERE contype = 'p'
                   AND conrelid = $1::regclass
                 LIMIT 1;`,
                [`${schemaName}.${tableName}`]
            );

                        const uniqueConstraintResult = await client.query(
                                `SELECT c.conname,
                                                array_agg(a.attname ORDER BY keys.ord) AS columns
                                 FROM pg_constraint c
                                 JOIN pg_class t ON t.oid = c.conrelid
                                 JOIN pg_namespace n ON n.oid = t.relnamespace
                                 JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS keys(attnum, ord) ON true
                                 JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = keys.attnum
                                 WHERE n.nspname = $1
                                     AND t.relname = $2
                                     AND c.contype = 'u'
                                 GROUP BY c.conname
                                 ORDER BY c.conname;`,
                                [schemaName, tableName]
                        );

                        const indexResult = await client.query(
                                `SELECT idx.relname AS index_name,
                                                i.indisunique AS is_unique,
                                                am.amname AS method,
                                                array_agg(a.attname ORDER BY keys.ord) AS columns
                                 FROM pg_index i
                                 JOIN pg_class t ON t.oid = i.indrelid
                                 JOIN pg_namespace n ON n.oid = t.relnamespace
                                 JOIN pg_class idx ON idx.oid = i.indexrelid
                                 JOIN pg_am am ON am.oid = idx.relam
                                 JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ord) ON true
                                 JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = keys.attnum
                                 LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
                                 WHERE n.nspname = $1
                                     AND t.relname = $2
                                     AND NOT i.indisprimary
                                     AND c.oid IS NULL
                                 GROUP BY idx.relname, i.indisunique, am.amname
                                 ORDER BY idx.relname;`,
                                [schemaName, tableName]
                        );

                        const foreignKeyResult = await client.query(
                                `SELECT c.conname,
                                                array_agg(src.attname ORDER BY keys.ord) AS columns,
                                                n2.nspname AS referenced_schema,
                                                t2.relname AS referenced_table,
                                                array_agg(ref.attname ORDER BY keys.ord) AS referenced_columns,
                                                c.confupdtype,
                                                c.confdeltype
                                 FROM pg_constraint c
                                 JOIN pg_class t ON t.oid = c.conrelid
                                 JOIN pg_namespace n ON n.oid = t.relnamespace
                                 JOIN pg_class t2 ON t2.oid = c.confrelid
                                 JOIN pg_namespace n2 ON n2.oid = t2.relnamespace
                                 JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS keys(src_attnum, ref_attnum, ord) ON true
                                 JOIN pg_attribute src ON src.attrelid = t.oid AND src.attnum = keys.src_attnum
                                 JOIN pg_attribute ref ON ref.attrelid = t2.oid AND ref.attnum = keys.ref_attnum
                                 WHERE n.nspname = $1
                                     AND t.relname = $2
                                     AND c.contype = 'f'
                                 GROUP BY c.conname, n2.nspname, t2.relname, c.confupdtype, c.confdeltype
                                 ORDER BY c.conname;`,
                                [schemaName, tableName]
                        );

                        const indexMethodResult = await client.query(
                                `SELECT amname
                                 FROM pg_am
                                 WHERE amtype = 'i'
                                 ORDER BY amname;`
                        );

            const columns: SchemaDesignerColumnState[] = columnsResult.rows.map((row: any, index: number) => ({
                id: `col-${index}-${row.column_name}`,
                name: row.column_name as string,
                originalName: row.column_name as string,
                type: row.data_type as string,
                nullable: Boolean(row.is_nullable),
                defaultValue: row.column_default ? String(row.column_default) : null,
                comment: row.comment ? String(row.comment) : null,
                isPrimaryKey: Boolean(row.is_primary),
                isNew: false,
                markedForDrop: false
            }));

            const typeOptions = Array.from(new Set([...COMMON_TYPES, ...columns.map(column => column.type)])).sort((a, b) => a.localeCompare(b));
            const indexMethodOptions = Array.from(new Set([
                'btree',
                ...indexMethodResult.rows.map((row: any) => String(row.amname))
            ])).sort((a, b) => a.localeCompare(b));

            const constraints: SchemaDesignerConstraintState[] = [];

            const normalizeConstraintColumns = (values: unknown): string[] => {
                const normalizeEntries = (entries: unknown[]): string[] => entries
                    .map(entry => String(entry ?? '').trim())
                    .filter(entry => entry.length > 0);

                if (Array.isArray(values)) {
                    return normalizeEntries(values);
                }

                if (typeof values === 'string') {
                    const trimmed = values.trim();
                    if (trimmed.length === 0) {
                        return [];
                    }

                    // Support postgres text[] literal fallback, e.g. {id,name}
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        const inner = trimmed.slice(1, -1);
                        if (inner.length === 0) {
                            return [];
                        }

                        return inner
                            .split(',')
                            .map(part => part.trim().replace(/^"|"$/g, ''))
                            .filter(part => part.length > 0);
                    }

                    return [trimmed];
                }

                return [];
            };

            for (const row of uniqueConstraintResult.rows) {
                const columns = normalizeConstraintColumns(row.columns);
                if (columns.length === 0) {
                    continue;
                }
                constraints.push({
                    id: `uk-${String(row.conname)}`,
                    name: String(row.conname),
                    originalName: String(row.conname),
                    type: 'uniqueIndex',
                    columns,
                    referencedSchema: null,
                    referencedTable: null,
                    referencedColumns: [],
                    onUpdate: null,
                    onDelete: null,
                    method: null,
                    isNew: false,
                    markedForDrop: false
                });
            }

            for (const row of indexResult.rows) {
                const columns = normalizeConstraintColumns(row.columns);
                if (columns.length === 0) {
                    continue;
                }
                constraints.push({
                    id: `idx-${String(row.index_name)}`,
                    name: String(row.index_name),
                    originalName: String(row.index_name),
                    type: Boolean(row.is_unique) ? 'uniqueIndex' : 'index',
                    columns,
                    referencedSchema: null,
                    referencedTable: null,
                    referencedColumns: [],
                    onUpdate: null,
                    onDelete: null,
                    method: row.method ? String(row.method) : 'btree',
                    isNew: false,
                    markedForDrop: false
                });
            }

            for (const row of foreignKeyResult.rows) {
                const columns = normalizeConstraintColumns(row.columns);
                const referencedColumns = normalizeConstraintColumns(row.referenced_columns);
                if (columns.length === 0 || referencedColumns.length === 0) {
                    continue;
                }
                constraints.push({
                    id: `fk-${String(row.conname)}`,
                    name: String(row.conname),
                    originalName: String(row.conname),
                    type: 'foreignKey',
                    columns,
                    referencedSchema: row.referenced_schema ? String(row.referenced_schema) : null,
                    referencedTable: row.referenced_table ? String(row.referenced_table) : null,
                    referencedColumns,
                    onUpdate: this.decodeForeignKeyAction(row.confupdtype),
                    onDelete: this.decodeForeignKeyAction(row.confdeltype),
                    method: null,
                    isNew: false,
                    markedForDrop: false
                });
            }

            const primaryKeyColumns = columns.filter(column => column.isPrimaryKey).map(column => column.name);
            const constraintName = constraintResult.rows[0]?.conname ? String(constraintResult.rows[0].conname) : null;

            return {
                view: 'schemaDesigner',
                schemaName,
                tableName,
                columns,
                constraints,
                typeOptions,
                indexMethodOptions,
                primaryKey: {
                    columns: primaryKeyColumns,
                    constraintName
                }
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table structure: ${error}`);
            return null;
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private buildWebviewHtml(webview: vscode.Webview, state: SchemaDesignerInitialPayload): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'schema-designer', 'main.js')
        );
        const baseStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'app.css')
        );
        const appStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main2.css')
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
    <title>Alter ${state.schemaName}.${state.tableName}</title>
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

    private async handleMessage(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        message: any
    ): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }

        switch (message.command) {
            case 'requestPreview': {
                const drafts = this.normalizeDrafts(message.payload);
                const constraints = this.normalizeConstraints(message.payload);
                const preview = this.buildPreview(schemaName, tableName, panel, drafts, constraints);
                const sql = this.formatPreview(preview.statements);
                const payload: PreviewMessagePayload = {
                    sql,
                    warnings: preview.warnings.length > 0 ? preview.warnings : undefined
                };
                panel.webview.postMessage({ command: 'sqlPreview', payload });
                break;
            }
            case 'executeSchemaChanges': {
                const drafts = this.normalizeDrafts(message.payload);
                const constraints = this.normalizeConstraints(message.payload);
                const useManualSql = Boolean(message.payload?.useManualSql);
                const manualSql = typeof message.payload?.sql === 'string' ? message.payload.sql : '';
                await this.executeChanges(panel, connectionId, schemaName, tableName, drafts, constraints, useManualSql, manualSql);
                break;
            }
            case 'refreshStructure': {
                await this.loadStructure(panel, connectionId, schemaName, tableName, true);
                break;
            }
            default:
                break;
        }
    }

    private normalizeDrafts(payload: any): SchemaDesignerColumnDraft[] {
        if (!payload || typeof payload !== 'object') {
            return [];
        }
        const columns = Array.isArray(payload.columns) ? payload.columns : [];
        return columns.map((column: any) => ({
            id: String(column.id ?? ''),
            name: String(column.name ?? ''),
            originalName: column.originalName != null ? String(column.originalName) : null,
            type: String(column.type ?? ''),
            nullable: Boolean(column.nullable),
            defaultValue: column.defaultValue != null && String(column.defaultValue).trim().length > 0
                ? String(column.defaultValue)
                : null,
            comment: column.comment != null && String(column.comment).trim().length > 0
                ? String(column.comment)
                : null,
            isPrimaryKey: Boolean(column.isPrimaryKey),
            isNew: Boolean(column.isNew),
            markedForDrop: Boolean(column.markedForDrop)
        }));
    }

    private normalizeConstraints(payload: any): SchemaDesignerConstraintDraft[] {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const constraints = Array.isArray(payload.constraints) ? payload.constraints : [];
        return constraints.map((constraint: any) => ({
            id: String(constraint.id ?? ''),
            name: String(constraint.name ?? ''),
            originalName: constraint.originalName != null ? String(constraint.originalName) : null,
            type: this.normalizeConstraintType(constraint.type),
            columns: this.normalizeStringArray(constraint.columns),
            referencedSchema: this.normalizeOptionalString(constraint.referencedSchema),
            referencedTable: this.normalizeOptionalString(constraint.referencedTable),
            referencedColumns: this.normalizeStringArray(constraint.referencedColumns),
            onUpdate: this.normalizeOptionalString(constraint.onUpdate),
            onDelete: this.normalizeOptionalString(constraint.onDelete),
            method: this.normalizeOptionalString(constraint.method),
            isNew: Boolean(constraint.isNew),
            markedForDrop: Boolean(constraint.markedForDrop)
        }));
    }

    private buildPreview(
        schemaName: string,
        tableName: string,
        panel: vscode.WebviewPanel,
        drafts: SchemaDesignerColumnDraft[],
        constraintDrafts: SchemaDesignerConstraintDraft[]
    ): PreviewResult {
        const original = this.originalState.get(panel);
        if (!original) {
            return { statements: [], warnings: ['Unable to determine current table structure. Reload and try again.'] };
        }

        const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
        const renameStatements: string[] = [];
        const typeStatements: string[] = [];
        const nullabilityStatements: string[] = [];
        const defaultStatements: string[] = [];
        const dropStatements: string[] = [];
        const addStatements: string[] = [];
        const commentStatements: string[] = [];
        const dropConstraintStatements: string[] = [];
        const createConstraintStatements: string[] = [];
        const warnings: string[] = [];

        const originalByName = new Map<string, SchemaDesignerOriginalColumn>();
        for (const column of original.columns) {
            originalByName.set(column.name, column);
        }

        for (const draft of drafts) {
            const trimmedName = draft.name.trim();
            const originalName = draft.originalName ?? null;
            const originalColumn = originalName ? originalByName.get(originalName) : undefined;

            if (!originalColumn && !draft.isNew) {
                // Unknown column – likely stale data.
                continue;
            }

            if (draft.isNew) {
                if (draft.markedForDrop || trimmedName.length === 0) {
                    continue;
                }
                const pieces = [
                    `ADD COLUMN ${quoteIdentifier(trimmedName)} ${draft.type}`
                ];
                if (!draft.nullable) {
                    pieces.push('NOT NULL');
                    if (!draft.defaultValue) {
                        warnings.push(`Column "${trimmedName}" is NOT NULL without a default value.`);
                    }
                }
                if (draft.defaultValue) {
                    pieces.push(`DEFAULT ${draft.defaultValue}`);
                }
                addStatements.push(`ALTER TABLE ${qualifiedTable} ${pieces.join(' ')};`);
                if (draft.comment) {
                    commentStatements.push(this.buildCommentStatement(schemaName, tableName, trimmedName, draft.comment));
                }
                continue;
            }

            if (!originalColumn) {
                continue;
            }

            if (draft.markedForDrop) {
                dropStatements.push(`ALTER TABLE ${qualifiedTable} DROP COLUMN ${quoteIdentifier(originalColumn.name)};`);
                continue;
            }

            if (originalColumn.name !== trimmedName && trimmedName.length > 0) {
                renameStatements.push(`ALTER TABLE ${qualifiedTable} RENAME COLUMN ${quoteIdentifier(originalColumn.name)} TO ${quoteIdentifier(trimmedName)};`);
            }

            const effectiveName = trimmedName.length > 0 ? trimmedName : originalColumn.name;

            if (originalColumn.type !== draft.type) {
                typeStatements.push(`ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quoteIdentifier(effectiveName)} TYPE ${draft.type};`);
                warnings.push(`Changing data type of column "${effectiveName}" may require data casting.`);
            }

            if (originalColumn.nullable !== draft.nullable) {
                nullabilityStatements.push(
                    draft.nullable
                        ? `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quoteIdentifier(effectiveName)} DROP NOT NULL;`
                        : `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quoteIdentifier(effectiveName)} SET NOT NULL;`
                );
            }

            if (!this.defaultsEqual(originalColumn.defaultValue, draft.defaultValue)) {
                if (draft.defaultValue) {
                    defaultStatements.push(`ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quoteIdentifier(effectiveName)} SET DEFAULT ${draft.defaultValue};`);
                } else {
                    defaultStatements.push(`ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quoteIdentifier(effectiveName)} DROP DEFAULT;`);
                }
            }

            if (!this.commentsEqual(originalColumn.comment, draft.comment)) {
                commentStatements.push(this.buildCommentStatement(schemaName, tableName, effectiveName, draft.comment));
            }
        }

        const newPrimaryColumns = drafts
            .filter(draft => draft.isPrimaryKey && !draft.markedForDrop && draft.name.trim().length > 0)
            .map(draft => draft.name.trim());

        const newPrimaryOriginalNames = new Set(
            drafts
                .filter(draft => draft.isPrimaryKey && !draft.markedForDrop && draft.name.trim().length > 0)
                .map(draft => (draft.originalName ?? draft.name).trim())
                .filter(name => name.length > 0)
        );

        const originalPrimarySet = new Set(original.primaryKeyColumns.map(name => name.trim()).filter(Boolean));
        const primaryKeyChanged = !this.setsEqual(originalPrimarySet, newPrimaryOriginalNames);

        const originalConstraintsByName = new Map<string, SchemaDesignerConstraintState>();
        for (const constraint of original.constraints) {
            originalConstraintsByName.set(constraint.name, constraint);
        }

        const incomingConstraintNames = new Set(
            constraintDrafts
                .map(constraint => (constraint.originalName ?? constraint.name).trim())
                .filter(name => name.length > 0)
        );

        for (const originalConstraint of original.constraints) {
            if (!incomingConstraintNames.has(originalConstraint.name)) {
                dropConstraintStatements.push(this.buildConstraintDropStatement(schemaName, tableName, originalConstraint));
            }
        }

        for (const draft of constraintDrafts) {
            const constraintName = draft.name.trim();
            const originalName = (draft.originalName ?? '').trim();
            const lookupName = originalName.length > 0 ? originalName : constraintName;
            const originalConstraint = originalConstraintsByName.get(lookupName);

            if (draft.markedForDrop) {
                if (originalConstraint) {
                    dropConstraintStatements.push(this.buildConstraintDropStatement(schemaName, tableName, originalConstraint));
                }
                continue;
            }

            if (!constraintName) {
                continue;
            }

            if (!this.isConstraintDraftValid(draft)) {
                warnings.push(`Constraint "${constraintName}" is incomplete and was skipped in SQL preview.`);
                continue;
            }

            if (!originalConstraint) {
                createConstraintStatements.push(this.buildConstraintCreateStatement(schemaName, tableName, draft));
                continue;
            }

            if (!this.constraintsEqual(originalConstraint, draft)) {
                dropConstraintStatements.push(this.buildConstraintDropStatement(schemaName, tableName, originalConstraint));
                createConstraintStatements.push(this.buildConstraintCreateStatement(schemaName, tableName, draft));
                if (draft.type === 'foreignKey') {
                    warnings.push(`Changing foreign key "${constraintName}" may fail if existing rows violate the new reference.`);
                }
            }
        }

        const statements: string[] = [];
        if (renameStatements.length > 0) {
            statements.push(...renameStatements);
        }
        if (typeStatements.length > 0) {
            statements.push(...typeStatements);
        }
        if (nullabilityStatements.length > 0) {
            statements.push(...nullabilityStatements);
        }
        if (defaultStatements.length > 0) {
            statements.push(...defaultStatements);
        }

        if (dropConstraintStatements.length > 0) {
            statements.push(...dropConstraintStatements);
        }

        let droppedConstraint = false;
        if (primaryKeyChanged && original.primaryKeyColumns.length > 0) {
            const constraintName = original.primaryKeyConstraintName ?? `${tableName}_pkey`;
            statements.push(`ALTER TABLE ${qualifiedTable} DROP CONSTRAINT ${quoteIdentifier(constraintName)};`);
            droppedConstraint = true;
        }

        if (dropStatements.length > 0) {
            statements.push(...dropStatements);
        }

        if (addStatements.length > 0) {
            statements.push(...addStatements);
        }

        if ((primaryKeyChanged || (droppedConstraint && newPrimaryColumns.length > 0)) && newPrimaryColumns.length > 0) {
            const constraintName = original.primaryKeyConstraintName ?? `${tableName}_pkey`;
            statements.push(
                `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quoteIdentifier(constraintName)} PRIMARY KEY (${newPrimaryColumns.map(name => quoteIdentifier(name)).join(', ')});`
            );
        }

        if (commentStatements.length > 0) {
            statements.push(...commentStatements);
        }

        if (createConstraintStatements.length > 0) {
            statements.push(...createConstraintStatements);
        }

        return {
            statements: statements.map(statement => statement.endsWith(';') ? statement.slice(0, -1) : statement),
            warnings
        };
    }

    private async executeChanges(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        drafts: SchemaDesignerColumnDraft[],
        constraints: SchemaDesignerConstraintDraft[],
        useManualSql: boolean,
        manualSql: string
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            panel.webview.postMessage({ command: 'executionComplete', success: false, error: 'No active connection.' });
            return;
        }

        if (useManualSql && manualSql.trim().length === 0) {
            panel.webview.postMessage({ command: 'executionComplete', success: false, error: 'Provide SQL to execute.' });
            return;
        }

        let statements: string[] = [];
        if (useManualSql) {
            statements = manualSql
                .split(';')
                .map(part => part.trim())
                .filter(Boolean);
        } else {
            const preview = this.buildPreview(schemaName, tableName, panel, drafts, constraints);
            statements = preview.statements;
        }

        if (statements.length === 0) {
            panel.webview.postMessage({ command: 'executionComplete', success: true });
            panel.webview.postMessage({ command: 'showMessage', text: 'No schema changes to apply.' });
            return;
        }

        this.connectionManager.markBusy(connectionId);

        try {
            await client.query('BEGIN');
            for (const statement of statements) {
                await client.query(statement);
            }
            await client.query('COMMIT');

            panel.webview.postMessage({ command: 'executionComplete', success: true });
            await this.loadStructure(panel, connectionId, schemaName, tableName, true);
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // Ignore rollback errors.
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to apply schema changes: ${errorMessage}`);
            panel.webview.postMessage({ command: 'executionComplete', success: false, error: errorMessage });
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private normalizeConstraintType(value: unknown): SchemaDesignerConstraintType {
        if (value === 'foreignKey' || value === 'uniqueIndex' || value === 'index') {
            return value;
        }
        return 'index';
    }

    private normalizeOptionalString(value: unknown): string | null {
        const text = typeof value === 'string' ? value.trim() : '';
        return text.length > 0 ? text : null;
    }

    private normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const normalized: string[] = [];
        for (const entry of value) {
            const text = typeof entry === 'string' ? entry.trim() : '';
            if (text.length > 0) {
                normalized.push(text);
            }
        }
        return normalized;
    }

    private normalizeForeignKeyAction(value: string | null): string {
        const normalized = (value ?? 'NO ACTION').trim().toUpperCase();
        if (normalized === 'RESTRICT' || normalized === 'CASCADE' || normalized === 'SET NULL' || normalized === 'SET DEFAULT') {
            return normalized;
        }
        return 'NO ACTION';
    }

    private isConstraintDraftValid(draft: SchemaDesignerConstraintDraft): boolean {
        if (draft.columns.length === 0 || draft.name.trim().length === 0) {
            return false;
        }
        if (draft.type !== 'foreignKey') {
            return true;
        }
        if (!draft.referencedSchema || !draft.referencedTable) {
            return false;
        }
        if (draft.referencedColumns.length === 0) {
            return false;
        }
        return draft.columns.length === draft.referencedColumns.length;
    }

    private decodeForeignKeyAction(value: unknown): string {
        const code = typeof value === 'string' ? value : '';
        switch (code) {
            case 'r':
                return 'RESTRICT';
            case 'c':
                return 'CASCADE';
            case 'n':
                return 'SET NULL';
            case 'd':
                return 'SET DEFAULT';
            case 'a':
            default:
                return 'NO ACTION';
        }
    }

    private constraintsEqual(original: SchemaDesignerConstraintState, draft: SchemaDesignerConstraintDraft): boolean {
        if (original.name !== draft.name.trim()) {
            return false;
        }
        if (original.type !== draft.type) {
            return false;
        }
        if (!this.arraysEqual(original.columns, draft.columns)) {
            return false;
        }

        if (draft.type === 'foreignKey') {
            return (original.referencedSchema ?? '') === (draft.referencedSchema ?? '')
                && (original.referencedTable ?? '') === (draft.referencedTable ?? '')
                && this.arraysEqual(original.referencedColumns, draft.referencedColumns)
                && this.normalizeForeignKeyAction(original.onUpdate) === this.normalizeForeignKeyAction(draft.onUpdate)
                && this.normalizeForeignKeyAction(original.onDelete) === this.normalizeForeignKeyAction(draft.onDelete);
        }

        if (draft.type === 'index') {
            return (original.method ?? 'btree').toLowerCase() === (draft.method ?? 'btree').toLowerCase();
        }

        if (draft.type === 'uniqueIndex') {
            if ((original.method ?? '') !== (draft.method ?? '')) {
                return false;
            }
        }

        return true;
    }

    private arraysEqual(a: string[], b: string[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i += 1) {
            if (a[i] !== b[i]) {
                return false;
            }
        }
        return true;
    }

    private buildConstraintDropStatement(
        schemaName: string,
        tableName: string,
        constraint: SchemaDesignerConstraintState
    ): string {
        if (constraint.type === 'index' || (constraint.type === 'uniqueIndex' && (constraint.method ?? '').trim().length > 0)) {
            return `DROP INDEX ${quoteIdentifier(schemaName)}.${quoteIdentifier(constraint.name)};`;
        }
        const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
        return `ALTER TABLE ${qualifiedTable} DROP CONSTRAINT ${quoteIdentifier(constraint.name)};`;
    }

    private buildConstraintCreateStatement(
        schemaName: string,
        tableName: string,
        constraint: SchemaDesignerConstraintDraft
    ): string {
        const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
        const columnList = constraint.columns.map(column => quoteIdentifier(column)).join(', ');

        if (constraint.type === 'foreignKey') {
            const referencedSchema = quoteIdentifier(constraint.referencedSchema ?? schemaName);
            const referencedTable = quoteIdentifier(constraint.referencedTable ?? '');
            const referencedColumns = constraint.referencedColumns.map(column => quoteIdentifier(column)).join(', ');
            const onUpdate = this.normalizeForeignKeyAction(constraint.onUpdate);
            const onDelete = this.normalizeForeignKeyAction(constraint.onDelete);
            return `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quoteIdentifier(constraint.name)} FOREIGN KEY (${columnList}) REFERENCES ${referencedSchema}.${referencedTable} (${referencedColumns}) ON UPDATE ${onUpdate} ON DELETE ${onDelete};`;
        }

        if (constraint.type === 'uniqueIndex') {
            if ((constraint.method ?? '').trim().length > 0) {
                const method = (constraint.method ?? 'btree').trim() || 'btree';
                return `CREATE UNIQUE INDEX ${quoteIdentifier(constraint.name)} ON ${qualifiedTable} USING ${method} (${columnList});`;
            }
            return `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quoteIdentifier(constraint.name)} UNIQUE (${columnList});`;
        }

        const method = (constraint.method ?? 'btree').trim() || 'btree';
        return `CREATE INDEX ${quoteIdentifier(constraint.name)} ON ${qualifiedTable} USING ${method} (${columnList});`;
    }

    private defaultsEqual(a: string | null, b: string | null): boolean {
        const normalize = (value: string | null): string => (value ?? '').trim();
        return normalize(a) === normalize(b);
    }

    private commentsEqual(a: string | null, b: string | null): boolean {
        return (a ?? '').trim() === (b ?? '').trim();
    }

    private buildCommentStatement(schemaName: string, tableName: string, columnName: string, comment: string | null): string {
        const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
        const literal = comment == null ? 'NULL' : `'${comment.replace(/'/g, "''")}'`;
        return `COMMENT ON COLUMN ${qualifiedTable}.${quoteIdentifier(columnName)} IS ${literal};`;
    }

    private formatPreview(statements: string[]): string {
        if (statements.length === 0) {
            return '/* No schema changes */';
        }
        return statements.map(statement => `${statement};`).join('\n\n');
    }

    private setsEqual(a: Set<string>, b: Set<string>): boolean {
        if (a.size !== b.size) {
            return false;
        }
        for (const value of a) {
            if (!b.has(value)) {
                return false;
            }
        }
        return true;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
