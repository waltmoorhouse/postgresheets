import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { DataEditor } from '../src/dataEditor';

// Minimal mock ConnectionManager
class MockConnectionManager {
    private client: any;
    constructor(client: any, private connections = [{ id: 'c1', name: 'test-conn', database: 'dev-db' }]) {
        this.client = client;
    }

    async getClient(id: string) {
        return this.client;
    }

    async getConnections() {
        return this.connections;
    }

    markBusy(id: string) {
        // no-op
    }

    markIdle(id: string) {
        // no-op
    }
}

// Minimal mock client that responds to the specific queries DataEditor executes
function createMockClient() {
    return {
        query: async (sql: string, values?: any[]) => {
            if (/SELECT a.attname/.test(sql)) {
                return {
                    rows: [{ column_name: 'id', data_type: 'integer', is_nullable: false, typoid: 23, typname: 'int4', typtype: 'b', typelem: 0 }]
                };
            }
            if (/pg_type WHERE oid = ANY/.test(sql)) {
                return { rows: [] };
            }
            if (/SELECT \* FROM/.test(sql) && /LIMIT/.test(sql)) {
                return { rows: [{ id: 1, name: 'Test' }], rowCount: 1 };
            }
            // Default fallback
            return { rows: [], rowCount: 0 };
        }
    };
}

describe('DataEditor Query History Integration', () => {
    let mockClient: any;
    let mockConnectionManager: any;
    let addedQueries: string[];
    let mockQueryHistory: any;
    let dataEditor: DataEditor;

    beforeEach(() => {
        mockClient = createMockClient();
        mockConnectionManager = new MockConnectionManager(mockClient);
        addedQueries = [];
        mockQueryHistory = {
            addQuery: async (q: string, connectionId: string, connectionName: string, databaseName?: string) => {
                addedQueries.push(q);
            }
        };

        // Use a minimal ExtensionContext stub with globalState implemented (used by loadTablePreferences)
        const contextStub: Partial<vscode.ExtensionContext> = {
            subscriptions: [],
            globalState: { get: (jest.fn() as any).mockReturnValue({}), update: (jest.fn() as any).mockResolvedValue(undefined) } as any
        };

        dataEditor = new DataEditor(contextStub as any, mockConnectionManager as any, mockQueryHistory as any);
    });

    it('should record SELECT executed when loading table data', async () => {
        const state = { page: 0, sort: null, filters: {}, searchTerm: '', customWhereClause: '' };
        const payload = await (dataEditor as any).fetchTableState('c1', 'public', 'users', state);

        expect(payload).toBeTruthy();
        // Should have recorded at least one query
        expect(addedQueries.length).toBeGreaterThanOrEqual(1);
        expect(addedQueries[0]).toMatch(/SELECT \*/);
        expect(addedQueries[0]).toMatch(/LIMIT 100/);
    });
});
