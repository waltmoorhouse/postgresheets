/**
 * Index Management for PostgreSQL Data Editor
 * Provides UI and operations for viewing, creating, and dropping indexes
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { info, debug } from './logger';

export interface IndexInfo {
    name: string;
    tableName: string;
    schemaName: string;
    columns: string[];
    indexType: string;
    isUnique: boolean;
    isPrimary: boolean;
    isValid: boolean;
    sizeBytes: number;
}

export class IndexManager {
    constructor(private connectionManager: ConnectionManager) {}

    /**
     * Get all indexes for a table
     */
    async getTableIndexes(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<IndexInfo[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT 
                    i.indexname,
                    tc.relname as tablename,
                    n.nspname as schema_name,
                    array_agg(a.attname ORDER BY a.attnum) as columns,
                    ix.indisunique,
                    ix.indisprimary,
                    ix.indisvalid,
                    pg_relation_size(ic.oid) as size_bytes,
                    CASE 
                        WHEN ix.indisprimary THEN 'PRIMARY KEY'
                        WHEN ix.indisunique THEN 'UNIQUE'
                        ELSE am.amname
                    END as type
                FROM pg_indexes i
                JOIN pg_class ic ON ic.relname = i.indexname
                JOIN pg_namespace icn ON icn.oid = ic.relnamespace
                JOIN pg_index ix ON ix.indexrelid = ic.oid
                JOIN pg_class tc ON tc.oid = ix.indrelid
                JOIN pg_namespace n ON n.oid = tc.relnamespace
                JOIN pg_am am ON am.oid = ic.relam
                JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = ANY(ix.indkey)
                WHERE tc.relname = $1 AND n.nspname = $2
                GROUP BY i.indexname, tc.relname, n.nspname, ix.indisunique, 
                         ix.indisprimary, ix.indisvalid, ic.oid, am.amname
                ORDER BY i.indexname
            `, [tableName, schemaName || 'public']);

            return result.rows.map(row => {
                // Parse PostgreSQL array if it's a string like {col1,col2}
                let columns: string[] = [];
                if (Array.isArray(row.columns)) {
                    columns = row.columns;
                } else if (typeof row.columns === 'string') {
                    // Parse PostgreSQL array format: {col1,col2,col3}
                    const match = row.columns.match(/^\{(.*)\}$/);
                    if (match) {
                        columns = match[1].split(',').map((c: string) => c.trim());
                    }
                }
                
                return {
                    name: row.indexname,
                    tableName: row.tablename,
                    schemaName: row.schema_name,
                    columns,
                    indexType: row.type,
                    isUnique: row.indisunique,
                    isPrimary: row.indisprimary,
                    isValid: row.indisvalid,
                    sizeBytes: parseInt(row.size_bytes, 10)
                };
            });
        } catch (err) {
            debug(`Error fetching indexes: ${err}`);
            throw err;
        }
    }

    /**
     * Create a new index
     */
    async createIndex(
        connectionId: string,
        schemaName: string,
        tableName: string,
        indexName: string,
        columns: string[],
        options: { isUnique?: boolean; method?: 'btree' | 'hash' | 'gist' | 'gin' | 'brin' } = {}
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const uniqueKeyword = options.isUnique ? 'UNIQUE' : '';
            const method = options.method || 'btree';
            const columnList = columns.map(col => `"${col}"`).join(', ');

            const sql = `
                CREATE ${uniqueKeyword} INDEX "${indexName}" 
                ON "${schemaName || 'public'}"."${tableName}" 
                USING ${method} (${columnList})
            `.trim();

            await client.query(sql);
            info(`Index ${indexName} created successfully`);
        } catch (err) {
            debug(`Error creating index: ${err}`);
            throw err;
        }
    }

    /**
     * Drop an index
     */
    async dropIndex(
        connectionId: string,
        schemaName: string,
        indexName: string,
        cascade: boolean = false
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const cascadeKeyword = cascade ? 'CASCADE' : 'RESTRICT';
            const sql = `DROP INDEX ${cascadeKeyword} "${schemaName || 'public'}"."${indexName}"`;

            await client.query(sql);
            info(`Index ${indexName} dropped successfully`);
        } catch (err) {
            debug(`Error dropping index: ${err}`);
            throw err;
        }
    }

    /**
     * Analyze (reindex) an index
     */
    async reindexIndex(
        connectionId: string,
        indexName: string
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const sql = `REINDEX INDEX "${indexName}"`;
            await client.query(sql);
            info(`Index ${indexName} reindexed successfully`);
        } catch (err) {
            debug(`Error reindexing: ${err}`);
            throw err;
        }
    }

    /**
     * Validate an index
     */
    async validateIndex(
        connectionId: string,
        indexName: string
    ): Promise<boolean> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT indisvalid 
                FROM pg_index 
                JOIN pg_class ON pg_class.oid = pg_index.indexrelid 
                WHERE pg_class.relname = $1
            `, [indexName]);

            return result.rows.length > 0 ? result.rows[0].indisvalid : false;
        } catch (err) {
            debug(`Error validating index: ${err}`);
            throw err;
        }
    }

    /**
     * Get index statistics
     */
    async getIndexStats(
        connectionId: string,
        schemaName: string,
        indexName: string
    ): Promise<{
        scans: number;
        tuples: number;
        reads: number;
    }> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT 
                    idx_scan as scans,
                    idx_tup_read as tuples,
                    idx_tup_fetch as reads
                FROM pg_stat_user_indexes
                WHERE relname = $1 AND schemaname = $2
            `, [indexName, schemaName || 'public']);

            if (result.rows.length === 0) {
                return { scans: 0, tuples: 0, reads: 0 };
            }

            return {
                scans: parseInt(result.rows[0].scans, 10),
                tuples: parseInt(result.rows[0].tuples, 10),
                reads: parseInt(result.rows[0].reads, 10)
            };
        } catch (err) {
            debug(`Error fetching index stats: ${err}`);
            throw err;
        }
    }
}
