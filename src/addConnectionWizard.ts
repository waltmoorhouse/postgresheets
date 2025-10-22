import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from './connectionManager';

export class AddConnectionWizard {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly refreshTree: () => void;

  private readonly panelFactory?: (viewType: string, title: string, showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean } | vscode.ViewColumn, options?: vscode.WebviewPanelOptions & vscode.WebviewOptions) => vscode.WebviewPanel;

  constructor(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    refreshTree: () => void,
    panelFactory?: (viewType: string, title: string, showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean } | vscode.ViewColumn, options?: vscode.WebviewPanelOptions & vscode.WebviewOptions) => vscode.WebviewPanel
  ) {
    this.context = context;
    this.connectionManager = connectionManager;
    this.refreshTree = refreshTree;
    this.panelFactory = panelFactory;
  }

    async openWizard(): Promise<void> {
    const panel = this.panelFactory
      ? this.panelFactory('postgresAddConnection', 'Add Connection', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true })
      : vscode.window.createWebviewPanel('postgresAddConnection', 'Add Connection', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });

        const nonce = this.getNonce();
        const cspSource = panel.webview.cspSource;

        // Try to load the built Svelte bundle from the extension's media
        try {
            const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'add-connection', 'main.js'));
            const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'app.css'));
            panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${styleUri}">
  <title>Add Connection</title>
