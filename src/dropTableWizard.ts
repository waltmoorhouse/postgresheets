import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { buildDropTableSql } from './tableSqlBuilder';

interface DropTablePreviewPayload {
    schemaName: string;
    tableName: string;
    cascade: boolean;
}

export class DropTableWizard {
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
        if (!item || item.type !== 'table') {
            vscode.window.showErrorMessage('Drop Table must be invoked on a table node.');
            return;
        }

        const { connectionId, schemaName, tableName } = item;
        if (!connectionId || !schemaName || !tableName) {
            vscode.window.showErrorMessage('Missing table details for drop workflow.');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresDropTable',
            `Drop ${schemaName}.${tableName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
            }
        );

        const initialState = {
            view: 'dropTable' as const,
            schemaName,
            tableName,
            defaultCascade: false,
            sql: buildDropTableSql(schemaName, tableName, false),
            warnings: [] as string[]
        };

        panel.webview.html = this.buildWebviewHtml(panel.webview, initialState);

        const disposable = panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'dropTablePreview':
                    await this.handlePreview(panel, schemaName, tableName, message.payload);
                    break;
                case 'dropTableExecute':
                    await this.handleExecute(panel, connectionId, schemaName, tableName, message.payload);
                    break;
                default:
                    break;
            }
        });

        panel.onDidDispose(() => disposable.dispose());
    }

    private buildWebviewHtml(webview: vscode.Webview, state: any): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'drop-table', 'main.js')
        );
        const baseStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.css')
        );
        const appStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main4.css')
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
    <title>Drop ${state.schemaName}.${state.tableName}</title>
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

    private async handlePreview(
        panel: vscode.WebviewPanel,
        schemaName: string,
        tableName: string,
        payload: any
    ): Promise<void> {
        const cascade = Boolean(payload?.cascade);
        const sql = buildDropTableSql(schemaName, tableName, cascade);
        const message = {
            sql,
            warnings: cascade
                ? ['Cascade will drop dependent objects such as views or foreign keys.']
                : undefined
        };
        panel.webview.postMessage({ command: 'dropTablePreview', payload: message });
    }

    private async handleExecute(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        payload: any
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            panel.webview.postMessage({ command: 'dropTableExecuteComplete', success: false, error: 'No active connection.' });
            return;
        }

        const cascade = Boolean(payload?.cascade);
        const sqlText = typeof payload?.sql === 'string' && payload.sql.trim().length > 0
            ? payload.sql
            : buildDropTableSql(schemaName, tableName, cascade);

        this.connectionManager.markBusy(connectionId);

        try {
            await client.query('BEGIN');
            const fragments = sqlText
                .split(';')
                .map((part: string) => part.trim())
                .filter((fragment: string) => fragment.length > 0);
            for (const statement of fragments) {
                await client.query(statement);
            }
            await client.query('COMMIT');

            panel.webview.postMessage({ command: 'dropTableExecuteComplete', success: true });
            vscode.window.showInformationMessage(`Table "${schemaName}.${tableName}" dropped.`);
            this.refreshTree();
            panel.dispose();
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to drop table: ${errorMessage}`);
            panel.webview.postMessage({ command: 'dropTableExecuteComplete', success: false, error: errorMessage });
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
