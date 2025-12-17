import { describe, it, expect } from '@jest/globals';
import { QueryHistory } from '../src/queryHistory';
import { QueryHistoryView } from '../src/queryHistoryView';

class MockWebview {
    public messages: any[] = [];
    cspSource = '';
    postMessage(msg: any) { console.log('[MockWebview] postMessage called with', msg.command); this.messages.push(msg); return Promise.resolve(true); }
    private _listener: ((m: any) => void) | null = null;
    onDidReceiveMessage(cb: (m: any) => void) { this._listener = cb; return { dispose: () => {} }; }
    // helper to simulate message from webview. If the listener returns a Promise (async handler), return it so tests can await completion.
    simulateMessage(m: any) { if (!this._listener) return undefined; const res = (this._listener as any)(m); return res && typeof res.then === 'function' ? res : undefined; }
}

class MockWebviewView {
    webview = new MockWebview();
    private _dispose: (() => void) | null = null;
    onDidDispose(cb: () => void) { this._dispose = cb; return { dispose: () => {} }; }
    simulateDispose() { if (this._dispose) this._dispose(); }
}

class MockContext {
    globalState = {
        _store: new Map<string, any>(),
        get(key: string, def?: any) { return this._store.has(key) ? this._store.get(key) : def; },
        update(key: string, val: any) { this._store.set(key, val); return Promise.resolve(); }
    } as any;
}

describe('QueryHistoryView ready handshake', () => {
    it('responds to ready by posting loadHistory with stored entries', async () => {
        const ctx: any = new MockContext();
        const stored = [{ id: 'e1', query: 'SELECT 1', timestamp: Date.now(), connectionId: 'c1', connectionName: 'local' }];
        ctx.globalState._store.set('postgres-editor.queryHistory', stored);

        const qh = new QueryHistory(ctx as any);
        const qv = new QueryHistoryView(ctx as any, qh as any);

        const mockView = new MockWebviewView();

        // Resolve the webview (this should register message handlers)
        qv.resolveWebviewView(mockView as any, {} as any, {} as any);

        // Simulate webview sending 'ready' and wait for the async handler to finish
        await (mockView.webview.simulateMessage({ command: 'ready' }) as Promise<void>);

        // Now the mock webview should have received a loadHistory message
        console.log('[TEST] mockView.webview.messages after simulate:', mockView.webview.messages);
        expect(mockView.webview.messages.length).toBeGreaterThan(0);
        const load = mockView.webview.messages.find((m: any) => m.command === 'loadHistory');
        expect(load).toBeDefined();
        expect(load.entries).toBeDefined();
        expect(load.entries.length).toBe(1);
        expect(load.entries[0].query).toBe('SELECT 1');
        expect(load.pingId).toBeDefined();
    });
});
