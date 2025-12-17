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

    // Track pending loadHistory pings so we can detect if webview never acknowledges receipt
    private _pendingPings: Set<number> = new Set();
    private _pingRetries: Map<number, number> = new Map();
    private readonly MAX_PING_RETRIES = 3;

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

        const html = this.getHtmlContent(webviewView.webview);
        webviewView.webview.html = html;
        try {
            console.log('[QueryHistoryView] HTML length:', html.length, 'preview:', html.slice(0, 200).replace(/\n/g, ' '));

            // Diagnostics: check for problematic substrings that may break document.write in host
            const firstScriptIndex = html.indexOf('</script>');
            const lastScriptIndex = html.lastIndexOf('</script>');
            const nullByteIndex = html.indexOf('\u0000');
            const hasBacktick = html.indexOf('`') !== -1;

            console.log('[QueryHistoryView] Diagnostics: first </script> at', firstScriptIndex, 'last </script> at', lastScriptIndex, 'nullByteIndex', nullByteIndex, 'hasBacktick', hasBacktick);

            // Log a sample around the closing script tag for inspection
            try {
                const sample = html.slice(Math.max(0, lastScriptIndex - 200), Math.min(html.length, lastScriptIndex + 200));
                console.log('[QueryHistoryView] Sample near closing </script>:', sample);
            } catch (e) {
                console.warn('[QueryHistoryView] Failed to sample around closing </script>', e);
            }

            // Check for problematic unicode characters
            const hasU2028 = html.indexOf('\u2028') !== -1 || html.indexOf('\u2029') !== -1;
            const controlMatches = html.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
            console.log('[QueryHistoryView] Unicode/control diagnostics: hasU2028:', hasU2028, 'controlMatchesCount:', controlMatches ? controlMatches.length : 0);

        } catch (e) {
            console.error('[QueryHistoryView] Failed to log HTML preview', e);
        }

        // Handle webview disposal
        webviewView.onDidDispose(() => {
            console.log('[QueryHistoryView] Webview disposed');
            this._view = undefined;
        });

        // When visibility changes (e.g., user opens the panel), refresh to ensure the webview has up-to-date data
        if (typeof (webviewView as any).onDidChangeVisibility === 'function') {
            (webviewView as any).onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    console.log('[QueryHistoryView] View became visible, refreshing');
                    this.refresh();
                }
            });
        }

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    this.refresh();
                    break;
                case 'ready':
                    // Webview signaled it's ready - try to let the extension refresh with active connection IDs.
                    // If that command is not available for any reason, also perform a basic refresh so the
                    // webview will at least receive the history entries.
                    try {
                        await vscode.commands.executeCommand('postgres-editor.refreshQueryHistory');
                    } catch (e) {
                        console.log('[QueryHistoryView] Failed to request refresh from extension:', e);
                        // Fallback: send a basic refresh without connection annotations
                        this.refresh();
                    }
                    // Also do a non-blocking refresh as a safety net in case the command did not result in
                    // a posted message to the webview (some environments may not have the command bound yet).
                    // This ensures the panel will show entries even if the extension-side command failed.
                    this.refresh();
                    break;
                case 'copy':
                    await vscode.env.clipboard.writeText(message.query);
                    vscode.window.showInformationMessage('Query copied to clipboard');
                    break;
                case 'webviewError':
                    // Webview reported an error while rendering or running its script. Surface it in extension host logs.
                    console.error('[QueryHistoryView] Webview error:', message.error, message.stack || '');
                    break;
                case 'clear':
                    await this.clearHistory();
                    break;
                case 'delete':
                    await this.queryHistory.deleteEntry(message.id);
                    this.refresh();
                    break;
                case 'openInEditor':
                    await this.openQueryInEditor(message.entry);
                    break;
                case 'historyLoaded':
                    console.log('[QueryHistoryView] Webview ACK - loaded history', message.count, 'entries, pingId:', message.pingId);
                    if (message.pingId && this._pendingPings.has(message.pingId)) {
                        this._pendingPings.delete(message.pingId);
                    }
                    break;
            }
        });

        // Don't call refresh here - let the webview signal when it's ready
        // via the 'ready' message after its JavaScript has loaded
    }

    public refresh(): void {
        if (this._view) {
            const entries = this.queryHistory.getRecent(100);
            console.log(`[QueryHistoryView] Refreshing with ${entries.length} entries`);
            const payload = { command: 'loadHistory', entries: entries, activeConnectionIds: [], pingId: Date.now() };
            this._sendWithAck(payload);
        } else {
            console.log('[QueryHistoryView] Refresh called but view not initialized');
        }
    }

    /**
     * Refresh and include active connection ids to annotate deleted connections in view
     */
    public refreshWithConnections(activeConnectionIds: string[]): void {
        if (this._view) {
            const entries = this.queryHistory.getRecent(100);
            console.log(`[QueryHistoryView] Refreshing with ${entries.length} entries and ${activeConnectionIds.length} active connections`);
            const payload = { command: 'loadHistory', entries: entries, activeConnectionIds: activeConnectionIds, pingId: Date.now() };
            this._sendWithAck(payload);
        } else {
            console.log('[QueryHistoryView] RefreshWithConnections called but view not initialized');
        }
    }

    /**
     * Send a payload and wait for 'historyLoaded' ack. Retries a few times if no ack.
     */
    private _sendWithAck(payload: any) {
        if (!this._view) {
            console.log('[QueryHistoryView] Cannot send payload, view not initialized');
            return;
        }

        const pingId = payload.pingId;
        this._pendingPings.add(pingId);
        this._pingRetries.set(pingId, 0);

        const trySend = () => {
            if (!this._view) return;
            const result = this._view!.webview.postMessage(payload);
            console.log('[QueryHistoryView] postMessage result:', result, 'pingId:', pingId, 'retry:', this._pingRetries.get(pingId));

            // set timeout to check ack
            setTimeout(() => {
                if (!this._pendingPings.has(pingId)) return; // ack received

                const retries = (this._pingRetries.get(pingId) || 0) + 1;
                if (retries > this.MAX_PING_RETRIES) {
                    console.warn(`[QueryHistoryView] No ack received from webview for pingId ${pingId} after ${retries} retries`);
                    this._pendingPings.delete(pingId);
                    this._pingRetries.delete(pingId);
                    return;
                }

                this._pingRetries.set(pingId, retries);
                console.log(`[QueryHistoryView] Retrying loadHistory (pingId ${pingId}), attempt ${retries}`);
                trySend();
            }, 500);
        };

        trySend();
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

    private async openQueryInEditor(entry: QueryHistoryEntry): Promise<void> {
        const { parseSelectQuery } = await import('./queryParser');
        const parsed = parseSelectQuery(entry.query);
        
        if (!parsed.isSupported || !parsed.table) {
            vscode.window.showWarningMessage(`Cannot open this query in editor: ${parsed.reason || 'Unsupported query format'}`);
            return;
        }

        // Use default schema 'public' if not specified
        const schema = parsed.schema || 'public';
        
        await vscode.commands.executeCommand('postgres-editor.openTableWithWhere', {
            connectionId: entry.connectionId,
            schemaName: schema,
            tableName: parsed.table,
            whereClause: parsed.whereClause || ''
        });
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
            <button id="refreshBtn" title="Refresh">🔄 Refresh</button>
            <button id="clearBtn" class="secondary" title="Clear All">🗑️ Clear</button>
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
        console.log('[QueryHistoryView Webview] script loaded');
        window.addEventListener('error', (ev) => {
            try {
                const err = ev.error || ev;
                console.error('[QueryHistoryView Webview] Uncaught error', err);
                vscode.postMessage({ command: 'webviewError', error: String(err && err.message ? err.message : err), stack: err && err.stack ? err.stack : undefined });
            } catch (e) {
                console.error('[QueryHistoryView Webview] Error reporting failed', e);
            }
        });

        let entries = [];

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function clearAll() {
            vscode.postMessage({ command: 'clear' });
        }

        // Notify extension that the webview is ready to receive messages
        function ready() {
            vscode.postMessage({ command: 'ready' });
        }

        function copyQuery(query) {
            vscode.postMessage({ command: 'copy', query });
        }

        function deleteEntry(id) {
            vscode.postMessage({ command: 'delete', id });
        }

        function escapeHtml(str) {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
            if (hours > 0) return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
            if (minutes > 0) return minutes + ' minute' + (minutes > 1 ? 's' : '') + ' ago';
            return 'Just now';
        }

        function canOpenInEditor(query) {
            // Simple check for SELECT queries without JOINs, subqueries, etc.
            const trimmed = query.trim();
            if (!/^SELECT\\s+/i.test(trimmed)) return false;
            if (/\\bJOIN\\b|\\bUNION\\b|\\bWITH\\b|\\(SELECT\\b/i.test(trimmed)) return false;
            if (!/\\bFROM\\s+/i.test(trimmed)) return false;
            return true;
        }

        function openInEditor(entry) {
            vscode.postMessage({ command: 'openInEditor', entry });
        }

        function renderHistory(historyEntries) { try {
            console.log('[QueryHistoryView Webview] Rendering', historyEntries ? historyEntries.length : 0, 'entries');
            entries = historyEntries;
            const container = document.getElementById('historyList');
            
            if (!historyEntries || historyEntries.length === 0) {
                container.innerHTML = '<div class="empty-state">' +
                    '<div class="empty-state-icon">📜</div>' +
                    '<div>No query history yet</div>' +
                    '</div>';
                return;
            }

            container.innerHTML = historyEntries.map((entry, index) => {
                const escapedQuery = escapeHtml(entry.query);
                const deletedNote = (activeConnectionIds && activeConnectionIds.indexOf(entry.connectionId) === -1) ? ' (deleted)' : '';
                const canOpen = canOpenInEditor(entry.query);
                let s = '';
                s += '                <div class="history-entry" data-entry-index="' + index + '" data-entry-id="' + entry.id + '">\n';
                s += '                    <div class="entry-header">\n';
                s += '                        <div class="entry-meta">\n';
                s += '                            <span class="entry-connection">' + entry.connectionName + deletedNote + '</span>' + (entry.databaseName ? ' @ ' + entry.databaseName : '') + '\n';
                s += '                        </div>\n';
                s += '                        <div class="entry-meta entry-time">\n';
                s += '                            ' + formatDate(entry.timestamp) + (entry.executionTime ? ' • ' + entry.executionTime + 'ms' : '') + '\n';
                s += '                        </div>\n';
                s += '                    </div>\n';
                s += '                    <div class="entry-query" data-entry-id="' + entry.id + '">' + escapedQuery + '</div>\n';
                s += '                    <div class="entry-actions">\n';
                if (canOpen) {
                    s += '                        <button class="open-editor-btn" data-entry-index="' + index + '" title="Open in Table Editor">📊 Open in Editor</button>\n';
                }
                s += '                        <button class="copy-btn" data-entry-id="' + entry.id + '">📋 Copy</button>\n';
                s += '                        <button class="delete-btn secondary" data-entry-id="' + entry.id + '">🗑️ Delete</button>\n';
                s += '                    </div>\n';
                s += '                </div>\n';
                return s;
            }).join('');
            } catch (e) {
                console.error('[QueryHistoryView Webview] renderHistory error', e);
                try { vscode.postMessage({ command: 'webviewError', error: String(e && e.message ? e.message : e), stack: e && e.stack ? e.stack : undefined }); } catch (er) { console.error('[QueryHistoryView Webview] Failed to report render error', er); }
                const container = document.getElementById('historyList');
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div>Error rendering history</div></div>';
                return;
            }
        }

// Delegate clicks for copy/delete/open (single handler)
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;

            // Open in Editor
            const openBtn = target.closest('.open-editor-btn');
            if (openBtn) {
                const idx = parseInt(openBtn.getAttribute('data-entry-index') || '-1', 10);
                if (idx >= 0 && idx < entries.length) {
                    openInEditor(entries[idx]);
                }
                return;
            }

            // Copy
            const copyBtn = target.closest('.copy-btn');
            if (copyBtn) {
                const idxAttr = copyBtn.getAttribute('data-entry-id');
                const entry = entries.find(en => en.id === idxAttr);
                if (entry) copyQuery(entry.query);
                return;
            }

            // Delete
            const delBtn = target.closest('.delete-btn');
            if (delBtn) {
                const id = delBtn.getAttribute('data-entry-id');
                if (id) deleteEntry(id);
                return;
            }
        });

        // Hook up toolbar buttons without inline handlers (CSP-friendly)
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) clearBtn.addEventListener('click', clearAll);

        // Listen for messages from the extension
        let activeConnectionIds = [];

        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[QueryHistoryView Webview] Received message:', message.command, message);
            switch (message.command) {
                case 'loadHistory':
                    activeConnectionIds = message.activeConnectionIds || [];
                    renderHistory(message.entries);
                    try { vscode.postMessage({ command: 'historyLoaded', pingId: message.pingId, count: message.entries ? message.entries.length : 0 }); } catch (e) { console.error('[QueryHistoryView Webview] Failed to ack loadHistory', e); }
                    break;
            }
        });

        // Initial refresh
        refresh();
        // Also announce readiness so extension can push active connection annotations
        ready();
    </script>
</body>
</html>`;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