</head>
<body>
  <div id="app">Loading…</div>
  <script nonce="${nonce}">
    window.initialState = {};
    window.acquireVsCodeApi = acquireVsCodeApi;
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
        } catch (e) {
            // Fallback to inline HTML for dev/testing
            panel.webview.html = this.buildHtml(nonce, cspSource);
        }

    // Register a message handler and keep a reference to it for tests
    const handler = async (message: unknown): Promise<void> => {
      try {
        if (!message || typeof message !== 'object') return;
        const msg = message as Record<string, unknown>;
        const command = msg.command;
        switch (command) {
                    case 'testConnection': {
                        const payload = msg.payload as Record<string, unknown>;
                        const result = await this.connectionManager.testConnection(payload);
                        panel.webview.postMessage({ command: 'testResult', payload: result });
                        break;
                    }
                    case 'saveConnection': {
                        const payload = msg.payload as Record<string, unknown>;

                        let parsed: { host: string; port: number; database: string; username: string; password?: string; ssl?: boolean } | null = null;
                        if (payload.mode === 'connectionString') {
                            const connStr = payload.connStr;
                            if (typeof connStr !== 'string') {
                                panel.webview.postMessage({ command: 'saveResult', payload: { success: false, error: 'Invalid connection string' } });
                                break;
                            }
                            parsed = this.connectionManager.parseConnectionString(connStr);
                            if (!parsed) {
                                panel.webview.postMessage({ command: 'saveResult', payload: { success: false, error: 'Invalid connection string' } });
                                break;
                            }
                        }

                        const config: Partial<ConnectionConfig> = payload.mode === 'connectionString' ? {
                            name: String(payload.name || ''),
                            host: parsed!.host,
                            port: parsed!.port,
                            database: parsed!.database,
                            username: parsed!.username,
                            ssl: parsed!.ssl
                        } : {
                            name: String(payload.name || ''),
                            host: String(payload.host || ''),
                            port: Number(payload.port) || 5432,
                            database: String(payload.database || ''),
                            username: String(payload.username || ''),
                            ssl: Boolean(payload.ssl)
                        };

            try {
              // Ensure the config has a name (webview sets payload.name on save).
              const configWithName = { ...config, name: (String(payload.name) || '').trim() } as Partial<ConnectionConfig> & { name: string };
              const password = typeof payload.password === 'string' ? payload.password : undefined;
              const saved = await this.connectionManager.saveNewConnection(configWithName, password);
                            panel.webview.postMessage({ command: 'saveResult', payload: { success: true, id: saved.id } });
                            panel.dispose();
                            this.refreshTree();
                        } catch (err) {
                            panel.webview.postMessage({ command: 'saveResult', payload: { success: false, error: String(err) } });
                        }
                        break;
                    }
                    case 'cancel': {
                        panel.dispose();
                        break;
                    }
                    default:
                        break;
                }
            } catch (err) {
                panel.webview.postMessage({ command: 'error', payload: String(err) });
      }
  };

  // Assign for tests to invoke directly
  (this as Record<string, unknown>).lastMessageHandler = handler;
  const disposable = panel.webview.onDidReceiveMessage(handler);
  // (Removed developer debug logging)

        panel.onDidDispose(() => disposable.dispose());
    }

    private buildHtml(nonce: string, cspSource: string): string {
        // Minimal inline styles for the form
        const style = `
            body { font-family: var(--vscode-font-family, sans-serif); padding: 16px; color: var(--vscode-foreground); }
            label { display:block; margin-top:8px; font-weight:600 }
            input, textarea { width:100%; padding:8px; margin-top:4px; box-sizing:border-box }
            .row { display:flex; gap:8px }
            .row input { flex:1 }
            footer { margin-top:12px; display:flex; gap:8px; }
            .muted { color: var(--vscode-disabledForeground) }
            .status { margin-top:8px }
        `;

        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${style}</style>
  <title>Add Connection</title>
</head>
<body>
  <h2>Add Connection</h2>
  <label for="name">Name</label>
  <input id="name" type="text" placeholder="My Database" />

  <label>Entry Mode</label>
  <div class="row">
    <label><input type="radio" name="mode" value="connectionString" checked /> Connection string</label>
    <label><input type="radio" name="mode" value="manual" /> Manual fields</label>
  </div>

  <div id="stringMode">
    <label for="connStr">Connection string</label>
    <textarea id="connStr" rows="3" placeholder="postgres://user:password@host:5432/db?sslmode=require"></textarea>
  </div>

  <div id="manualMode" style="display:none">
    <label for="host">Host</label>
    <input id="host" placeholder="localhost" />
    <div class="row">
      <div style="flex:1">
        <label for="port">Port</label>
        <input id="port" placeholder="5432" />
      </div>
      <div style="flex:1">
        <label for="database">Database</label>
        <input id="database" placeholder="postgres" />
      </div>
    </div>
    <div class="row">
      <div style="flex:1">
        <label for="username">Username</label>
        <input id="username" />
      </div>
      <div style="flex:1">
        <label for="password">Password</label>
        <input id="passwordManual" type="password" />
      </div>
    </div>
    <label><input id="ssl" type="checkbox" /> SSL</label>
  </div>

  <label for="password">Password (connection string mode)</label>
  <input id="password" type="password" />

  <div class="status" id="status"></div>

  <footer>
    <button id="testBtn">Test Connection</button>
    <button id="saveBtn">Save</button>
    <button id="cancelBtn">Cancel</button>
  </footer>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const stringMode = document.getElementById('stringMode');
    const manualMode = document.getElementById('manualMode');
    const statusEl = document.getElementById('status');

    for (const r of modeRadios) {
      r.addEventListener('change', () => {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        if (mode === 'connectionString') {
          stringMode.style.display = '';
          manualMode.style.display = 'none';
        } else {
          stringMode.style.display = 'none';
          manualMode.style.display = '';
        }
      });
    }

    document.getElementById('testBtn').addEventListener('click', () => {
      statusEl.textContent = 'Testing...';
      const payload = collectPayload();
      vscode.postMessage({ command: 'testConnection', payload });
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      statusEl.textContent = 'Saving...';
      const payload = collectPayload();
      payload.name = (document.getElementById('name').value || '').trim();
      vscode.postMessage({ command: 'saveConnection', payload });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
    });

    function collectPayload() {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      if (mode === 'connectionString') {
        return {
          mode: 'connectionString',
          connStr: document.getElementById('connStr').value.trim(),
          password: document.getElementById('password').value
        };
      }
      return {
        mode: 'manual',
        host: document.getElementById('host').value.trim(),
        port: document.getElementById('port').value.trim(),
        database: document.getElementById('database').value.trim(),
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('passwordManual').value,
        ssl: document.getElementById('ssl').checked
      };
    }

    // Listen for messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'testResult') {
        const p = msg.payload;
        if (p.success) {
          statusEl.textContent = 'Connection OK';
          statusEl.className = 'muted';
        } else {
          statusEl.textContent = 'Failed: ' + (p.error || 'Unknown error');
          statusEl.className = 'muted';
        }
      } else if (msg.command === 'saveResult') {
        const p = msg.payload;
        if (p.success) {
          statusEl.textContent = 'Saved';
        } else {
          statusEl.textContent = 'Save failed: ' + (p.error || 'Unknown error');
        }
      } else if (msg.command === 'error') {
        statusEl.textContent = 'Error: ' + String(msg.payload);
      }
    });
  </script>
</body>
</html>`;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
