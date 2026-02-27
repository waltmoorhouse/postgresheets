/**
 * SQL Terminal Provider - Custom terminal with PostgreSQL connection context
 * Allows running raw SQL commands with connection-aware prompt
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { QueryHistory } from './queryHistory';

interface TerminalState {
    connectionId: string;
    connectionName: string;
    database: string;
    schema: string;
}

/**
 * Manages line editing with cursor position
 */
export const MAX_LINE_LENGTH = 10000; // maximum characters allowed in a single input line

export class LineEditor {
    private line: string = '';
    private cursorPos: number = 0;

    /**
     * Insert character(s) at cursor position. Returns true if inserted, false if rejected (limit reached)
     */
    insertChar(char: string): boolean {
        if (this.line.length + char.length > MAX_LINE_LENGTH) {
            return false;
        }

        this.line = this.line.slice(0, this.cursorPos) + char + this.line.slice(this.cursorPos);
        this.cursorPos += char.length;
        return true;
    }

    deleteChar(): void {
        if (this.cursorPos < this.line.length) {
            this.line = this.line.slice(0, this.cursorPos) + this.line.slice(this.cursorPos + 1);
        }
    }

    backspace(): void {
        if (this.cursorPos > 0) {
            this.line = this.line.slice(0, this.cursorPos - 1) + this.line.slice(this.cursorPos);
            this.cursorPos--;
        }
    }

    moveCursor(delta: number): void {
        this.cursorPos = Math.max(0, Math.min(this.line.length, this.cursorPos + delta));
    }

    moveCursorToStart(): void {
        this.cursorPos = 0;
    }

    moveCursorToEnd(): void {
        this.cursorPos = this.line.length;
    }

    moveWordForward(): void {
        if (this.cursorPos >= this.line.length) return;
        while (this.cursorPos < this.line.length && this.line[this.cursorPos] === ' ') {
            this.cursorPos++;
        }
        while (this.cursorPos < this.line.length && this.line[this.cursorPos] !== ' ') {
            this.cursorPos++;
        }
    }

    moveWordBackward(): void {
        if (this.cursorPos === 0) return;
        let i = this.cursorPos - 1;
        // skip spaces to the left
        while (i >= 0 && this.line[i] === ' ') i--;
        // skip non-spaces (the previous word)
        while (i >= 0 && this.line[i] !== ' ') i--;
        // place cursor at the space before that word (so user can see previous word boundary)
        this.cursorPos = Math.max(0, i);
    }

    getLine(): string {
        return this.line;
    }

    setLine(line: string, moveCursorToEnd: boolean = true): void {
        this.line = line;
        this.cursorPos = moveCursorToEnd ? line.length : 0;
    }

    getCursorPos(): number {
        return this.cursorPos;
    }

    clear(): void {
        this.line = '';
        this.cursorPos = 0;
    }

    isEmpty(): boolean {
        return this.line.length === 0;
    }
}

/**
 * Simple parser to accumulate escape sequences (starting with ESC) and return complete sequences
 */
export class EscapeSequenceParser {
    private buffer = '';

    addChar(char: string): string | null {
        // If starting an escape sequence or within one, buffer until we match known sequences
        if (char === '\x1b' || this.buffer.length > 0) {
            this.buffer += char;

            // Known complete sequences
            const completes = ['\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D', '\x1b[3~', '\x1b[1;3D', '\x1b[1;3C', '\x1bb', '\x1bf'];
            if (completes.includes(this.buffer)) {
                const seq = this.buffer;
                this.buffer = '';
                return seq;
            }

            // Some terminals send CSI sequences of varying length; limit buffer to avoid runaway
            if (this.buffer.length > 8) {
                const b = this.buffer;
                this.buffer = '';
                return b;
            }

            return null; // still buffering
        }

        return char;
    }

    reset(): void {
        this.buffer = '';
    }
}

/**
 * Manages navigation through query history for a specific connection
 */
export class HistoryNavigator {
    private currentIndex = -1; // -1 = not navigating
    private savedPartialCommand = '';
    private localHistory: string[] = [];

    constructor(private queryHistory: QueryHistory, private connectionId: string) {
        this.loadHistory();
    }

    private loadHistory(): void {
        const entries = this.queryHistory.getByConnection(this.connectionId).slice();
        // entries are sorted most-recent-first, so reverse to have oldest at 0
        this.localHistory = entries.reverse().map(e => e.query);
        this.currentIndex = -1;
        this.savedPartialCommand = '';
    }

