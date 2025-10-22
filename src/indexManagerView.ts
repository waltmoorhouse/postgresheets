/**
 * Index Manager View - UI for managing PostgreSQL indexes
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { IndexManager, IndexInfo } from './indexManager';

export class IndexManagerView {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly indexManager: IndexManager;
    private readonly panels = new Map<string, vscode.WebviewPanel>();

    constructor(context: vscode.ExtensionContext, connectionManager: ConnectionManager) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.indexManager = new IndexManager(connectionManager);
    }

    async openIndexManager(item: DatabaseTreeItem): Promise<void> {
        const connectionId = item.connectionId;
        const schemaName = item.schemaName;
        const tableName = item.tableName;

        if (!connectionId || !schemaName || !tableName) {
            vscode.window.showErrorMessage('Unable to open index manager - missing connection or table information.');
            return;
        }

        const panelKey = `${connectionId}:${schemaName}.${tableName}:indexes`;
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresIndexManager',
            `Indexes - ${schemaName}.${tableName}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panels.set(panelKey, panel);

        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message, panel, connectionId, schemaName, tableName);
        });

        await this.loadIndexes(panel, connectionId, schemaName, tableName);
    }

    private async loadIndexes(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        try {
            const indexes = await this.indexManager.getTableIndexes(connectionId, schemaName, tableName);
            panel.webview.html = this.buildHtml(schemaName, tableName, indexes);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load indexes: ${error}`);
        }
    }

    private async handleMessage(
        message: any,
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        switch (message.command) {
            case 'refresh':
                await this.loadIndexes(panel, connectionId, schemaName, tableName);
                break;
            case 'createIndex':
                await this.createIndexPrompt(connectionId, schemaName, tableName, panel);
                break;
            case 'dropIndex':
                await this.dropIndexPrompt(connectionId, schemaName, message.indexName, panel);
                break;
            case 'reindex':
                await this.reindex(connectionId, message.indexName, panel);
                break;
        }
    }

    private async createIndexPrompt(
        connectionId: string,
        schemaName: string,
        tableName: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        const indexName = await vscode.window.showInputBox({
            prompt: 'Enter index name',
            placeHolder: `idx_${tableName}_column`
        });

        if (!indexName) return;

        const columnNames = await vscode.window.showInputBox({
            prompt: 'Enter column names (comma-separated)',
            placeHolder: 'column1, column2'
        });

        if (!columnNames) return;

        const columns = columnNames.split(',').map(c => c.trim());

        const isUnique = await vscode.window.showQuickPick(['No', 'Yes'], {
            placeHolder: 'Create unique index?'
        });

        try {
            await this.indexManager.createIndex(connectionId, schemaName, tableName, indexName, columns, {
                isUnique: isUnique === 'Yes'
            });
            vscode.window.showInformationMessage(`Index ${indexName} created successfully`);
            await this.loadIndexes(panel, connectionId, schemaName, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create index: ${error}`);
        }
    }

    private async dropIndexPrompt(
        connectionId: string,
        schemaName: string,
        indexName: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            `Drop index ${indexName}?`,
            { modal: true },
            'Drop'
        );

        if (confirmed !== 'Drop') return;

        try {
            await this.indexManager.dropIndex(connectionId, schemaName, indexName);
            vscode.window.showInformationMessage(`Index ${indexName} dropped successfully`);
            panel.webview.postMessage({ command: 'refresh' });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to drop index: ${error}`);
        }
    }

    private async reindex(
        connectionId: string,
        indexName: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        try {
            await this.indexManager.reindexIndex(connectionId, indexName);
            vscode.window.showInformationMessage(`Index ${indexName} reindexed successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reindex: ${error}`);
        }
    }

    private buildHtml(schemaName: string, tableName: string, indexes: IndexInfo[]): string {
        const indexRows = indexes.map(idx => `
            <tr>
                <td>${idx.name}</td>
                <td>${idx.columns.join(', ')}</td>
                <td>${idx.indexType}</td>
                <td>${idx.isUnique ? 'Yes' : 'No'}</td>
                <td>${idx.isPrimary ? 'Yes' : 'No'}</td>
                <td>${this.formatBytes(idx.sizeBytes)}</td>
                <td>
                    <button onclick="reindex('${idx.name}')">Reindex</button>
                    ${!idx.isPrimary ? `<button onclick="dropIndex('${idx.name}')">Drop</button>` : ''}
                </td>
            </tr>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Indexes - ${schemaName}.${tableName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 { margin-top: 0; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border: 1px solid var(--vscode-panel-border);
        }
        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            cursor: pointer;
            margin: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .toolbar {
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1>Indexes - ${schemaName}.${tableName}</h1>
    
    <div class="toolbar">
        <button onclick="createIndex()">Create Index</button>
        <button onclick="refresh()">Refresh</button>
    </div>

    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Columns</th>
                <th>Type</th>
                <th>Unique</th>
                <th>Primary</th>
                <th>Size</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${indexRows || '<tr><td colspan="7">No indexes found</td></tr>'}
        </tbody>
    </table>

    <script>
        const vscode = acquireVsCodeApi();
        
        function createIndex() {
            vscode.postMessage({ command: 'createIndex' });
        }
        
        function dropIndex(name) {
            vscode.postMessage({ command: 'dropIndex', indexName: name });
        }
        
        function reindex(name) {
            vscode.postMessage({ command: 'reindex', indexName: name });
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'refresh') {
                location.reload();
            }
        });
    </script>
</body>
</html>`;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}
