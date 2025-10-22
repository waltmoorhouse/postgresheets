import { jest } from '@jest/globals';
jest.mock('vscode');

import { ConnectionManager } from '../src/connectionManager';
import * as vscode from 'vscode';

describe('ConnectionManager.testConnection', () => {
    afterEach(() => jest.resetModules());

    test('succeeds with a working client', async () => {
        // Use ESM-safe mocking API so Jest intercepts the import correctly
        await jest.unstable_mockModule('pg', () => ({
            Client: class {
                async connect() { return; }
                async end() { return; }
            }
        }));

        const { ConnectionManager: CM } = await import('../src/connectionManager');
        const ctx = { globalState: { get: () => [] }, secrets: { get: async () => undefined } } as any;
        const mgr = new CM(ctx);

        const res = await mgr.testConnection({ connStr: 'postgres://u:p@localhost:5432/db' });
        expect(res.success).toBe(true);
    });

    test('returns error when connect fails', async () => {
        await jest.unstable_mockModule('pg', () => ({
            Client: class {
                async connect() { throw new Error('network error'); }
                async end() { return; }
            }
        }));

        const { ConnectionManager: CM } = await import('../src/connectionManager');
        const ctx = { globalState: { get: () => [] }, secrets: { get: async () => undefined } } as any;
        const mgr = new CM(ctx);

        const res = await mgr.testConnection({ connStr: 'postgres://u:p@localhost:5432/db' });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/network error/);
    });
});
