// dataEditor.ts - Manages the webview for editing table data

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { SqlGenerator } from './sqlGenerator';

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

interface PrimaryKeyInfo {
    columns: string[];
}

interface SortDescriptor {
    column: string;
    direction: 'asc' | 'desc';
}

type FilterMap = Record<string, string>;

interface PanelState {
    page: number;
    sort: SortDescriptor | null;
    filters: FilterMap;
    searchTerm: string;
}

interface TableStatePayload {
    schemaName: string;
    tableName: string;
    columns: ColumnInfo[];
    primaryKey: PrimaryKeyInfo;
    rows: Record<string, unknown>[];
    currentPage: number;
    totalRows: number;
    paginationSize: number;
    batchMode: boolean;
    sort: SortDescriptor | null;
    filters: FilterMap;
    searchTerm: string;
}

interface GridChangeInsert {
    type: 'insert';
    data: Record<string, unknown>;
}

interface GridChangeUpdate {
    type: 'update';
    data: Record<string, unknown>;
    where: Record<string, unknown>;
}

interface GridChangeDelete {
    type: 'delete';
    where: Record<string, unknown>;
}

type GridChange = GridChangeInsert | GridChangeUpdate | GridChangeDelete;

interface WebviewMessage {
    command: string;
    payload?: unknown;
    [key: string]: unknown;
}

export class DataEditor {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly initializedPanels = new Set<vscode.WebviewPanel>();
    private readonly panelState = new Map<vscode.WebviewPanel, PanelState>();
    private paginationSize = 100;
    private batchMode = true;

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

        const messageDisposable = panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
            await this.handleMessage(message, panel, connectionId, schemaName, tableName);
        });
        this.context.subscriptions.push(messageDisposable);

        panel.onDidDispose(() => {
            messageDisposable.dispose();
            this.panels.delete(panelKey);
            this.initializedPanels.delete(panel);
            this.panelState.delete(panel);
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
            const columnsResult = await client.query(
                `SELECT column_name, data_type, is_nullable
                 FROM information_schema.columns
                 WHERE table_schema = $1 AND table_name = $2
                 ORDER BY ordinal_position`,
                [schemaName, tableName]
            );

            const columns: ColumnInfo[] = columnsResult.rows.map(row => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES'
            }));

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

            const countQuery = `SELECT COUNT(*)::int AS total FROM ${qualifiedTable}${whereClause ? ` ${whereClause}` : ''}`;
            const countResult = await client.query(countQuery, values);

            const totalRows: number = countResult.rows[0]?.total ?? dataResult.rowCount ?? 0;

            return {
                schemaName,
                tableName,
                columns,
                primaryKey,
                rows: dataResult.rows,
                currentPage: state.page,
                totalRows,
                paginationSize: this.paginationSize,
                batchMode: this.batchMode,
                sort: state.sort,
                filters: state.filters,
                searchTerm: state.searchTerm
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table data: ${error}`);
            return null;
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async handleMessage(
        message: WebviewMessage,
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }

        const { command, payload } = message;

        switch (command) {
            case 'loadPage': {
                const page = Math.max(0, Number((payload as { page?: number })?.page ?? 0));
                await this.loadTableData(panel, connectionId, schemaName, tableName, page);
                break;
            }
            case 'executeChanges': {
                const changes = Array.isArray((payload as { changes?: GridChange[] })?.changes)
                    ? (payload as { changes?: GridChange[] }).changes ?? []
                    : [];
                const batchMode = Boolean((payload as { batchMode?: boolean })?.batchMode);
                await this.executeChanges(
                    panel,
                    connectionId,
                    schemaName,
                    tableName,
                    changes,
                    batchMode
                );
                break;
            }
            case 'previewSql': {
                const changes = Array.isArray((payload as { changes?: GridChange[] })?.changes)
                    ? (payload as { changes?: GridChange[] }).changes ?? []
                    : [];
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
                const rawTerm = typeof (payload as { searchTerm?: unknown })?.searchTerm === 'string'
                    ? (payload as { searchTerm?: string }).searchTerm
                    : '';
                state.searchTerm = rawTerm ?? '';
                state.page = 0;
                await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
                break;
            }
            case 'applySort': {
                const nextSort = (payload as { sort?: SortDescriptor | null })?.sort ?? null;
                const state = this.getPanelState(panel);
                state.sort = nextSort && nextSort.column && nextSort.direction ? nextSort : null;
                state.page = 0;
                await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
                break;
            }
            case 'applyFilters': {
                const incoming = (payload as { filters?: FilterMap })?.filters ?? {};
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
            default:
                break;
        }
    }

    private async executeChanges(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        changes: GridChange[],
        batchMode: boolean
    ): Promise<void> {
        this.batchMode = batchMode;

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

        this.connectionManager.markBusy(connectionId);

        try {
            if (batchMode) {
                await client.query('BEGIN');
            }

            for (const change of changes) {
                const sql = SqlGenerator.generateSql(schemaName, tableName, change);
                await client.query(sql.query, sql.values);
            }

            if (batchMode) {
                await client.query('COMMIT');
            }

            panel.webview.postMessage({ command: 'executionComplete', success: true });
            await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
        } catch (error) {
            if (batchMode) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Failed to rollback transaction', rollbackError);
                }
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

        const statements = changes.map(change => {
            const sql = SqlGenerator.generateSql(schemaName, tableName, change);
            return SqlGenerator.formatSqlWithValues(sql.query, sql.values);
        });

        panel.webview.postMessage({
            command: 'sqlPreview',
            payload: statements.join(';\n\n')
        });
    }

    private buildWebviewHtml(webview: vscode.Webview, state: TableStatePayload): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'data-editor', 'main.js')
        );
        const baseStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'clsx.css')
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
}