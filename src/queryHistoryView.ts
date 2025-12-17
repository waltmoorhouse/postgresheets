/**
 * Query History View - Panel showing executed SQL queries
*** End Patch
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
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'query-history', 'main.js'));
        const baseStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'app.css'));
        const appStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

        const nonce = this.getNonce();
        const initialState = JSON.stringify({ view: 'queryHistory' }).replace(/</g, '\u003c');
        const cspSource = webview.cspSource;

        // Minimal Svelte-based loader to avoid fragile inline HTML
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; font-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Query History</title>
  <link rel="stylesheet" href="${baseStyleUri}">
  <link rel="stylesheet" href="${appStyleUri}">
</head>
<body>
  <div id="app">Loading…</div>
  <script nonce="${nonce}">
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


            // Handle webview disposal
            webviewView.onDidDispose(() => {

            });

            // When visibility changes (e.g., user opens the panel), refresh to ensure the webview has up-to-date data
            if (typeof (webviewView as any).onDidChangeVisibility === 'function') {
                (webviewView as any).onDidChangeVisibility(() => {
                    if (webviewView.visible) {
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
                const payload = { command: 'loadHistory', entries: entries, activeConnectionIds: [], pingId: Date.now() };
                this._sendWithAck(payload);
            } else {
                // view not initialized
            }
        }

        /**
         * Refresh and include active connection ids to annotate deleted connections in view
         */
        public refreshWithConnections(activeConnectionIds: string[]): void {
            if (this._view) {
                const entries = this.queryHistory.getRecent(100);
                const payload = { command: 'loadHistory', entries: entries, activeConnectionIds: activeConnectionIds, pingId: Date.now() };
                this._sendWithAck(payload);
            } else {
                // view not initialized
            }
        }

        /**
         * Send a payload and wait for 'historyLoaded' ack. Retries a few times if no ack.
         */
        private _sendWithAck(payload: any) {
            if (!this._view) {
                return;
            }

            const pingId = payload.pingId;
            this._pendingPings.add(pingId);
            this._pingRetries.set(pingId, 0);

            const trySend = () => {
                if (!this._view) return;
this._view!.webview.postMessage(payload);

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
            const initialState = JSON.stringify({ view: 'queryHistory' }).replace(/</g, '\u003c');
            const cspSource = webview.cspSource;

            try {
                const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'query-history', 'main.js'));
                const baseStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'app.css'));
                const appStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

                // Minimal Svelte-based loader to avoid fragile inline HTML
                return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; font-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <title>Query History</title>
      <link rel="stylesheet" href="${baseStyleUri}">
      <link rel="stylesheet" href="${appStyleUri}">
    </head>
    <body>
      <div id="app">Loading…</div>
      <script nonce="${nonce}">
        // Expose VS Code API to module entrypoint (some hosts don't make it available on window)
        try {
          if (typeof acquireVsCodeApi !== 'undefined') {
            (window as any).acquireVsCodeApi = acquireVsCodeApi;
          }
        } catch (err) {
          // ignore
        }
        window.initialState = ${initialState};

        // Lightweight fallback renderer: if the Svelte bundle doesn't run, this will render
        // incoming loadHistory payloads into the root and ACK them so the extension doesn't keep retrying.
        try {
          const vs = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : null;

          function escapeHtml(s: string) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }

          window.addEventListener('message', (ev) => {
            const msg = ev.data;
            if (!msg || msg.command !== 'loadHistory') return;
            try {
              const app = document.getElementById('app');
              if (!app) return;

              app.innerHTML = '';
              const container = document.createElement('div');
              container.style.padding = '8px';

              if (!msg.entries || msg.entries.length === 0) {
                const empty = document.createElement('div');
                empty.style.padding = '16px';
                empty.style.color = 'var(--vscode-descriptionForeground)';
                empty.textContent = 'No query history yet';
                container.appendChild(empty);
              } else {
                msg.entries.forEach((e: any) => {
                  const wrapper = document.createElement('div');
                  wrapper.style.borderBottom = '1px solid var(--vscode-panel-border)';
                  wrapper.style.padding = '8px';

                  const meta = document.createElement('div');
                  meta.style.fontSize = '12px';
                  meta.style.color = 'var(--vscode-descriptionForeground)';
                  meta.innerHTML = '<strong>' + escapeHtml(e.connectionName) + '</strong>' + (e.databaseName ? ' @ ' + escapeHtml(e.databaseName) : '');
                  wrapper.appendChild(meta);

                  const pre = document.createElement('pre');
                  pre.style.whiteSpace = 'pre-wrap';
                  pre.style.background = 'var(--vscode-textCodeBlock-background)';
                  pre.style.padding = '6px';
                  pre.style.borderRadius = '4px';
                  pre.textContent = e.query;
                  wrapper.appendChild(pre);

                  container.appendChild(wrapper);
                });
              }

              app.appendChild(container);

              try { vs && vs.postMessage({ command: 'historyLoaded', pingId: msg.pingId, count: msg.entries ? msg.entries.length : 0 }); } catch (e) {}
            } catch (e) {
              // ignore
            }
          });

          // Tell extension we're listening so it can send loadHistory if it hasn't already
          try { vs && vs.postMessage({ command: 'ready' }); } catch (e) {}

        } catch (e) {
          // ignore
        }
      </script>
      <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
            } catch (e) {
                // Tests and some environments may not provide extensionUri or webview.asWebviewUri.
                // Fall back to a minimal HTML payload which does not reference extension assets.
                return `<!DOCTYPE html><html><body><div id="app">Loading…</div><script nonce="${nonce}">window.initialState=${initialState};</script></body></html>`;
            }
        }

        private getNonce(): string {
            const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
        }
    }
