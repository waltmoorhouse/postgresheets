/**
 * Query History functionality for PostgreSQL Data Editor
 * Stores and manages executed SQL queries
 */

import * as vscode from 'vscode';

export interface QueryHistoryEntry {
    id: string;
    query: string;
    timestamp: number;
    connectionId: string;
    connectionName: string;
    databaseName?: string;
    executionTime?: number; // milliseconds
}

export class QueryHistory {
    private static readonly MAX_HISTORY_DEFAULT = 100;
    private static readonly STORAGE_KEY = 'postgres-editor.queryHistory';

    private history: QueryHistoryEntry[] = [];
    private context: vscode.ExtensionContext;
    private maxEntries: number;

    constructor(context: vscode.ExtensionContext, maxEntries?: number) {
        this.context = context;
        this.maxEntries = maxEntries || QueryHistory.MAX_HISTORY_DEFAULT;
        this.loadHistory();
    }

    /**
     * Load history from storage
     */
    private loadHistory(): void {
        try {
            const stored = this.context.globalState.get<QueryHistoryEntry[]>(QueryHistory.STORAGE_KEY, []);
            this.history = stored.sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            this.history = [];
        }
    }

    /**
     * Save history to storage
     */
    private async saveHistory(): Promise<void> {
        try {
            // Keep only the most recent entries
            const limited = this.history.slice(0, this.maxEntries);
            await this.context.globalState.update(QueryHistory.STORAGE_KEY, limited);
        } catch (error) {
            console.error('Failed to save query history:', error);
        }
    }

    /**
     * Add a query to history
     * @param query The SQL query
     * @param connectionId The connection ID
     * @param connectionName The connection name
     * @param databaseName Optional database name
     * @param executionTime Optional execution time in milliseconds
     */
    async addQuery(
        query: string,
        connectionId: string,
        connectionName: string,
        databaseName?: string,
        executionTime?: number
    ): Promise<void> {
        // Don't add empty queries
        if (!query || !query.trim()) {
            return;
        }

        const entry: QueryHistoryEntry = {
            id: `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            query: query.trim(),
            timestamp: Date.now(),
            connectionId,
            connectionName,
            databaseName,
            executionTime
        };

        this.history.unshift(entry);

        // Limit size
        if (this.history.length > this.maxEntries) {
            this.history = this.history.slice(0, this.maxEntries);
        }

        await this.saveHistory();
    }

    /**
     * Get all history entries
     */
    getHistory(): QueryHistoryEntry[] {
        return [...this.history];
    }

    /**
     * Get recent history entries
     * @param limit Number of entries to return
     */
    getRecent(limit: number = 10): QueryHistoryEntry[] {
        return this.history.slice(0, limit);
    }

    /**
     * Get history for a specific connection
     * @param connectionId The connection ID
     */
    getByConnection(connectionId: string): QueryHistoryEntry[] {
        return this.history.filter(entry => entry.connectionId === connectionId);
    }

    /**
     * Search history by query text
     * @param searchText Text to search for
     */
    search(searchText: string): QueryHistoryEntry[] {
        const lowerSearch = searchText.toLowerCase();
        return this.history.filter(entry =>
            entry.query.toLowerCase().includes(lowerSearch) ||
            entry.connectionName.toLowerCase().includes(lowerSearch)
        );
    }

    /**
     * Clear all history
     */
    async clearHistory(): Promise<void> {
        this.history = [];
        await this.saveHistory();
    }

    /**
     * Clear history for a specific connection
     * @param connectionId The connection ID
     */
    async clearConnection(connectionId: string): Promise<void> {
        this.history = this.history.filter(entry => entry.connectionId !== connectionId);
        await this.saveHistory();
    }

    /**
     * Delete a specific entry
     * @param id The entry ID
     */
    async deleteEntry(id: string): Promise<void> {
        this.history = this.history.filter(entry => entry.id !== id);
        await this.saveHistory();
    }

    /**
     * Format entry for display
     * @param entry The history entry
     * @param maxLength Maximum length of query display
     */
    static formatEntry(entry: QueryHistoryEntry, maxLength: number = 80): string {
        const query = entry.query.replace(/\n/g, ' ').substring(0, maxLength);
        const time = new Date(entry.timestamp).toLocaleString();
        const detail = entry.databaseName ? ` @ ${entry.databaseName}` : '';
        const duration = entry.executionTime ? ` (${entry.executionTime}ms)` : '';

        return `${query}${query.length === maxLength ? '...' : ''}`;
    }

    /**
     * Format entry with full details for tooltip/description
     * @param entry The history entry
     */
    static formatDetails(entry: QueryHistoryEntry): string {
        const time = new Date(entry.timestamp).toLocaleString();
        const detail = entry.databaseName ? ` @ ${entry.databaseName}` : '';
        const duration = entry.executionTime ? `\nExecution time: ${entry.executionTime}ms` : '';

        return `${entry.connectionName}${detail}\nAt: ${time}${duration}\n\nQuery:\n${entry.query}`;
    }
}
