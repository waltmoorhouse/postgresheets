/**
 * Query History View - Panel showing executed SQL queries
 * Opens in the bottom panel area like Terminal and Debug Console
 */

import * as vscode from 'vscode';
import { QueryHistory, QueryHistoryEntry } from './queryHistory';

export class QueryHistoryView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'postgresQueryHistory';
    
    private _view?: vscode.WebviewView;
    private readonly queryHistory: QueryHistory;

    constructor(
        private readonly context: vscode.ExtensionContext,
        queryHistory: QueryHistory
    ) {
        this.queryHistory = queryHistory;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    this.refresh();
                    break;
                case 'copy':
                    await vscode.env.clipboard.writeText(message.query);
                    vscode.window.showInformationMessage('Query copied to clipboard');
                    break;
                case 'clear':
                    await this.clearHistory();
                    break;
                case 'delete':
                    await this.queryHistory.deleteEntry(message.id);
                    this.refresh();
                    break;
            }
        });

        // Initial load
        this.refresh();
    }

    public refresh(): void {
        if (this._view) {
            const entries = this.queryHistory.getRecent(100);
            this._view.webview.postMessage({
                command: 'loadHistory',
                entries: entries
            });
        }
    }

    private async clearHistory(): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'Clear all query history?',
            { modal: true },
            'Clear'
        );

        if (confirmed === 'Clear') {
            await this.queryHistory.clearHistory();
            this.refresh();
            vscode.window.showInformationMessage('Query history cleared');
        }
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const cspSource = webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Query History</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
        }
        .toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
        }
        .toolbar h3 {
            margin: 0;
            font-size: 13px;
            font-weight: normal;
        }
        .toolbar-buttons {
            display: flex;
            gap: 4px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .history-list {
            overflow-y: auto;
            height: calc(100vh - 41px);
        }
        .history-entry {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 8px;
            cursor: pointer;
        }
        .history-entry:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .entry-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .entry-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .entry-connection {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .entry-time {
            font-style: italic;
        }
        .entry-query {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            white-space: pre-wrap;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 4px 8px;
            border-radius: 3px;
            margin-top: 4px;
            max-height: 100px;
            overflow-y: auto;
        }
        .entry-actions {
            display: flex;
            gap: 4px;
            margin-top: 4px;
        }
        .entry-actions button {
            font-size: 10px;
            padding: 2px 6px;
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: calc(100vh - 41px);
            color: var(--vscode-descriptionForeground);
        }
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <h3>Query History</h3>
        <div class="toolbar-buttons">
            <button onclick="refresh()" title="Refresh">🔄 Refresh</button>
            <button class="secondary" onclick="clearAll()" title="Clear All">🗑️ Clear</button>
        </div>
    </div>
    <div id="historyList" class="history-list">
        <div class="empty-state">
            <div class="empty-state-icon">📜</div>
            <div>No query history yet</div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let entries = [];

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function clearAll() {
            vscode.postMessage({ command: 'clear' });
        }

        function copyQuery(query) {
            vscode.postMessage({ command: 'copy', query });
        }

        function deleteEntry(id) {
            vscode.postMessage({ command: 'delete', id });
        }

        function formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) return \`\${days} day\${days > 1 ? 's' : ''} ago\`;
            if (hours > 0) return \`\${hours} hour\${hours > 1 ? 's' : ''} ago\`;
            if (minutes > 0) return \`\${minutes} minute\${minutes > 1 ? 's' : ''} ago\`;
            return 'Just now';
        }

        function renderHistory(historyEntries) {
            entries = historyEntries;
            const container = document.getElementById('historyList');
            
            if (!historyEntries || historyEntries.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">📜</div>
                        <div>No query history yet</div>
                    </div>
                \`;
                return;
            }

            container.innerHTML = historyEntries.map(entry => {
                const escapedQuery = entry.query.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                return \`
                <div class="history-entry">
                    <div class="entry-header">
                        <div class="entry-meta">
                            <span class="entry-connection">\${entry.connectionName}</span>
                            \${entry.databaseName ? \` @ \${entry.databaseName}\` : ''}
                        </div>
                        <div class="entry-meta entry-time">
                            \${formatDate(entry.timestamp)}
                            \${entry.executionTime ? \` • \${entry.executionTime}ms\` : ''}
                        </div>
                    </div>
                    <div class="entry-query">\${entry.query}</div>
                    <div class="entry-actions">
                        <button onclick='copyQuery("\${escapedQuery}")'>📋 Copy</button>
                        <button class="secondary" onclick="deleteEntry('\${entry.id}')">🗑️ Delete</button>
                    </div>
                </div>
                \`;
            }).join('');
        }

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadHistory':
                    renderHistory(message.entries);
                    break;
            }
        });

        // Initial refresh
        refresh();
    </script>
</body>
</html>`;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
