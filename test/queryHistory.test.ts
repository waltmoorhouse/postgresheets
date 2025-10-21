/**
 * Tests for Query History functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import * as vscode from 'vscode';
import { QueryHistory, QueryHistoryEntry } from '../src/queryHistory';

// Mock VSCode ExtensionContext
class MockExtensionContext implements Partial<vscode.ExtensionContext> {
    private state: Map<string, any> = new Map();

    get globalState(): any {
        return {
            get: (key: string, defaultValue?: any) => this.state.get(key) ?? defaultValue,
            update: (key: string, value: any) => {
                if (value === undefined) {
                    this.state.delete(key);
                } else {
                    this.state.set(key, value);
                }
                return Promise.resolve();
            }
        };
    }
}

describe('QueryHistory', () => {
    let mockContext: MockExtensionContext;
    let history: QueryHistory;

    beforeEach(() => {
        mockContext = new MockExtensionContext();
        history = new QueryHistory(mockContext as any, 100);
    });

    describe('addQuery', () => {
        it('should add a query entry', async () => {
            await history.addQuery('SELECT * FROM users', 'conn-1', 'dev-db', 'mydb');
            const entries = history.getHistory();

            expect(entries).toHaveLength(1);
            expect(entries[0].query).toBe('SELECT * FROM users');
            expect(entries[0].connectionId).toBe('conn-1');
            expect(entries[0].connectionName).toBe('dev-db');
            expect(entries[0].databaseName).toBe('mydb');
        });

        it('should not add empty queries', async () => {
            await history.addQuery('', 'conn-1', 'dev-db');
            await history.addQuery('   ', 'conn-1', 'dev-db');

            const entries = history.getHistory();
            expect(entries).toHaveLength(0);
        });

        it('should add multiple queries in order', async () => {
            await history.addQuery('SELECT * FROM users', 'conn-1', 'dev-db');
            await history.addQuery('SELECT * FROM posts', 'conn-1', 'dev-db');
            await history.addQuery('SELECT * FROM comments', 'conn-1', 'dev-db');

            const entries = history.getHistory();
            expect(entries).toHaveLength(3);
            expect(entries[0].query).toBe('SELECT * FROM comments');
            expect(entries[1].query).toBe('SELECT * FROM posts');
            expect(entries[2].query).toBe('SELECT * FROM users');
        });

        it('should trim query whitespace', async () => {
            await history.addQuery('  \n  SELECT * FROM users  \n  ', 'conn-1', 'dev-db');
            const entries = history.getHistory();

            expect(entries[0].query).toBe('SELECT * FROM users');
        });

        it('should include execution time if provided', async () => {
            await history.addQuery('SELECT * FROM users', 'conn-1', 'dev-db', 'mydb', 1234);
            const entries = history.getHistory();

            expect(entries[0].executionTime).toBe(1234);
        });

        it('should enforce max entries limit', async () => {
            const limitedHistory = new QueryHistory(mockContext as any, 5);

            for (let i = 0; i < 10; i++) {
                await limitedHistory.addQuery(`SELECT * FROM table${i}`, 'conn-1', 'dev-db');
            }

            const entries = limitedHistory.getHistory();
            expect(entries).toHaveLength(5);
            expect(entries[0].query).toBe('SELECT * FROM table9');
            expect(entries[4].query).toBe('SELECT * FROM table5');
        });
    });

    describe('getRecent', () => {
        it('should return most recent entries', async () => {
            for (let i = 0; i < 20; i++) {
                await history.addQuery(`SELECT * FROM table${i}`, 'conn-1', 'dev-db');
            }

            const recent = history.getRecent(5);
            expect(recent).toHaveLength(5);
            expect(recent[0].query).toBe('SELECT * FROM table19');
            expect(recent[4].query).toBe('SELECT * FROM table15');
        });

        it('should handle request larger than history', async () => {
            await history.addQuery('SELECT 1', 'conn-1', 'dev-db');
            await history.addQuery('SELECT 2', 'conn-1', 'dev-db');

            const recent = history.getRecent(10);
            expect(recent).toHaveLength(2);
        });
    });

    describe('getByConnection', () => {
        it('should filter by connection ID', async () => {
            await history.addQuery('SELECT * FROM table1', 'conn-1', 'dev-db');
            await history.addQuery('SELECT * FROM table2', 'conn-2', 'prod-db');
            await history.addQuery('SELECT * FROM table3', 'conn-1', 'dev-db');

            const conn1Entries = history.getByConnection('conn-1');
            expect(conn1Entries).toHaveLength(2);
            expect(conn1Entries[0].query).toBe('SELECT * FROM table3');
            expect(conn1Entries[1].query).toBe('SELECT * FROM table1');

            const conn2Entries = history.getByConnection('conn-2');
            expect(conn2Entries).toHaveLength(1);
            expect(conn2Entries[0].query).toBe('SELECT * FROM table2');
        });
    });

    describe('search', () => {
        it('should search by query text', async () => {
            await history.addQuery('SELECT * FROM users', 'conn-1', 'dev-db');
            await history.addQuery('INSERT INTO users VALUES (...)', 'conn-1', 'dev-db');
            await history.addQuery('SELECT * FROM posts', 'conn-1', 'dev-db');
            await history.addQuery('DELETE FROM users', 'conn-1', 'dev-db');

            const results = history.search('users');
            expect(results).toHaveLength(3);
        });

        it('should be case-insensitive', async () => {
            await history.addQuery('SELECT * FROM USERS', 'conn-1', 'dev-db');
            await history.addQuery('SELECT * FROM posts', 'conn-1', 'dev-db');

            const results = history.search('users');
            expect(results).toHaveLength(1);
        });

        it('should search by connection name', async () => {
            await history.addQuery('SELECT 1', 'conn-1', 'production');
            await history.addQuery('SELECT 2', 'conn-2', 'development');
            await history.addQuery('SELECT 3', 'conn-3', 'staging');

            const results = history.search('production');
            expect(results).toHaveLength(1);
            expect(results[0].connectionName).toBe('production');
        });
    });

    describe('clearHistory', () => {
        it('should clear all entries', async () => {
            await history.addQuery('SELECT 1', 'conn-1', 'dev-db');
            await history.addQuery('SELECT 2', 'conn-1', 'dev-db');

            expect(history.getHistory()).toHaveLength(2);

            await history.clearHistory();
            expect(history.getHistory()).toHaveLength(0);
        });
    });

    describe('clearConnection', () => {
        it('should clear entries for specific connection', async () => {
            await history.addQuery('SELECT 1', 'conn-1', 'dev-db');
            await history.addQuery('SELECT 2', 'conn-2', 'prod-db');
            await history.addQuery('SELECT 3', 'conn-1', 'dev-db');

            await history.clearConnection('conn-1');

            const remaining = history.getHistory();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].connectionId).toBe('conn-2');
        });
    });

    describe('deleteEntry', () => {
        it('should delete specific entry by ID', async () => {
            await history.addQuery('SELECT 1', 'conn-1', 'dev-db');
            const firstId = history.getHistory()[0].id;

            await history.addQuery('SELECT 2', 'conn-1', 'dev-db');
            expect(history.getHistory()).toHaveLength(2);

            await history.deleteEntry(firstId);
            expect(history.getHistory()).toHaveLength(1);
            expect(history.getHistory()[0].query).toBe('SELECT 2');
        });
    });

    describe('formatEntry', () => {
        it('should format entry for display', async () => {
            await history.addQuery('SELECT * FROM users WHERE id = 1', 'conn-1', 'dev-db');
            const entry = history.getHistory()[0];

            const formatted = QueryHistory.formatEntry(entry);
            expect(formatted).toContain('SELECT * FROM users WHERE id = 1');
        });

        it('should truncate long queries', async () => {
            const longQuery = 'SELECT * FROM ' + 'a'.repeat(100);
            await history.addQuery(longQuery, 'conn-1', 'dev-db');
            const entry = history.getHistory()[0];

            const formatted = QueryHistory.formatEntry(entry, 80);
            expect(formatted.length).toBeLessThanOrEqual(80 + 3); // +3 for "..."
        });
    });

    describe('formatDetails', () => {
        it('should format entry with full details', async () => {
            await history.addQuery('SELECT * FROM users', 'conn-1', 'my-db', 'mydb', 1234);
            const entry = history.getHistory()[0];

            const details = QueryHistory.formatDetails(entry);
            expect(details).toContain('my-db');
            expect(details).toContain('mydb');
            expect(details).toContain('1234');
            expect(details).toContain('SELECT * FROM users');
        });
    });

    describe('persistence', () => {
        it('should load history from storage on creation', async () => {
            // Add queries to first history instance
            await history.addQuery('SELECT 1', 'conn-1', 'dev-db');
            await history.addQuery('SELECT 2', 'conn-1', 'dev-db');

            // Create new instance with same context
            const newHistory = new QueryHistory(mockContext as any);
            const entries = newHistory.getHistory();

            expect(entries).toHaveLength(2);
            expect(entries[0].query).toBe('SELECT 2');
            expect(entries[1].query).toBe('SELECT 1');
        });
    });
});
