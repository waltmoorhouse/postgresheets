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
});
