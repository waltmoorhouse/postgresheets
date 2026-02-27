import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { SqlTerminalProvider } from './sqlTerminalProvider';
import { QueryHistory } from './queryHistory';
import { SqlEditorResultView } from './sqlEditorResultView';

const DOC_CONN_KEY = 'sqlDocumentConnections';

const isSqlLikeLanguage = (languageId: string): boolean => languageId === 'sql' || languageId === 'postgresql';

interface SqlStatementSegment {
    sql: string;
    startLine: number;
    endLine: number;
}

interface StatementExecutionStatus {
    successLines: number[];
    failedLines: number[];
    skippedLines: number[];
}

export class SqlEditor {
    private statusBarItem: vscode.StatusBarItem;
    private resultView: SqlEditorResultView;
    private successDecorationType: vscode.TextEditorDecorationType;
    private failedDecorationType: vscode.TextEditorDecorationType;
    private skippedDecorationType: vscode.TextEditorDecorationType;
    private statementStatusByDocUri = new Map<string, StatementExecutionStatus>();

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
        const asFileUri = (relativePath: string): vscode.Uri | undefined => {
            if ((context as any).extensionUri && vscode.Uri && typeof (vscode.Uri as any).joinPath === 'function') {
                return (vscode.Uri as any).joinPath((context as any).extensionUri, ...relativePath.split('/'));
            }
            const absolutePath = context.asAbsolutePath(relativePath);
            if (vscode.Uri && typeof vscode.Uri.file === 'function') {
                return vscode.Uri.file(absolutePath);
            }
            return undefined;
        };
        const createDecoration = (iconPath: string, symbol: string, color: string): vscode.TextEditorDecorationType => {
            if (vscode.window && typeof (vscode.window as any).createTextEditorDecorationType === 'function') {
                return (vscode.window as any).createTextEditorDecorationType({
                    gutterIconPath: asFileUri(iconPath),
                    gutterIconSize: 'contain',
                    isWholeLine: true,
                    before: {
                        contentText: symbol,
                        color,
                        margin: '0 10px 0 0'
                    }
                });
            }
            return { dispose: () => {} } as vscode.TextEditorDecorationType;
        };

        this.successDecorationType = createDecoration('media/sql-status-success.svg', '✓', '#2EA043');
        this.failedDecorationType = createDecoration('media/sql-status-failed.svg', '✗', '#D73A49');
        this.skippedDecorationType = createDecoration('media/sql-status-skipped.svg', '●', '#9AA0A6');
        context.subscriptions.push(this.successDecorationType, this.failedDecorationType, this.skippedDecorationType);

