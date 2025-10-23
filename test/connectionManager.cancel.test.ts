// Use the manual mock in test/__mocks__/vscode.ts
import { jest } from '@jest/globals';
jest.mock('vscode');

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

    test('deleteConnection cancels connecting attempt and deletes config', async () => {
        const ctx = makeContext();
        const mgr = new ConnectionManager(ctx);

        const config = { id: 'del1', name: 'to-delete', host: 'localhost', port: 5432, database: 'db', username: 'user' };
        (ctx.globalState.get as jest.Mock).mockReturnValue([config]);
    ((ctx.secrets.get) as any).mockResolvedValue('pass');

        // Spy on update/delete calls
        const updateSpy = jest.spyOn(ctx.globalState, 'update' as any);
        const secretDeleteSpy = jest.spyOn(ctx.secrets, 'delete' as any);

        // Make sure warning shows 'Disconnect & Delete'
        jest.spyOn(vscode.window, 'showWarningMessage' as any).mockResolvedValue('Disconnect & Delete');

        // Start a hanging connect
        const p = mgr.connect(config.id, false);
        await new Promise((r) => setTimeout(r, 20));

        // Now request delete - should cancel and then delete
        await mgr.deleteConnection(config.id);

        expect(updateSpy).toHaveBeenCalledWith('connections', []);
        expect(secretDeleteSpy).toHaveBeenCalledWith(`postgres-password-${config.id}`);

        const result = await p;
        expect(result).toBeNull();
    });

    test('deleteConnection disconnects active client and deletes config', async () => {
        const ctx = makeContext();
        const mgr = new ConnectionManager(ctx);

        const config = { id: 'del2', name: 'to-delete-conn', host: 'localhost', port: 5432, database: 'db', username: 'user' };
        (ctx.globalState.get as jest.Mock).mockReturnValue([config]);
    ((ctx.secrets.get) as any).mockResolvedValue('pass');

        const updateSpy = jest.spyOn(ctx.globalState, 'update' as any);
        const secretDeleteSpy = jest.spyOn(ctx.secrets, 'delete' as any);

        // Simulate an active client
        const fakeClient = { end: jest.fn(async () => {}) } as any;
        (mgr as any).connections.set(config.id, fakeClient);
        (mgr as any).connectionStatuses.set(config.id, 'connected');

        jest.spyOn(vscode.window, 'showWarningMessage' as any).mockResolvedValue('Disconnect & Delete');

        await mgr.deleteConnection(config.id);

        expect(fakeClient.end).toHaveBeenCalled();
        expect(updateSpy).toHaveBeenCalledWith('connections', []);
        expect(secretDeleteSpy).toHaveBeenCalledWith(`postgres-password-${config.id}`);
        expect((mgr as any).connections.has(config.id)).toBe(false);
    });

    test('deleteConnection does not delete when user cancels', async () => {
        const ctx = makeContext();
        const mgr = new ConnectionManager(ctx);

        const config = { id: 'del3', name: 'no-delete', host: 'localhost', port: 5432, database: 'db', username: 'user' };
        (ctx.globalState.get as jest.Mock).mockReturnValue([config]);
    ((ctx.secrets.get) as any).mockResolvedValue('pass');

        const updateSpy = jest.spyOn(ctx.globalState, 'update' as any);
        const secretDeleteSpy = jest.spyOn(ctx.secrets, 'delete' as any);

        // User cancels the delete confirmation
        jest.spyOn(vscode.window, 'showWarningMessage' as any).mockResolvedValue('Cancel');

        await mgr.deleteConnection(config.id);

        expect(updateSpy).not.toHaveBeenCalled();
        expect(secretDeleteSpy).not.toHaveBeenCalled();
    });

    test('manual retry after cancel should succeed', async () => {
        const ctx = makeContext();
        const mgr = new ConnectionManager(ctx);

        const config = {
            id: 'test-retry', name: 'retry-test', host: 'localhost', port: 5432,
            database: 'db', username: 'user'
        };
        jest.spyOn(ctx.globalState, 'get' as any).mockReturnValue([config]);
        jest.spyOn(ctx.secrets, 'get' as any).mockResolvedValue('pass');

        // Start initial connect attempt (it will hang)
        const firstAttempt = mgr.connect(config.id, false);
        await new Promise((r) => setTimeout(r, 20));

        // Cancel it
        const cancelled = await mgr.cancelConnect(config.id);
        expect(cancelled).toBe(true);

        // First attempt should resolve to null
        const firstResult = await firstAttempt;
        expect(firstResult).toBeNull();

        // Status should be disconnected after cancel
        expect(mgr.getConnectionStatus(config.id)).toBe('disconnected');

        // Now the user manually retries by calling connect() again
        // This should be allowed (no retry prevention logic)
        const secondAttempt = mgr.connect(config.id, false);
        await new Promise((r) => setTimeout(r, 20));

        // Status should be connecting for the new attempt
        expect(mgr.getConnectionStatus(config.id)).toBe('connecting');

        // Clean up - cancel the second attempt so the test can complete
        await mgr.cancelConnect(config.id);
        await secondAttempt;
    });
});
