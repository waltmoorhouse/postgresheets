import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { buildCreateTableStatements } from './tableSqlBuilder';

interface CreateTableColumnDraft {
    id: string;
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    comment: string | null;
    isPrimaryKey: boolean;
}

interface CreateTablePreviewPayload {
    tableName: string;
    columns: CreateTableColumnDraft[];
}

interface PreviewResultMessage {
    sql: string;
    warnings?: string[];
    error?: string;
}

interface ExecutionResultMessage {
    success: boolean;
    error?: string;
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

export class CreateTableWizard {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly refreshTree: () => void;

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        refreshTree: () => void
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.refreshTree = refreshTree;
    }

    async openWizard(item?: DatabaseTreeItem): Promise<void> {
        if (!item || item.type !== 'schema') {
            vscode.window.showErrorMessage('Create Table must be invoked on a schema node.');
            return;
        }

        const { connectionId, schemaName } = item;
        if (!connectionId || !schemaName) {
            vscode.window.showErrorMessage('Missing schema connection details.');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresCreateTable',
            `Create Table in ${schemaName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
            }
        );

        const initialState = await this.buildInitialState(connectionId, schemaName);
        panel.webview.html = this.buildWebviewHtml(panel.webview, initialState);

        const disposable = panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'createTablePreview':
                    await this.handlePreview(panel, schemaName, message.payload);
                    break;
                case 'createTableExecute':
                    await this.handleExecute(panel, connectionId, schemaName, message.payload);
                    break;
                default:
                    break;
            }
        });

        panel.onDidDispose(() => disposable.dispose());
    }

    private async buildInitialState(connectionId: string, schemaName: string) {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('No active PostgreSQL connection.');
        }

        this.connectionManager.markBusy(connectionId);
        try {
            const result = await client.query<{ data_type: string }>(
                `SELECT DISTINCT data_type
                 FROM information_schema.columns
                 WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                 ORDER BY data_type
                 LIMIT 200;`
            );
            const typeOptions = Array.from(new Set([...COMMON_TYPES, ...result.rows.map(row => row.data_type)]))
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b));

            const defaultType = typeOptions.find(type => type.toLowerCase() === 'serial') ?? typeOptions[0] ?? 'text';

            return {
                view: 'createTable' as const,
                schemaName,
                suggestedTableName: 'new_table',
                typeOptions,
                columns: [
                    {
                        id: 'col-1',
                        name: 'id',
                        type: defaultType,
                        nullable: false,
                        defaultValue: null,
                        comment: null,
                        isPrimaryKey: true
                    }
                ]
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load column metadata: ${error}`);
            return {
                view: 'createTable' as const,
                schemaName,
                suggestedTableName: 'new_table',
                typeOptions: COMMON_TYPES,
                columns: []
            };
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private buildWebviewHtml(webview: vscode.Webview, state: any): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'create-table', 'main.js')
        );
        const baseStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.css')
        );
        const appStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main3.css')
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
    <title>Create table in ${state.schemaName}</title>
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

    private async handlePreview(panel: vscode.WebviewPanel, schemaName: string, payload: any): Promise<void> {
        const message: PreviewResultMessage = { sql: '/* Unable to build preview */' };
        try {
            const data = this.normalizePreviewPayload(payload);
            if (!data.tableName || data.columns.length === 0) {
                message.sql = '/* Provide a table name and at least one column */';
                panel.webview.postMessage({ command: 'createTablePreview', payload: message });
                return;
            }
            const result = buildCreateTableStatements(schemaName, data.tableName, data.columns);
            message.sql = result.statements.join('\n\n');
            if (result.warnings.length > 0) {
                message.warnings = result.warnings;
            }
        } catch (error) {
            message.sql = '/* Failed to build SQL preview */';
            message.error = error instanceof Error ? error.message : String(error);
        }
        panel.webview.postMessage({ command: 'createTablePreview', payload: message });
    }

    private normalizePreviewPayload(payload: any): CreateTablePreviewPayload {
        const tableName = typeof payload?.tableName === 'string' ? payload.tableName.trim() : '';
        const columnsInput = Array.isArray(payload?.columns) ? payload.columns : [];
        const columns: CreateTableColumnDraft[] = columnsInput.map((column: any) => ({
            id: String(column?.id ?? ''),
            name: String(column?.name ?? '').trim(),
            type: String(column?.type ?? '').trim(),
            nullable: Boolean(column?.nullable),
            defaultValue: column?.defaultValue != null && String(column.defaultValue).trim().length > 0
                ? String(column.defaultValue)
                : null,
            comment: column?.comment != null && String(column.comment).trim().length > 0
                ? String(column.comment)
                : null,
            isPrimaryKey: Boolean(column?.isPrimaryKey)
        }));
        return { tableName, columns };
    }

    private async handleExecute(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        payload: any
    ): Promise<void> {
        const message: ExecutionResultMessage = { success: false };
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            message.error = 'No active PostgreSQL connection.';
            panel.webview.postMessage({ command: 'createTableExecuteComplete', ...message });
            return;
        }

        const useManualSql = Boolean(payload?.useManualSql);
        const tableName = typeof payload?.tableName === 'string' ? payload.tableName.trim() : '';
        const previewData = this.normalizePreviewPayload(payload);

        let statements: string[] = [];
        if (useManualSql) {
            const sqlText = typeof payload?.sql === 'string' ? payload.sql : '';
            const fragments = sqlText
                .split(';')
                .map((part: string) => part.trim())
                .filter((fragment: string) => fragment.length > 0);
            statements = fragments;
            if (statements.length === 0) {
                message.error = 'Provide SQL to execute.';
                panel.webview.postMessage({ command: 'createTableExecuteComplete', ...message });
                return;
            }
        } else {
            if (!tableName || previewData.columns.length === 0) {
                message.error = 'Provide a table name and at least one column.';
                panel.webview.postMessage({ command: 'createTableExecuteComplete', ...message });
                return;
            }
            try {
                const result = buildCreateTableStatements(schemaName, tableName, previewData.columns);
                statements = result.statements;
            } catch (error) {
                message.error = error instanceof Error ? error.message : String(error);
                panel.webview.postMessage({ command: 'createTableExecuteComplete', ...message });
                return;
            }
        }

        this.connectionManager.markBusy(connectionId);
        try {
            await client.query('BEGIN');
            for (const statement of statements) {
                await client.query(statement);
            }
            await client.query('COMMIT');

            panel.webview.postMessage({ command: 'createTableExecuteComplete', success: true });
            vscode.window.showInformationMessage(`Table "${tableName || 'new table'}" created successfully.`);
            this.refreshTree();
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // Ignore rollback errors.
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to create table: ${errorMessage}`);
            panel.webview.postMessage({ command: 'createTableExecuteComplete', success: false, error: errorMessage });
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
