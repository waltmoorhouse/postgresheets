import { describe, it, expect, beforeEach } from '@jest/globals';
import { SqlTerminalProvider } from '../src/sqlTerminalProvider';
import { QueryHistory } from '../src/queryHistory';
import * as vscode from 'vscode';

// Mock minimal ConnectionManager
class MockConnectionManager {
    async getConnections() {
        return [{ id: 'c1', name: 'test', host: 'localhost', port: 5432, database: 'db', username: 'user' }];
    }
    async getClient(id: string) {
        return {
            query: async (sql: string) => {
                // simple fake result
                return { command: 'SELECT', rows: [{ a: 1 }], rowCount: 1 };
            }
        } as any;
    }
}

// Minimal mock of extension context
class MockContext implements Partial<vscode.ExtensionContext> {
    globalState = {
        _store: new Map<string, any>(),
        get: (k: string, def?: any) => this.globalState._store.get(k) ?? def,
        update: (k: string, v: any) => { this.globalState._store.set(k, v); return Promise.resolve(); }
    } as any;
    subscriptions = [] as any;
}

describe('SqlTerminal integration', () => {
    let provider: SqlTerminalProvider;
    let queryHistory: QueryHistory;
    let ctx: MockContext;

    beforeEach(() => {
        ctx = new MockContext() as any;
        queryHistory = new QueryHistory(ctx as any);
        provider = new SqlTerminalProvider(ctx as any, new MockConnectionManager() as any, queryHistory as any);
    });

    it('handles arrow keys and history navigation and resize', async () => {
        // Mock input prompt for schema selection
        (vscode.window as any).showInputBox = async () => 'public';

        // Open a terminal for connection c1
        await provider.openSqlTerminal('c1');
        // Grab the pty that was created
        const got: any = (provider as any)._lastPty;
        expect(got).toBeDefined();

        const writeEvents: string[] = [];
        const disp = got.writeEmitter.event((s: string) => writeEvents.push(s));

        // allow pty.open() to run in test env and emit initial messages
        await new Promise(r => setTimeout(r, 10));

        // Simulate typing 'select 1;'<enter>
        const pty: any = got.pty;
        pty.handleInput('s'); pty.handleInput('e'); pty.handleInput('l'); pty.handleInput('e'); pty.handleInput('c'); pty.handleInput('t'); pty.handleInput(' ');
        pty.handleInput('1'); pty.handleInput(';');
        pty.handleInput('\r');

        // After execution, query should be added to history
        // Wait for async executeQuery to finish and add to history
        let h = queryHistory.getHistory();
        const start = Date.now();
        while (h.length < 1 && Date.now() - start < 2000) {
            await new Promise(r => setTimeout(r, 10));
            h = queryHistory.getHistory();
        }
        expect(h.length).toBeGreaterThanOrEqual(1);

        // Now simulate up arrow to retrieve the last command
        pty.handleInput('\x1b'); pty.handleInput('[A'); // Up arrow (it's assembled by EscapeSequenceParser in production)

        // Resize the terminal
        if (pty.setDimensions) {
            pty.setDimensions({ columns: 120, rows: 30 });
        }

        // Ensure some output occurred (header or prompt)
        expect(writeEvents.join('')).toContain('user@test');

        disp.dispose?.();
    });

    it('accepts pasted single-line and multi-line input', async () => {
        // Mock input prompt for schema selection
        (vscode.window as any).showInputBox = async () => 'public';

        await provider.openSqlTerminal('c1');
        const got: any = (provider as any)._lastPty;
        expect(got).toBeDefined();

        const pty: any = got.pty;

        // allow pty.open() to run in test env and emit initial messages
        await new Promise(r => setTimeout(r, 10));

        // Paste a single-line command (includes \r\n as typical paste)
        pty.handleInput('select 2;\r\n');

        // Wait for it to be added to history
        let h = queryHistory.getHistory();
        const start = Date.now();
        while (h.length < 1 && Date.now() - start < 2000) {
            await new Promise(r => setTimeout(r, 10));
            h = queryHistory.getHistory();
        }
        expect(h.length).toBeGreaterThanOrEqual(1);
        expect(h[0].query.toLowerCase()).toContain('select 2');

        // Now paste multi-line input containing two separate statements
        const beforeLen = h.length;
        pty.handleInput('select 3;\nselect 4;\n');

        // Wait for both to be added
        let h2 = queryHistory.getHistory();
        const start2 = Date.now();
        while (h2.length < beforeLen + 2 && Date.now() - start2 < 2000) {
            await new Promise(r => setTimeout(r, 10));
            h2 = queryHistory.getHistory();
        }

        expect(h2.length).toBeGreaterThanOrEqual(beforeLen + 2);
        const queries = h2.slice(0, 3).map(x => x.query.toLowerCase()).join(' | ');
        expect(queries).toContain('select 2');
        expect(queries).toContain('select 3');
        expect(queries).toContain('select 4');
    });
});
