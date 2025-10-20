// Provide a minimal mock of the VS Code API so ConnectionManager can be
// imported and exercised under Jest.
jest.mock('vscode', () => {
    const EventEmitter = class {
        event: any;
        constructor() { this.event = () => () => {}; }
        fire() {}
    };

    return {
        EventEmitter,
        window: {
            showInputBox: jest.fn(),
            showInformationMessage: jest.fn(),
            showErrorMessage: jest.fn(),
            showQuickPick: jest.fn(),
            withProgress: jest.fn((opts: any, cb: any) => cb({ report: () => {} }, { onCancellationRequested: () => {} }))
        },
        commands: { executeCommand: jest.fn() },
        ThemeIcon: class {},
        ProgressLocation: { Notification: 15 }
    };
});

import { ConnectionManager } from '../src/connectionManager';
import * as vscode from 'vscode';
import { Client } from 'pg';

// Mock minimal vscode.ExtensionContext for tests
const makeContext = (): vscode.ExtensionContext => {
    return {
        subscriptions: [],
        workspaceState: { get: jest.fn(), update: jest.fn() } as any,
        globalState: { get: jest.fn(), update: jest.fn() } as any,
        secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() } as any,
        extensionPath: '',
        asAbsolutePath: (p: string) => p,
        storagePath: undefined,
        globalStoragePath: '',
        logPath: '',
        environmentVariableCollection: {} as any
    } as any;
};

jest.mock('pg', () => {
    class MockClient {
        connectCalled = false;
        async connect() {
            this.connectCalled = true;
            // Never resolve to simulate a blocked connection attempt
            return new Promise(() => {});
        }
        async end() {
            // no-op
        }
        on() {}
    }
    return { Client: MockClient };
});

describe('ConnectionManager cancelConnect', () => {
    test('cancelConnect aborts an in-flight connect', async () => {
        const ctx = makeContext();
        const mgr = new ConnectionManager(ctx);

        // Add a fake connection config and password
        const config = {
            id: 'test1', name: 'test', host: 'localhost', port: 5432,
            database: 'db', username: 'user'
        };
        // stub saved connections
        jest.spyOn(ctx.globalState, 'get' as any).mockReturnValue([config]);
        // stub secret retrieval for password
        jest.spyOn(ctx.secrets, 'get' as any).mockResolvedValue('pass');

        // Start connect (it will hang)
        const connectPromise = mgr.connect(config.id, false);

        // Give it a tick to ensure connect() started
        await new Promise((r) => setTimeout(r, 20));

        // Cancel the connect
        const cancelled = await mgr.cancelConnect(config.id);
        expect(cancelled).toBe(true);

        // The connect should resolve to null after cancellation
        const client = await connectPromise;
        expect(client).toBeNull();
    });
});