    navigateUp(currentLine: string): string | null {
        if (this.localHistory.length === 0) return null;

        if (this.currentIndex === -1) {
            this.savedPartialCommand = currentLine;
            this.currentIndex = this.localHistory.length; // point after last (newest)
        }

        if (this.currentIndex > 0) {
            this.currentIndex--;
            return this.localHistory[this.currentIndex];
        }

        // at oldest
        return this.localHistory[0];
    }

    navigateDown(): string | null {
        if (this.currentIndex === -1) return null;

        this.currentIndex++;
        if (this.currentIndex >= this.localHistory.length) {
            // return saved partial and reset navigation
            const cmd = this.savedPartialCommand;
            this.currentIndex = -1;
            this.savedPartialCommand = '';
            return cmd;
        }

        return this.localHistory[this.currentIndex];
    }

    reset(): void {
        this.loadHistory();
    }
}

export class SqlTerminalProvider {
    private terminals: Map<vscode.Terminal, TerminalState> = new Map();
    private readonly connectionManager: ConnectionManager;
    private readonly queryHistory: QueryHistory;

    constructor(
        private readonly context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        queryHistory: QueryHistory
    ) {
        this.connectionManager = connectionManager;
        this.queryHistory = queryHistory;

        // Clean up terminals when they are closed (only if API available in test env)
        if (vscode.window && typeof vscode.window.onDidCloseTerminal === 'function') {
            context.subscriptions.push(
                vscode.window.onDidCloseTerminal(terminal => {
                    this.terminals.delete(terminal);
                })
            );
        }
    }

