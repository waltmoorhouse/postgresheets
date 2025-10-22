import { jest } from '@jest/globals';
import { IndexManager, IndexInfo } from '../src/indexManager';

describe('Index Manager Tests', () => {
    const createMockConnectionManager = () => ({
        getClient: jest.fn()
    });

    let mockConnectionManager: any;
    let indexManager: IndexManager;

    beforeEach(() => {
        mockConnectionManager = createMockConnectionManager();
        indexManager = new IndexManager(mockConnectionManager);
    });

    describe('getTableIndexes', () => {
        it('should parse index information correctly', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({
                    rows: [
                        {
                            indexname: 'idx_users_email',
                            tablename: 'users',
                            schema_name: 'public',
                            columns: ['email'],
                            indisunique: true,
                            indisprimary: false,
                            indisvalid: true,
                            size_bytes: '8192',
                            type: 'UNIQUE'
                        }
                    ]
                })
            };

            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const indexes = await indexManager.getTableIndexes('conn-1', 'public', 'users');

            expect(indexes).toHaveLength(1);
            expect(indexes[0].name).toBe('idx_users_email');
            expect(indexes[0].isUnique).toBe(true);
            expect(indexes[0].isPrimary).toBe(false);
            expect(indexes[0].sizeBytes).toBe(8192);
        });

        it('should handle empty index list', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({ rows: [] })
            };

            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const indexes = await indexManager.getTableIndexes('conn-1', 'public', 'users');

            expect(indexes).toHaveLength(0);
        });

        it('should handle multiple columns in index', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({
                    rows: [
                        {
                            indexname: 'idx_composite',
                            tablename: 'orders',
                            schema_name: 'public',
                            columns: ['customer_id', 'order_date'],
                            indisunique: false,
                            indisprimary: false,
                            indisvalid: true,
                            size_bytes: '16384',
                            type: 'btree'
                        }
                    ]
                })
            };

            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const indexes = await indexManager.getTableIndexes('conn-1', 'public', 'orders');

            expect(indexes[0].columns).toEqual(['customer_id', 'order_date']);
        });

        it('should throw error when connection fails', async () => {
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(null as any);

            await expect(indexManager.getTableIndexes('invalid-conn', 'public', 'users'))
                .rejects.toThrow('Could not connect to database');
        });
    });

    describe('createIndex', () => {
        it('should create index with basic options', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.createIndex('conn-1', 'public', 'users', 'idx_email', ['email']);

            const sqlCall = mockClient.query.mock.calls[0][0];
            expect(sqlCall).toContain('CREATE');
            expect(sqlCall).toContain('INDEX');
            expect(sqlCall).toContain('"idx_email"');
        });

        it('should create unique index', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.createIndex('conn-1', 'public', 'users', 'idx_email_unique', ['email'], { isUnique: true });

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('CREATE UNIQUE INDEX')
            );
        });

        it('should create index with custom method', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.createIndex('conn-1', 'public', 'documents', 'idx_content_gin', ['content'], { method: 'gin' });

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('USING gin')
            );
        });

        it('should handle multiple columns', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.createIndex('conn-1', 'public', 'orders', 'idx_composite', ['customer_id', 'order_date']);

            const callArg = mockClient.query.mock.calls[0][0];
            expect(callArg).toContain('"customer_id"');
            expect(callArg).toContain('"order_date"');
        });
    });

    describe('dropIndex', () => {
        it('should drop index with RESTRICT', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.dropIndex('conn-1', 'public', 'idx_email');

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DROP INDEX RESTRICT')
            );
        });

        it('should drop index with CASCADE', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.dropIndex('conn-1', 'public', 'idx_email', true);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DROP INDEX CASCADE')
            );
        });
    });

    describe('reindexIndex', () => {
        it('should reindex an index', async () => {
            const mockClient = { query: (jest.fn() as any).mockResolvedValueOnce({}) };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            await indexManager.reindexIndex('conn-1', 'idx_email');

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('REINDEX INDEX')
            );
        });
    });

    describe('validateIndex', () => {
        it('should return true for valid index', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({ rows: [{ indisvalid: true }] })
            };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const result = await indexManager.validateIndex('conn-1', 'idx_email');

            expect(result).toBe(true);
        });

        it('should return false for invalid index', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({ rows: [{ indisvalid: false }] })
            };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const result = await indexManager.validateIndex('conn-1', 'idx_email');

            expect(result).toBe(false);
        });

        it('should return false for non-existent index', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({ rows: [] })
            };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const result = await indexManager.validateIndex('conn-1', 'nonexistent');

            expect(result).toBe(false);
        });
    });

    describe('getIndexStats', () => {
        it('should return index statistics', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({
                    rows: [{
                        scans: 150,
                        tuples: 1000,
                        reads: 500
                    }]
                })
            };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const stats = await indexManager.getIndexStats('conn-1', 'public', 'idx_email');

            expect(stats.scans).toBe(150);
            expect(stats.tuples).toBe(1000);
            expect(stats.reads).toBe(500);
        });

        it('should return zeros for unused index', async () => {
            const mockClient = {
                query: (jest.fn() as any).mockResolvedValueOnce({ rows: [] })
            };
            (mockConnectionManager.getClient as any).mockResolvedValueOnce(mockClient as any);

            const stats = await indexManager.getIndexStats('conn-1', 'public', 'idx_unused');

            expect(stats.scans).toBe(0);
            expect(stats.tuples).toBe(0);
            expect(stats.reads).toBe(0);
        });
    });
});
