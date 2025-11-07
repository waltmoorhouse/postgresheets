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

  async openWizard(prefillConfig?: Partial<ConnectionConfig> & { password?: string; editMode?: boolean }): Promise<void> {
    const panel = this.panelFactory
      ? this.panelFactory('postgresAddConnection', prefillConfig?.editMode ? 'Edit Connection' : 'Add Connection', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true })
      : vscode.window.createWebviewPanel('postgresAddConnection', prefillConfig?.editMode ? 'Edit Connection' : 'Add Connection', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });

    const nonce = this.getNonce();
    const cspSource = panel.webview.cspSource;

    // Try to load the built Svelte bundle from the extension's media
    try {
      const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'add-connection', 'main.js'));
      const globalStyleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'app.css'));
      const wizardStyleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main5.css'));
      console.log('Loading Svelte bundle from:', scriptUri.toString());

      // Build initial state with prefill data
      // NOTE: intentionally do NOT include any password value in the initialState
      // to avoid exposing secrets to the webview's JS/DOM/devtools.
      const initialState = prefillConfig ? {
        name: prefillConfig.name || '',
        host: prefillConfig.host || '',
        port: prefillConfig.port || 5432,
        database: prefillConfig.database || '',
        username: prefillConfig.username || '',
        // password intentionally omitted
        ssl: prefillConfig.ssl || false,
        mode: 'manual',
        editMode: prefillConfig.editMode || false,
        id: prefillConfig.id
      } : {};

      panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${globalStyleUri}">
  <link rel="stylesheet" href="${wizardStyleUri}">
  <title>${prefillConfig?.editMode ? 'Edit Connection' : 'Add Connection'}</title>
</head>
<body>
  <div id="app">Loading…</div>
  <script nonce="${nonce}">
    window.initialState = ${JSON.stringify(initialState)};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
    } catch (e) {
      // Fallback to inline HTML for dev/testing
      console.log('Failed to load Svelte bundle, using fallback:', e);
      panel.webview.html = this.buildHtml(nonce, cspSource, prefillConfig);
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

              // Check if we're in edit mode
              const editMode = Boolean(payload.editMode);
              const id = payload.id ? String(payload.id) : undefined;

              if (editMode && id) {
                configWithName.id = id;
              }

              const password = typeof payload.password === 'string' ? payload.password : (payload.mode === 'connectionString' && parsed?.password ? parsed.password : undefined);
              const saved = await this.connectionManager.saveNewConnection(configWithName, password, editMode);
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

  private buildHtml(nonce: string, cspSource: string, prefillConfig?: Partial<ConnectionConfig> & { password?: string; editMode?: boolean }): string {
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

        // NOTE: intentionally omit any password from the initialState to prevent
        // accidental exposure to the webview. The webview will still accept user
        // input for passwords when saving/testing, but the extension will not
        // inject stored secrets into the page.
        const initialState = prefillConfig ? {
            name: prefillConfig.name || '',
            host: prefillConfig.host || '',
            port: prefillConfig.port || 5432,
            database: prefillConfig.database || '',
            username: prefillConfig.username || '',
            // password intentionally omitted
            ssl: prefillConfig.ssl || false,
            mode: 'manual',
            editMode: prefillConfig.editMode || false,
            id: prefillConfig.id
        } : {};

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${style}</style>
  <title>${prefillConfig?.editMode ? 'Edit Connection' : 'Add Connection'}</title>
</head>
<body>
  <h2>${prefillConfig?.editMode ? 'Edit Connection' : 'Add Connection'}</h2>
  <label for="name">Name</label>
  <input id="name" type="text" placeholder="My Database" />

  <label>Entry Mode</label>
  <div class="row">
    <label><input type="radio" name="mode" value="connectionString" ${initialState.mode === 'connectionString' ? 'checked' : ''} /> Connection string</label>
    <label><input type="radio" name="mode" value="manual" ${!initialState.mode || initialState.mode === 'manual' ? 'checked' : ''} /> Manual fields</label>
  </div>

  <div id="stringMode" style="display:${!initialState.mode || initialState.mode === 'manual' ? 'none' : ''}">
    <label for="connStr">Connection string</label>
    <textarea id="connStr" rows="3" placeholder="postgres://user:password@host:5432/db?sslmode=require"></textarea>
    <p class="muted" style="margin-top:4px; font-size:0.9em;">Password can be included in the connection string or entered separately below.</p>
  </div>

  <div id="manualMode" style="display:${initialState.mode === 'connectionString' ? 'none' : ''}">
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

  <label for="password">Password (optional if included in connection string)</label>
  <input id="password" type="password" placeholder="Leave blank if password is in connection string" />

  <div class="status" id="status"></div>

  <footer>
    <button id="testBtn">Test Connection</button>
    <button id="saveBtn">Save</button>
    <button id="cancelBtn">Cancel</button>
  </footer>

  <script nonce="${nonce}">
    const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    const initialState = ${JSON.stringify(initialState)};
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const stringMode = document.getElementById('stringMode');
    const manualMode = document.getElementById('manualMode');
    const statusEl = document.getElementById('status');
    
    // Prefill fields with initial state
    if (initialState.name) document.getElementById('name').value = initialState.name;
    if (initialState.host) document.getElementById('host').value = initialState.host;
    if (initialState.port) document.getElementById('port').value = initialState.port;
    if (initialState.database) document.getElementById('database').value = initialState.database;
    if (initialState.username) document.getElementById('username').value = initialState.username;
    // intentionally DO NOT prefill the password field from initialState
    if (initialState.ssl) document.getElementById('ssl').checked = initialState.ssl;

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

    function tryPost(command, payload, onErrorText) {
      if (!vscode) {
        statusEl.textContent = onErrorText;
        return false;
      }
      vscode.postMessage({ command, payload });
      return true;
    }

    document.getElementById('testBtn').addEventListener('click', () => {
      statusEl.textContent = 'Testing...';
      const payload = collectPayload();
      tryPost('testConnection', payload, 'Error: VS Code API unavailable');
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      statusEl.textContent = 'Saving...';
      const payload = collectPayload();
      payload.name = (document.getElementById('name').value || '').trim();
      payload.editMode = initialState.editMode || false;
      payload.id = initialState.id;
      tryPost('saveConnection', payload, 'Error: VS Code API unavailable');
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      tryPost('cancel', undefined, '');
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