    async openSqlTerminal(connectionId?: string): Promise<void> {
        // Get available connections
        const connections = await this.connectionManager.getConnections();
        
        if (connections.length === 0) {
            vscode.window.showErrorMessage('No PostgreSQL connections available. Please add a connection first.');
            return;
        }

        // If no connection specified, prompt user to select one
        let selectedConnection = connections.find(c => c.id === connectionId);
        
        if (!selectedConnection) {
            const picks = connections.map(conn => ({
                label: conn.name,
                description: `${conn.host}:${conn.port}/${conn.database}`,
                id: conn.id
            }));

            const selected = await vscode.window.showQuickPick(picks, {
                placeHolder: 'Select a PostgreSQL connection'
            });

            if (!selected) {
                return;
            }

            selectedConnection = connections.find(c => c.id === selected.id);
        }

        if (!selectedConnection) {
            return;
        }

        // Prompt for schema (default: public)
        const schema = await vscode.window.showInputBox({
            prompt: 'Enter schema name',
            value: 'public',
            placeHolder: 'public'
        });

        if (!schema) {
            return;
        }

        // Create custom terminal with WriteProcess
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number>();
        const lineEditor = new LineEditor();
        const escapeParser = new EscapeSequenceParser();
        const historyNavigator = new HistoryNavigator(this.queryHistory, selectedConnection.id);
        let commandBuffer = '';
        let inMultiLine = false;
        let simpleMode = false; // fallback mode if advanced editing fails
        let simpleCurrentLine = '';

        let terminalWidth = 80;

        function redrawLine() {
            const promptStr = inMultiLine ? `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m .. ` : `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m > `;
            const line = lineEditor.getLine();
            const cursorPos = lineEditor.getCursorPos();

            // Return to prompt start, clear line, write prompt + line
            writeEmitter.fire('\r' + promptStr);
            writeEmitter.fire('\x1b[K'); // clear to end of line
            writeEmitter.fire(line);

            const charsAfterCursor = line.length - cursorPos;
            if (charsAfterCursor > 0) {
                writeEmitter.fire(`\x1b[${charsAfterCursor}D`);
            }
        }
        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            
            open: () => {
                const prompt = `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m > `;
                writeEmitter.fire(`\x1b[1mPostgreSQL SQL Terminal\x1b[0m\r\n`);
                writeEmitter.fire(`Connected to: ${selectedConnection!.name} (${selectedConnection!.host}:${selectedConnection!.port})\r\n`);
                writeEmitter.fire(`Database: ${selectedConnection!.database}\r\n`);
                writeEmitter.fire(`Schema: ${schema}\r\n`);
                writeEmitter.fire(`\r\nType SQL commands and press Enter. Use ; to execute. Type \\q to quit.\r\n\r\n`);
                writeEmitter.fire(prompt);
            },

            setDimensions: (dimensions: vscode.TerminalDimensions) => {
                if (dimensions && dimensions.columns) {
                    terminalWidth = dimensions.columns;
                }
                // Redraw to ensure cursor position accounts for wrapping
                redrawLine();
            },

            close: () => {
                closeEmitter.fire(0);
            },

            handleInput: async (data: string) => {
                // Handle pasted data (which may be multiple characters including newlines) by iterating
                // through each character and letting the escape parser assemble sequences. This ensures
                // multi-line paste works correctly instead of being ignored when `data` contains >1 char.
                for (let i = 0; i < data.length; i++) {
                    const ch = data[i];
                    const seq = escapeParser.addChar(ch);
                    if (seq === null) continue; // still buffering an escape sequence

                    const promptStr = `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m > `;
                    const multiPrompt = `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m .. `;

                    // Fallback simple mode (if editing fails)
                    if (simpleMode) {
                        // ENTER (treat \n like Enter too)
                        if (seq === '\r' || seq === '\n') {
                            writeEmitter.fire('\r\n');
                            const line = simpleCurrentLine;

                            if (line.trim() === '\\q' || line.trim() === 'exit' || line.trim() === 'quit') {
                                writeEmitter.fire('Bye!\r\n');
                                closeEmitter.fire(0);
                                return;
                            }

                            commandBuffer += line + ' ';

                            if (line.trim().endsWith(';')) {
                                const sql = commandBuffer.trim();
                                await this.executeQuery(
                                    writeEmitter,
                                    selectedConnection!.id,
                                    selectedConnection!.name,
                                    selectedConnection!.database,
                                    schema,
                                    sql
                                );
                                commandBuffer = '';
                                inMultiLine = false;
                                historyNavigator.reset();
                                writeEmitter.fire(promptStr);
                            } else {
                                inMultiLine = true;
                                writeEmitter.fire(multiPrompt);
                            }

                            simpleCurrentLine = '';
                        } else if (seq === '\x7f') {
                            if (simpleCurrentLine.length > 0) {
                                simpleCurrentLine = simpleCurrentLine.slice(0, -1);
                                writeEmitter.fire('\b \b');
                            }
                        } else if (seq.length === 1 && seq >= ' ') {
                            // printable
                            simpleCurrentLine += seq;
                            writeEmitter.fire(seq);
                        }

                        continue;
                    }

                    // ENTER (treat \n like Enter too)
                    if (seq === '\r' || seq === '\n') {
                        writeEmitter.fire('\r\n');
                        const line = lineEditor.getLine();

                        if (line.trim() === '\\q' || line.trim() === 'exit' || line.trim() === 'quit') {
                            writeEmitter.fire('Bye!\r\n');
                            closeEmitter.fire(0);
                            return;
                        }

                        commandBuffer += line + ' ';

                        if (line.trim().endsWith(';')) {
                            const sql = commandBuffer.trim();
                            await this.executeQuery(
                                writeEmitter,
                                selectedConnection!.id,
                                selectedConnection!.name,
                                selectedConnection!.database,
                                schema,
                                sql
                            );
                            commandBuffer = '';
                            inMultiLine = false;
                            historyNavigator.reset();
                            writeEmitter.fire(promptStr);
                        } else {
                            inMultiLine = true;
                            writeEmitter.fire(multiPrompt);
                        }

                        lineEditor.clear();
                    }
                    // Backspace
                    else if (seq === '\x7f') {
                        lineEditor.backspace();
                        redrawLine();
                    }
                    // Delete key
                    else if (seq === '\x1b[3~') {
                        lineEditor.deleteChar();
                        redrawLine();
                    }
                    // Left/Right arrows
                    else if (seq === '\x1b[D') {
                        lineEditor.moveCursor(-1);
                        redrawLine();
                    }
                    else if (seq === '\x1b[C') {
                        lineEditor.moveCursor(1);
                        redrawLine();
                    }
                    // Up/Down arrows -> history navigation
                    else if (seq === '\x1b[A') {
                        const prev = historyNavigator.navigateUp(lineEditor.getLine());
                        if (prev !== null) {
                            lineEditor.setLine(prev, true);
                            redrawLine();
                        }
                    }
                    else if (seq === '\x1b[B') {
                        const next = historyNavigator.navigateDown();
                        if (next !== null) {
                            lineEditor.setLine(next, true);
                            redrawLine();
                        }
                    }
                    // Ctrl+C - cancel
                    else if (seq === '\x03') {
                        writeEmitter.fire('^C\r\n');
                        lineEditor.clear();
                        commandBuffer = '';
                        inMultiLine = false;
                        escapeParser.reset();
                        writeEmitter.fire(promptStr);
                    }
                    // Ctrl+A / Ctrl+E
                    else if (seq === '\x01') {
                        lineEditor.moveCursorToStart();
                        redrawLine();
                    }
                    else if (seq === '\x05') {
                        lineEditor.moveCursorToEnd();
                        redrawLine();
                    }
                    // Alt+Left / Alt+B (word back)
                    else if (seq === '\x1b[1;3D' || seq === '\x1bb') {
                        lineEditor.moveWordBackward();
                        redrawLine();
                    }
                    // Alt+Right / Alt+F (word forward)
                    else if (seq === '\x1b[1;3C' || seq === '\x1bf') {
                        lineEditor.moveWordForward();
                        redrawLine();
                    }
                    // Printable char
                    else if (seq.length === 1 && seq >= ' ') {
                        try {
                            const ok = lineEditor.insertChar(seq);
                            if (!ok) {
                                // Reached max line length
                                writeEmitter.fire('\r\n\x1b[33mWarning: line length limit reached (max ' + MAX_LINE_LENGTH + ' chars).\x1b[0m\r\n');
                            }
                            redrawLine();
                        } catch (err) {
                            // Fallback to simple mode
                            simpleMode = true;
                            writeEmitter.fire('\r\n\x1b[31mLine editing failed, falling back to simple input mode.\x1b[0m\r\n');
                        }
                    }
                    // Unknown / pass-through
                    else {
                        // ignore
                    }
                }
            }
        };

