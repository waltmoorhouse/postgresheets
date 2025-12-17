import { describe, it, expect, beforeEach } from '@jest/globals';
import { QueryHistory } from '../src/queryHistory';
import { QueryHistoryView } from '../src/queryHistoryView';

class MockWebview {
    public messages: any[] = [];
    cspSource = '';
    postMessage(msg: any) { this.messages.push(msg); }
}

class MockWebviewView {
    webview = new MockWebview();
}

class MockContext {}

describe('QueryHistoryView integration', () => {
    it('sends activeConnectionIds in refreshWithConnections', () => {
        const ctx: any = {};
        const qh = new QueryHistory(ctx as any);
        const qv = new QueryHistoryView(ctx as any, qh as any);

        // Inject a fake view
        (qv as any)._view = { webview: { postMessage: (m: any) => { (qv as any)._lastMessage = m; } } };

        qv.refreshWithConnections(['c1', 'c2']);
        expect((qv as any)._lastMessage).toBeDefined();
        expect((qv as any)._lastMessage.activeConnectionIds).toEqual(['c1', 'c2']);
    });
});