        // Register providers and commands (guarded for test environment)
        if (vscode.languages && typeof vscode.languages.registerCodeLensProvider === 'function') {
            context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'sql' }, new SqlCodeLensProvider(this)));
            context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'postgresql' }, new SqlCodeLensProvider(this)));
        }
        if (vscode.languages && typeof vscode.languages.registerCompletionItemProvider === 'function') {
            context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: 'sql' }, new SqlCompletionProvider(this), '.', '"'));
            context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: 'postgresql' }, new SqlCompletionProvider(this), '.', '"'));
        }

        if (vscode.commands && typeof vscode.commands.registerCommand === 'function') {
            context.subscriptions.push(
                vscode.commands.registerCommand('postgres-editor.runSqlFile', async () => { await this.runSqlFile(); }),
                vscode.commands.registerCommand('postgres-editor.runSqlSelection', async () => { await this.runSqlSelection(); }),
                vscode.commands.registerCommand('postgres-editor.selectSqlDocumentConnection', async () => { await this.selectDocumentConnection(); }),
                vscode.commands.registerCommand('postgres-editor.newSqlFile', async () => {
                    const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: '' });
                    await vscode.window.showTextDocument(doc, { preview: false });
                })
            );
        } else {
            // In test environments without command registration, provide no-op placeholders
            // This avoids throwing during tests but keeps semantics intact when running in real VS Code.
        }

        // Update status bar on active editor change
        if (vscode.window && typeof (vscode.window as any).onDidChangeActiveTextEditor === 'function') {
            context.subscriptions.push((vscode.window as any).onDidChangeActiveTextEditor(() => {
                this.updateStatusBar();
                this.applyStoredDecorationsForActiveEditor();
            }));
        }
        if (vscode.workspace && typeof (vscode.workspace as any).onDidCloseTextDocument === 'function') {
            context.subscriptions.push((vscode.workspace as any).onDidCloseTextDocument((doc: vscode.TextDocument) => this.onDocumentClosed(doc)));
        }

        this.updateStatusBar();
        this.applyStoredDecorationsForActiveEditor();
    }

    private getDocumentKey(doc: vscode.TextDocument) {
        return `${DOC_CONN_KEY}:${doc.uri.toString()}`;
    }

    getSavedConnectionForDocument(doc: vscode.TextDocument): { connectionId?: string; schema?: string } {
        const key = this.getDocumentKey(doc);
        const val = this.context.workspaceState.get<{ connectionId?: string; schema?: string }>(key);
        return val || {};
    }

    async getConnectionLabelForDocument(doc: vscode.TextDocument): Promise<string> {
        const mapping = this.getSavedConnectionForDocument(doc);
        if (!mapping.connectionId) {
            return 'Connection: (Choose)';
        }

        const configs = await this.connectionManager.getConnections();
        const cfg = configs.find(c => c.id === mapping.connectionId);
        return `Connection: ${cfg?.name || mapping.connectionId}`;
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
        if (!editor || !isSqlLikeLanguage(editor.document.languageId)) {
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
        if (!editor || !isSqlLikeLanguage(editor.document.languageId)) {
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
        if (!editor || !isSqlLikeLanguage(editor.document.languageId)) {
            vscode.window.showErrorMessage('Open an SQL document first');
            return;
        }

        const hasSelection = !editor.selection.isEmpty;
        const sql = hasSelection ? editor.document.getText(editor.selection) : editor.document.getText();
        if (!sql || sql.trim().length === 0) {
            vscode.window.showErrorMessage('No SQL selected or in document');
            return;
        }

        const baseLine = hasSelection ? editor.selection.start.line : 0;
        await this.runSqlForDocument(editor.document, sql, baseLine);
    }

    async runSqlFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isSqlLikeLanguage(editor.document.languageId)) {
            vscode.window.showErrorMessage('Open an SQL document first');
            return;
        }

        const sql = editor.document.getText();
        if (!sql || sql.trim().length === 0) {
            vscode.window.showErrorMessage('No SQL to run');
            return;
        }

        await this.runSqlForDocument(editor.document, sql, 0);
    }

    private getLineFromOffset(text: string, offset: number, baseLine: number): number {
        let line = baseLine;
        for (let i = 0; i < offset && i < text.length; i++) {
            if (text[i] === '\n') {
                line++;
            }
        }
        return line;
    }

    private splitSqlStatementsWithRanges(sqlText: string, baseLine: number): SqlStatementSegment[] {
        const statements: SqlStatementSegment[] = [];
        let segmentStart = 0;
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inLineComment = false;
        let inBlockComment = false;
        let dollarTag: string | null = null;

        const pushSegment = (segmentEnd: number) => {
            const raw = sqlText.slice(segmentStart, segmentEnd);
            if (!raw.trim()) {
                segmentStart = segmentEnd;
                return;
            }

            const firstRelative = raw.search(/\S/);
            let lastRelative = raw.length - 1;
            while (lastRelative >= 0 && /\s/.test(raw[lastRelative])) {
                lastRelative--;
            }

            if (firstRelative === -1 || lastRelative < 0) {
                segmentStart = segmentEnd;
                return;
            }

            const firstOffset = segmentStart + firstRelative;
            const lastOffset = segmentStart + lastRelative;
            statements.push({
                sql: raw.trim(),
                startLine: this.getLineFromOffset(sqlText, firstOffset, baseLine),
                endLine: this.getLineFromOffset(sqlText, lastOffset, baseLine)
            });

            segmentStart = segmentEnd;
        };

        for (let i = 0; i < sqlText.length; i++) {
            const ch = sqlText[i];
            const next = i + 1 < sqlText.length ? sqlText[i + 1] : '';

            if (inLineComment) {
                if (ch === '\n') {
                    inLineComment = false;
                }
                continue;
            }

            if (inBlockComment) {
                if (ch === '*' && next === '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }

            if (dollarTag) {
                const candidate = sqlText.slice(i, i + dollarTag.length);
                if (candidate === dollarTag) {
                    dollarTag = null;
                    i += dollarTag ? 0 : candidate.length - 1;
                }
                continue;
            }

            if (inSingleQuote) {
                if (ch === '\'' && next === '\'') {
                    i++;
                    continue;
                }
                if (ch === '\'') {
                    inSingleQuote = false;
                }
                continue;
            }

            if (inDoubleQuote) {
                if (ch === '"' && next === '"') {
                    i++;
                    continue;
                }
                if (ch === '"') {
                    inDoubleQuote = false;
                }
                continue;
            }

            if (ch === '-' && next === '-') {
                inLineComment = true;
                i++;
                continue;
            }

            if (ch === '/' && next === '*') {
                inBlockComment = true;
                i++;
                continue;
            }

            if (ch === '\'') {
                inSingleQuote = true;
                continue;
            }

            if (ch === '"') {
                inDoubleQuote = true;
                continue;
            }

            if (ch === '$') {
                const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sqlText.slice(i));
                if (m) {
                    dollarTag = m[0];
                    i += m[0].length - 1;
                    continue;
                }
            }

            if (ch === ';') {
                pushSegment(i + 1);
            }
        }

        if (segmentStart < sqlText.length) {
            pushSegment(sqlText.length);
        }

        return statements;
    }

    private applyStatementDecorations(doc: vscode.TextDocument, status: StatementExecutionStatus): void {
        this.statementStatusByDocUri.set(doc.uri.toString(), status);

        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === doc.uri.toString());
        if (!editor) {
            return;
        }

        const toRanges = (lines: number[]) => lines.map(line => {
            const lineText = editor.document.lineAt(line);
            return new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineText.text.length));
        });
        editor.setDecorations(this.successDecorationType, toRanges(status.successLines));
        editor.setDecorations(this.failedDecorationType, toRanges(status.failedLines));
        editor.setDecorations(this.skippedDecorationType, toRanges(status.skippedLines));
    }

    private applyStoredDecorationsForActiveEditor(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isSqlLikeLanguage(editor.document.languageId)) {
            return;
        }

        const status = this.statementStatusByDocUri.get(editor.document.uri.toString());
        if (!status) {
            editor.setDecorations(this.successDecorationType, []);
            editor.setDecorations(this.failedDecorationType, []);
            editor.setDecorations(this.skippedDecorationType, []);
            return;
        }

        const toRanges = (lines: number[]) => lines.map(line => {
            const lineText = editor.document.lineAt(line);
            return new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineText.text.length));
        });
        editor.setDecorations(this.successDecorationType, toRanges(status.successLines));
        editor.setDecorations(this.failedDecorationType, toRanges(status.failedLines));
        editor.setDecorations(this.skippedDecorationType, toRanges(status.skippedLines));
    }

    private async runSqlForDocument(doc: vscode.TextDocument, sql: string, baseLine: number) {
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

        // Execute statements sequentially so we can mark per-statement status in the gutter.
        const conn = await this.connectionManager.getConnections();
        const cfg = conn.find(c => c.id === mapping.connectionId);
        const databaseName = cfg ? cfg.database : '';

        const statements = this.splitSqlStatementsWithRanges(sql, baseLine);
        if (statements.length === 0) {
            vscode.window.showErrorMessage('No SQL statements found to run');
            return;
        }

        const status: StatementExecutionStatus = { successLines: [], failedLines: [], skippedLines: [] };
        const selectResults: Array<{ label: string; rows: any[]; columns: string[] }> = [];
        let totalExecutionTime = 0;
        let errorMessage: string | undefined;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            const r = await this.sqlTerminalProvider.executeSqlSilent(
                mapping.connectionId!,
                databaseName,
                mapping.schema || 'public',
                statement.sql
            );

            totalExecutionTime += r.executionTime;

            if (r.error) {
                status.failedLines.push(statement.startLine);
                errorMessage = r.error;
                for (let j = i + 1; j < statements.length; j++) {
                    status.skippedLines.push(statements[j].startLine);
                }
                break;
            }

            status.successLines.push(statement.startLine);
            const singleResult = r.result;
            if (singleResult && (singleResult.command === 'SELECT' || singleResult.command === 'SHOW')) {
                selectResults.push({
                    label: `${singleResult.command} (line ${statement.startLine + 1})`,
                    rows: singleResult.rows || [],
                    columns: Object.keys((singleResult.rows && singleResult.rows[0]) || {})
                });
            }
        }

        this.applyStatementDecorations(doc, status);

        if (selectResults.length > 0) {
            this.resultView.showMultipleQueryResults(`SQL Result - ${doc.fileName}`, selectResults);
        }

        if (errorMessage) {
            vscode.window.showErrorMessage(`Failed to execute SQL: ${errorMessage}`);
            return;
        }

        if (selectResults.length === 0) {
            vscode.window.showInformationMessage(`Executed ${status.successLines.length} statement(s) (${totalExecutionTime}ms)`);
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

    async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        if (!isSqlLikeLanguage(document.languageId)) return [];

        const top = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        const connTitle = await this.manager.getConnectionLabelForDocument(document);

        const codelenses: vscode.CodeLens[] = [];
        codelenses.push(new vscode.CodeLens(top, { title: connTitle + ' (Change)', command: 'postgres-editor.selectSqlDocumentConnection' }));
        codelenses.push(new vscode.CodeLens(top, { title: 'Run Selection', command: 'postgres-editor.runSqlSelection' }));
        codelenses.push(new vscode.CodeLens(top, { title: 'Run File', command: 'postgres-editor.runSqlFile' }));
        return codelenses;
    }
}

class SqlCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private manager: SqlEditor) {}

    private stripQuotes(identifier: string): string {
        const trimmed = identifier.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    private splitQualifiedName(name: string): { schema?: string; table: string } {
        const parts = name.split('.').map(p => this.stripQuotes(p));
        if (parts.length >= 2) {
            return { schema: parts[parts.length - 2], table: parts[parts.length - 1] };
        }
        return { table: parts[0] };
    }

    private resolveAliasTable(document: vscode.TextDocument, position: vscode.Position, alias: string): { schema?: string; table: string } | null {
        const fullText = document.getText();
        const cursorOffset = document.offsetAt(position);

        // Resolve aliases from the current SQL statement (between semicolons),
        // so completion also works in SELECT list positions before FROM/JOIN.
        const statementStart = fullText.lastIndexOf(';', Math.max(0, cursorOffset - 1)) + 1;
        const statementEndIndex = fullText.indexOf(';', cursorOffset);
        const statementEnd = statementEndIndex === -1 ? fullText.length : statementEndIndex;
        const statementText = fullText.slice(statementStart, statementEnd);

        // Match FROM/JOIN targets and aliases in the current statement.
        // Examples:
        //   FROM public.users u
        //   FROM "public"."users" AS u
        //   JOIN users u
        const aliasRegex = /\b(?:FROM|JOIN)\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)\s+(?:AS\s+)?("[^"]+"|[A-Za-z_][\w$]*)/gi;

        let match: RegExpExecArray | null;
        let resolved: { schema?: string; table: string } | null = null;

        while ((match = aliasRegex.exec(statementText)) !== null) {
            const tableRef = match[1].replace(/\s+/g, '');
            const foundAlias = this.stripQuotes(match[2]);

            if (foundAlias.toLowerCase() === alias.toLowerCase()) {
                resolved = this.splitQualifiedName(tableRef);
            }
        }

        return resolved;
    }

    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
        const line = document.lineAt(position.line).text.substring(0, position.character);
        // Look for pattern: qualifier. where qualifier may be alias/table/schema-qualified table
        const m = /((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)\.$/.exec(line);
        if (!m) {
            return null;
        }

        const qualifierRaw = m[1].replace(/\s+/g, '');
        const qualifierParts = this.splitQualifiedName(qualifierRaw);

        let schema: string | undefined = qualifierParts.schema;
        let table: string | undefined = qualifierParts.table;

        // Determine connection for document
        const mapping = this.manager.getSavedConnectionForDocument(document);
        if (!mapping.connectionId) {
            return null; // no mapped connection -> no table metadata
        }

        // If user typed alias., resolve alias back to underlying table from FROM/JOIN clauses.
        if (!schema && table) {
            const aliasResolved = this.resolveAliasTable(document, position, table);
            if (aliasResolved) {
                schema = aliasResolved.schema;
                table = aliasResolved.table;
            }
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