        // Expose pty creation for tests by attaching it to the provider instance for now
        // so tests can obtain a pseudoterminal for a given connection if needed.
        (this as any)._lastPty = { pty, writeEmitter, closeEmitter, selectedConnection, schema };

        if (vscode.window && typeof vscode.window.createTerminal === 'function') {
            const terminal = vscode.window.createTerminal({
                name: `SQL: ${selectedConnection.name}/${selectedConnection.database}`,
                pty
            });

            this.terminals.set(terminal, {
                connectionId: selectedConnection.id,
                connectionName: selectedConnection.name,
                database: selectedConnection.database,
                schema: schema
            });

            terminal.show();
        } else {
            // In test environments where `createTerminal` is not available, keep pty accessible via _lastPty
            // Call open() to simulate terminal initialization so tests can observe initial display
            try {
                // open in next tick so tests can attach listeners after openSqlTerminal returns
                setImmediate(() => {
                    try { pty.open(undefined); } catch (e) { /* ignore */ }
                });
            } catch (e) {
                // ignore
            }
            writeEmitter.fire('\r\n\x1b[33mNote: Terminal UI not available in test environment; pseudoterminal created for testing.\x1b[0m\r\n');
            // Also emit initial header so integration tests can assert on startup behavior
            writeEmitter.fire('\x1b[1mPostgreSQL SQL Terminal\x1b[0m\r\n');
        }
    }

    private async executeQuery(
        writeEmitter: vscode.EventEmitter<string>,
        connectionId: string,
        connectionName: string,
        database: string,
        schema: string,
        sql: string
    ): Promise<void> {
        const startTime = Date.now();

        try {
            const client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                writeEmitter.fire(`\x1b[31mError: Not connected to database\x1b[0m\r\n`);
                return;
            }

            // Set search path to the specified schema
            await client.query(`SET search_path TO "${schema}", public`);

            // Warn for very large SQL strings
            if (sql.length > MAX_LINE_LENGTH) {
                writeEmitter.fire(`\x1b[33mWarning: executing very large SQL (${Math.round(sql.length/1024)} KB). This may take a while.\x1b[0m\r\n`);
            }

            // Execute the query
            const result = await client.query(sql);
            const executionTime = Date.now() - startTime;

            // Log to query history
            console.log(`[SqlTerminal] Adding query to history: ${sql.substring(0, 50)}...`);
            await this.queryHistory.addQuery(sql, connectionId, connectionName, database, executionTime);

            // Notify Query History view to refresh (if open)
            try {
                await vscode.commands.executeCommand('postgres-editor.refreshQueryHistory');
            } catch (e) {
                console.log('[SqlTerminal] Failed to refresh query history view:', e);
            }

            // Display results
            if (result.command === 'SELECT' || result.command === 'SHOW') {
                // Display result rows
                if (result.rows.length === 0) {
                    writeEmitter.fire(`\x1b[33m(0 rows)\x1b[0m\r\n`);
                } else {
                    // Format as simple table
                    const columns = Object.keys(result.rows[0]);
                    const maxWidths = columns.map(col => 
                        Math.max(col.length, ...result.rows.map(row => String(row[col] ?? '').length))
                    );

                    // Header
                    const headerRow = columns.map((col, i) => col.padEnd(maxWidths[i])).join(' | ');
                    const separator = maxWidths.map(w => '-'.repeat(w)).join('-+-');
                    
                    writeEmitter.fire(headerRow + '\r\n');
                    writeEmitter.fire(separator + '\r\n');

                    // Rows (limit to first 100)
                    const displayRows = result.rows.slice(0, 100);
                    for (const row of displayRows) {
                        const rowStr = columns.map((col, i) => 
                            String(row[col] ?? '').padEnd(maxWidths[i])
                        ).join(' | ');
                        writeEmitter.fire(rowStr + '\r\n');
                    }

                    if (result.rows.length > 100) {
                        writeEmitter.fire(`\x1b[33m... and ${result.rows.length - 100} more rows\x1b[0m\r\n`);
                    }

                    writeEmitter.fire(`\x1b[33m(${result.rows.length} rows)\x1b[0m\r\n`);
                }
            } else {
                // Other commands (INSERT, UPDATE, DELETE, etc.)
                writeEmitter.fire(`\x1b[32m${result.command}\x1b[0m `);
                if (result.rowCount !== null && result.rowCount !== undefined) {
                    writeEmitter.fire(`\x1b[33m${result.rowCount}\x1b[0m `);
                }
                writeEmitter.fire('\r\n');
            }

            writeEmitter.fire(`\x1b[90m(${executionTime}ms)\x1b[0m\r\n`);

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            writeEmitter.fire(`\x1b[31mERROR: ${errorMsg}\x1b[0m\r\n`);
            writeEmitter.fire(`\x1b[90m(${executionTime}ms)\x1b[0m\r\n`);
        }
    }

    /**
     * Execute SQL and return raw results (no terminal output). Logs to query history and
     * triggers query history refresh. Returns the `pg` result and executionTime.
     */
    public async executeSqlSilent(
        connectionId: string,
        database: string,
        schema: string,
        sql: string
    ): Promise<{ result?: any; executionTime: number; error?: string }> {
        const startTime = Date.now();
        try {
            let client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                // Try to connect if not already connected
                client = await this.connectionManager.connect(connectionId);
                if (!client) {
                    return { executionTime: Date.now() - startTime, error: 'Not connected' };
                }
            }

            await client.query(`SET search_path TO "${schema}", public`);

            if (sql.length > MAX_LINE_LENGTH) {
                // Keep the same warning behavior as the terminal (but don't write to Terminal)
                console.warn(`Warning: executing very large SQL (${Math.round(sql.length/1024)} KB).`);
            }

            const result = await client.query(sql);
            const executionTime = Date.now() - startTime;

            // Add to query history
            try {
                const connections = await this.connectionManager.getConnections();
                const conn = connections.find(c => c.id === connectionId);
                const connectionName = conn ? conn.name : '';
                const databaseName = conn ? conn.database : database;
                await this.queryHistory.addQuery(sql, connectionId, connectionName, databaseName, executionTime);
                try {
                    await vscode.commands.executeCommand('postgres-editor.refreshQueryHistory');
                } catch (e) {
                    console.log('[SqlTerminal] Failed to refresh query history view:', e);
                }
            } catch (e) {
                // swallow history errors
                console.log('[SqlTerminal] Failed to add query to history', e);
            }

            return { result, executionTime };
        } catch (err) {
            const executionTime = Date.now() - startTime;
            return { executionTime, error: err instanceof Error ? err.message : String(err) };
        }
    }
}

