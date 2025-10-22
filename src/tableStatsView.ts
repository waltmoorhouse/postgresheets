/**
 * Table Statistics View for PostgreSQL Data Editor
 * Provides statistics and metrics for tables
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { info, debug } from './logger';

export interface TableStats {
    tableName: string;
    schemaName: string;
    rowCount: number;
    sizeBytes: number;
    indexes: number;
    lastVacuum?: Date;
    lastAnalyze?: Date;
    deadTuples: number;
    liveRatio: number;
}

export interface IndexStats {
    indexName: string;
    sizeBytes: number;
    scans: number;
    tuples: number;
    reads: number;
    lastUsed?: Date;
    isUnused: boolean;
}

export class TableStatsView {
    constructor(private connectionManager: ConnectionManager) {}

    /**
     * Get comprehensive statistics for a table
     */
    async getTableStats(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<TableStats> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            // Get row count and size
            const statsResult = await client.query(`
                SELECT 
                    n_live_tup as live_tuples,
                    n_dead_tup as dead_tuples,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze
                FROM pg_stat_user_tables
                WHERE schemaname = $1 AND relname = $2
            `, [schemaName || 'public', tableName]);

            const sizeResult = await client.query(`
                SELECT 
                    pg_total_relation_size('"${schemaName || 'public'}"."${tableName}"'::regclass) as total_size,
                    (SELECT count(*) FROM pg_indexes 
                     WHERE schemaname = $1 AND tablename = $2) as index_count
            `, [schemaName || 'public', tableName]);

            const liveCount = statsResult.rows[0]?.live_tuples || 0;
            const deadCount = statsResult.rows[0]?.dead_tuples || 0;
            const lastVacuum = statsResult.rows[0]?.last_vacuum || statsResult.rows[0]?.last_autovacuum;
            const lastAnalyze = statsResult.rows[0]?.last_analyze || statsResult.rows[0]?.last_autoanalyze;
            const totalSize = parseInt(sizeResult.rows[0]?.total_size || '0', 10);
            const indexCount = parseInt(sizeResult.rows[0]?.index_count || '0', 10);
            const liveRatio = liveCount + deadCount > 0 ? liveCount / (liveCount + deadCount) : 0;

            return {
                tableName,
                schemaName: schemaName || 'public',
                rowCount: liveCount,
                sizeBytes: totalSize,
                indexes: indexCount,
                lastVacuum: lastVacuum ? new Date(lastVacuum) : undefined,
                lastAnalyze: lastAnalyze ? new Date(lastAnalyze) : undefined,
                deadTuples: deadCount,
                liveRatio
            };
        } catch (err) {
            debug(`Error fetching table stats: ${err}`);
            throw err;
        }
    }

    /**
     * Get statistics for all indexes on a table
     */
    async getIndexStats(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<IndexStats[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT 
                    i.relname as index_name,
                    pg_relation_size(i.oid) as size_bytes,
                    stat.idx_scan as scans,
                    stat.idx_tup_read as tuples,
                    stat.idx_tup_fetch as reads,
                    stat.last_idx_scan
                FROM pg_stat_user_indexes stat
                JOIN pg_index idx ON idx.indexrelid = stat.indexrelid
                JOIN pg_class i ON i.oid = idx.indexrelid
                JOIN pg_class t ON t.oid = idx.indrelid
                WHERE stat.schemaname = $1 AND stat.relname = $2
                ORDER BY i.relname
            `, [schemaName || 'public', tableName]);

            return result.rows.map(row => ({
                indexName: row.index_name,
                sizeBytes: parseInt(row.size_bytes, 10),
                scans: parseInt(row.scans || '0', 10),
                tuples: parseInt(row.tuples || '0', 10),
                reads: parseInt(row.reads || '0', 10),
                lastUsed: row.last_idx_scan ? new Date(row.last_idx_scan) : undefined,
                isUnused: parseInt(row.scans || '0', 10) === 0
            }));
        } catch (err) {
            debug(`Error fetching index stats: ${err}`);
            throw err;
        }
    }

    /**
     * Get size in human-readable format
     */
    formatSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Find unused indexes (never scanned)
     */
    async findUnusedIndexes(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<IndexStats[]> {
        const stats = await this.getIndexStats(connectionId, schemaName, tableName);
        return stats.filter(idx => idx.isUnused);
    }

    /**
     * Get bloat analysis for a table
     */
    async analyzeTableBloat(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<{
        estimatedBloatRatio: number;
        estimatedBloatBytes: number;
        recommendation: string;
    }> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const stats = await this.getTableStats(connectionId, schemaName, tableName);
            const deadRatio = 1 - stats.liveRatio;
            const bloatBytes = Math.floor(stats.sizeBytes * deadRatio);

            let recommendation = 'No action needed';
            if (deadRatio > 0.3) {
                recommendation = 'Consider VACUUM FULL or CLUSTER';
            } else if (deadRatio > 0.2) {
                recommendation = 'Run VACUUM to reclaim space';
            } else if (deadRatio > 0.1) {
                recommendation = 'Monitor table for future cleanup';
            }

            return {
                estimatedBloatRatio: deadRatio,
                estimatedBloatBytes: bloatBytes,
                recommendation
            };
        } catch (err) {
            debug(`Error analyzing bloat: ${err}`);
            throw err;
        }
    }

    /**
     * Get all table statistics for a schema
     */
    async getSchemaStats(
        connectionId: string,
        schemaName: string
    ): Promise<TableStats[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT 
                    t.tablename,
                    stat.n_live_tup,
                    stat.n_dead_tup,
                    pg_total_relation_size('"${schemaName || 'public'}"."' || t.tablename || '"'::regclass) as total_size,
                    stat.last_vacuum,
                    stat.last_autovacuum,
                    stat.last_analyze,
                    stat.last_autoanalyze,
                    (SELECT count(*) FROM pg_indexes WHERE schemaname = $1 AND tablename = t.tablename) as index_count
                FROM pg_tables t
                LEFT JOIN pg_stat_user_tables stat ON stat.schemaname = t.schemaname AND stat.relname = t.tablename
                WHERE t.schemaname = $1
                ORDER BY t.tablename
            `, [schemaName || 'public']);

            const stats: TableStats[] = [];
            for (const row of result.rows) {
                const liveCount = row.n_live_tup || 0;
                const deadCount = row.n_dead_tup || 0;
                stats.push({
                    tableName: row.tablename,
                    schemaName: schemaName || 'public',
                    rowCount: liveCount,
                    sizeBytes: parseInt(row.total_size, 10),
                    indexes: parseInt(row.index_count || '0', 10),
                    lastVacuum: row.last_vacuum || row.last_autovacuum ? new Date(row.last_vacuum || row.last_autovacuum) : undefined,
                    lastAnalyze: row.last_analyze || row.last_autoanalyze ? new Date(row.last_analyze || row.last_autoanalyze) : undefined,
                    deadTuples: deadCount,
                    liveRatio: liveCount + deadCount > 0 ? liveCount / (liveCount + deadCount) : 0
                });
            }

            return stats;
        } catch (err) {
            debug(`Error fetching schema stats: ${err}`);
            throw err;
        }
    }
}
