import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { SqlTerminalProvider } from './sqlTerminalProvider';
import { QueryHistory } from './queryHistory';
import { SqlEditorResultView } from './sqlEditorResultView';

const DOC_CONN_KEY = 'sqlDocumentConnections';

export class SqlEditor {
    private statusBarItem: vscode.StatusBarItem;
    private resultView: SqlEditorResultView;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly connectionManager: ConnectionManager,
        private readonly sqlTerminalProvider: SqlTerminalProvider,
        private readonly queryHistory: QueryHistory
    ) {
        if (vscode.window && typeof vscode.window.createStatusBarItem === 'function') {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            this.statusBarItem.command = 'postgres-editor.selectSqlDocumentConnection';
            context.subscriptions.push(this.statusBarItem);
        } else {
            // Provide a noop fallback for test environments where status bar isn't mocked
            this.statusBarItem = { show: () => {}, hide: () => {}, dispose: () => {}, command: 'postgres-editor.selectSqlDocumentConnection' } as any;
        }

        this.resultView = new SqlEditorResultView(context);

        // Register providers and commands (guarded for test environment)
        if (vscode.languages && typeof vscode.languages.registerCodeLensProvider === 'function') {
            context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'sql' }, new SqlCodeLensProvider(this)));
        }
        if (vscode.languages && typeof vscode.languages.registerCompletionItemProvider === 'function') {
            context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: 'sql' }, new SqlCompletionProvider(this), '.', '"'));
        }

        if (vscode.commands && typeof vscode.commands.registerCommand === 'function') {
            context.subscriptions.push(
                vscode.commands.registerCommand('postgres-editor.runSqlFile', async () => { await this.runSqlFile(); }),
                vscode.commands.registerCommand('postgres-editor.runSqlSelection', async () => { await this.runSqlSelection(); }),
                vscode.commands.registerCommand('postgres-editor.selectSqlDocumentConnection', async () => { await this.selectDocumentConnection(); }),
                vscode.commands.registerCommand('postgres-editor.newSqlFile', async () => { await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { language: 'sql' }); })
            );
        } else {
            // In test environments without command registration, provide no-op placeholders
            // This avoids throwing during tests but keeps semantics intact when running in real VS Code.
        }

        // Update status bar on active editor change
        if (vscode.window && typeof (vscode.window as any).onDidChangeActiveTextEditor === 'function') {
            context.subscriptions.push((vscode.window as any).onDidChangeActiveTextEditor(() => this.updateStatusBar()));
        }
        if (vscode.workspace && typeof (vscode.workspace as any).onDidCloseTextDocument === 'function') {
            context.subscriptions.push((vscode.workspace as any).onDidCloseTextDocument((doc: vscode.TextDocument) => this.onDocumentClosed(doc)));
        }

        this.updateStatusBar();
    }

    private getDocumentKey(doc: vscode.TextDocument) {
        return `${DOC_CONN_KEY}:${doc.uri.toString()}`;
    }

    getSavedConnectionForDocument(doc: vscode.TextDocument): { connectionId?: string; schema?: string } {
        const key = this.getDocumentKey(doc);
        const val = this.context.workspaceState.get<{ connectionId?: string; schema?: string }>(key);
        return val || {};
    }

    async setConnectionForDocument(doc: vscode.TextDocument, connectionId: string, schema: string = 'public') {
        const key = this.getDocumentKey(doc);
        await this.context.workspaceState.update(key, { connectionId, schema });
        this.updateStatusBar();
        // refresh code lenses
        vscode.commands.executeCommand('editor.action.codelens.refresh');
    }

    async clearConnectionForDocument(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        await this.context.workspaceState.update(key, undefined);
        this.updateStatusBar();
        vscode.commands.executeCommand('editor.action.codelens.refresh');
    }

    private onDocumentClosed(doc: vscode.TextDocument) {
        // If document is untitled and closed, clear workspace state mapping
        if (doc.isUntitled) {
            this.clearConnectionForDocument(doc).catch(() => {});
        }
    }

    private updateStatusBar() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql') {
            this.statusBarItem.hide();
            return;
        }

        const mapping = this.getSavedConnectionForDocument(editor.document);
        if (mapping && mapping.connectionId) {
            (async () => {
                const configs = await this.connectionManager.getConnections();
                const cfg = configs.find(c => c.id === mapping.connectionId);
                const name = cfg ? cfg.name : 'Unknown';
                this.statusBarItem.text = `$(database) SQL: ${name}`;
                this.statusBarItem.show();
            })();
        } else {
            this.statusBarItem.text = '$(database) SQL: (Choose Connection)';
            this.statusBarItem.show();
        }
    }

    async selectDocumentConnection() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql') {
            vscode.window.showErrorMessage('Open an SQL document first');
            return;
        }

        const configs = await this.connectionManager.getConnections();
        if (configs.length === 0) {
            vscode.window.showInformationMessage('No saved PostgreSQL connections found.');
            return;
        }

        const picks = configs.map(c => ({ label: c.name, description: `${c.host}:${c.port}/${c.database}`, id: c.id }));
        const choice = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a connection for this SQL document' });
        if (!choice) return;

        const schema = await vscode.window.showInputBox({ prompt: 'Schema to use (search_path)', value: 'public' });
        if (schema === undefined) return;

        await this.setConnectionForDocument(editor.document, choice.id, schema || 'public');
        vscode.window.showInformationMessage(`Selected connection ${choice.label} for this SQL document`);
    }

    async runSqlSelection() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql') {
            vscode.window.showErrorMessage('Open an SQL document first');
            return;
        }

        const sql = editor.document.getText(editor.selection) || editor.document.getText();
        if (!sql || sql.trim().length === 0) {
            vscode.window.showErrorMessage('No SQL selected or in document');
            return;
        }

        await this.runSqlForDocument(editor.document, sql);
    }

    async runSqlFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql') {
            vscode.window.showErrorMessage('Open an SQL document first');
            return;
        }

        const sql = editor.document.getText();
        if (!sql || sql.trim().length === 0) {
            vscode.window.showErrorMessage('No SQL to run');
            return;
        }

        await this.runSqlForDocument(editor.document, sql);
    }

    private async runSqlForDocument(doc: vscode.TextDocument, sql: string) {
        let mapping = this.getSavedConnectionForDocument(doc);
        if (!mapping.connectionId) {
            // Prompt user to select connection
            const configs = await this.connectionManager.getConnections();
            if (configs.length === 0) {
                vscode.window.showInformationMessage('No saved PostgreSQL connections found.');
                return;
            }
            const picks = configs.map(c => ({ label: c.name, description: `${c.host}:${c.port}/${c.database}`, id: c.id }));
            const choice = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a connection to run SQL' });
            if (!choice) return;
            const schema = await vscode.window.showInputBox({ prompt: 'Schema to use (search_path)', value: 'public' });
            if (schema === undefined) return;
            mapping = { connectionId: choice.id, schema: schema || 'public' };
            await this.setConnectionForDocument(doc, mapping.connectionId!, mapping.schema || 'public');
        }

        // Execute using SqlTerminalProvider's silent method
        const conn = await this.connectionManager.getConnections();
        const cfg = conn.find(c => c.id === mapping.connectionId);
        const databaseName = cfg ? cfg.database : '';

        const r = await this.sqlTerminalProvider.executeSqlSilent(mapping.connectionId!, databaseName, mapping.schema || 'public', sql);
        if (r.error) {
            vscode.window.showErrorMessage(`Failed to execute SQL: ${r.error}`);
            return;
        }

        // Show results in result view
        if (r.result && (r.result.command === 'SELECT' || r.result.command === 'SHOW')) {
            this.resultView.showQueryResult(`SQL Result - ${doc.fileName}`, r.result.rows, Object.keys(r.result.rows[0] || {}));
        } else {
            vscode.window.showInformationMessage(`${r.result?.command || 'Executed'} (${r.result?.rowCount ?? 0} rows) (${r.executionTime}ms)`);
        }
    }

    // Completion helpers
    async fetchColumnsForTable(connectionId: string, schema: string | undefined, table: string) {
        try {
            let client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                client = await this.connectionManager.connect(connectionId);
                if (!client) return [];
            }

            if (schema) {
                const res = await client.query(
                    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
                    [schema, table]
                );
                return res.rows;
            } else {
                const res = await client.query(
                    `SELECT column_name, data_type, table_schema FROM information_schema.columns WHERE table_name = $1 ORDER BY table_schema, ordinal_position`,
                    [table]
                );
                return res.rows;
            }
        } catch (e) {
            return [];
        }
    }

}

class SqlCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.onDidChange.event;
    constructor(private manager: SqlEditor) {}

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        if (document.languageId !== 'sql') return [];

        const top = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        const mapping = this.manager.getSavedConnectionForDocument(document);
        const connTitle = mapping.connectionId ? `Connection: ${mapping.connectionId}` : 'Connection: (Choose)';

        const codelenses: vscode.CodeLens[] = [];
        codelenses.push(new vscode.CodeLens(top, { title: connTitle + ' (Change)', command: 'postgres-editor.selectSqlDocumentConnection' }));
        codelenses.push(new vscode.CodeLens(top, { title: 'Run Selection', command: 'postgres-editor.runSqlSelection' }));
        codelenses.push(new vscode.CodeLens(top, { title: 'Run File', command: 'postgres-editor.runSqlFile' }));
        return codelenses;
    }
}

class SqlCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private manager: SqlEditor) {}

    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
        const line = document.lineAt(position.line).text.substring(0, position.character);
        // Look for pattern: [schema.]table.
        const m = /(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\.(?:"([^"]+)"|([A-Za-z0-9_]+)))?\.$/.exec(line);
        if (!m) {
            return null;
        }

        let schema: string | undefined;
        let table: string | undefined;
        if (m[4] || m[3]) {
            // schema.table.
            schema = m[1] || m[2];
            table = m[3] || m[4];
        } else {
            table = m[1] || m[2];
        }

        // Determine connection for document
        const mapping = this.manager.getSavedConnectionForDocument(document);
        if (!mapping.connectionId) {
            return null; // no mapped connection -> no table metadata
        }

        const cols = await this.manager.fetchColumnsForTable(mapping.connectionId, schema, table!);
        const items = cols.map((c: any) => {
            const item = new vscode.CompletionItem(c.column_name, vscode.CompletionItemKind.Field);
            item.detail = c.data_type || '';
            item.insertText = c.column_name;
            return item;
        });

        return items;
    }
}
