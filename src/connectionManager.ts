// connectionManager.ts - Manages database connections and credentials

import * as vscode from 'vscode';
import type { Client } from 'pg';

/**
 * Represents the configuration for a database connection.
 */
export interface ConnectionConfig {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    ssl?: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'busy' | 'error';

/**
 * Manages PostgreSQL database connections and credentials.
 */
export class ConnectionManager {
    private context: vscode.ExtensionContext;
    private connections: Map<string, Client> = new Map();
    private connectionStatuses: Map<string, ConnectionStatus> = new Map();
    private activityCounters: Map<string, number> = new Map();
    private pendingConnections: Map<string, Promise<Client | null>> = new Map();
    // Controllers to allow cancelling pending connection attempts
    private pendingControllers: Map<string, AbortController> = new Map();
    private statusEmitter = new vscode.EventEmitter<{ id: string; status: ConnectionStatus }>();

    readonly onStatusChange = this.statusEmitter.event;

    /**
     * Initializes the ConnectionManager with the given extension context.
     * @param context The VS Code extension context.
     */
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Prompts the user to add a new database connection.
     */
    async addConnection(): Promise<void> {
        // Use a single connection string input so users can paste a full URI
        const name = await this.promptInputBox('Connection name', 'My Database');
        if (!name) return;

        const connStr = await this.promptInputBox(
            'Paste full connection string (e.g. postgres://user:password@host:5432/db?sslmode=require)',
            ''
        );
        if (!connStr) return;

        const parsed = this.parseConnectionString(connStr);
        if (!parsed) {
            vscode.window.showErrorMessage('Invalid connection string');
            return;
        }

        const id = this.generateId();
        const config: ConnectionConfig = {
            id,
            name,
            host: parsed.host,
            port: parsed.port,
            database: parsed.database,
            username: parsed.username,
            ssl: parsed.ssl
        };

        // Save config (without password)
        await this.saveConnection(config);

        this.setStatus(id, 'disconnected');

        // Save password securely if present in the connection string
        if (parsed.password) {
            await this.context.secrets.store(`postgres-password-${id}`, parsed.password);
        }

        vscode.window.showInformationMessage(`Connection "${name}" added successfully`);
    }

    /**
     * Prompts the user to edit an existing database connection.
     * @param id The ID of the connection to edit.
     */
    async editConnection(id: string): Promise<void> {
        const connections = await this.getConnections();
        const config = connections.find(c => c.id === id);
        if (!config) return;
        const name = await vscode.window.showInputBox({ prompt: 'Connection name', value: config.name });
        if (!name) return;

        // Ask for a full connection string (optional). Leave blank to keep current connection details.
        const connStr = await vscode.window.showInputBox({
            prompt: 'Paste full connection string to update details (leave blank to keep current)',
            placeHolder: 'postgres://user:password@host:5432/db?sslmode=require'
        });

        let updatedConfig = { ...config, name };

        if (connStr && connStr.trim().length > 0) {
            const parsed = this.parseConnectionString(connStr);
            if (!parsed) {
                vscode.window.showErrorMessage('Invalid connection string');
                return;
            }

            updatedConfig = {
                ...updatedConfig,
                host: parsed.host,
                port: parsed.port,
                database: parsed.database,
                username: parsed.username,
                ssl: parsed.ssl
            };

            // Update password if provided in the connection string
            if (parsed.password !== undefined) {
                await this.context.secrets.store(`postgres-password-${id}`, parsed.password);
            }
        }

        await this.saveConnection(updatedConfig, true);

        vscode.window.showInformationMessage(`Connection "${name}" updated successfully`);
    }

    /**
     * Parses a Postgres connection string into components.
     * Accepts forms like:
     *   postgres://user:pass@host:5432/db?sslmode=require
     */
    public parseConnectionString(conn: string): { host: string; port: number; database: string; username: string; password?: string; ssl?: boolean } | null {
        try {
            let uri = conn.trim();
            if (!uri.startsWith('postgres://') && !uri.startsWith('postgresql://')) {
                uri = 'postgres://' + uri;
            }
            const url = new URL(uri);

            const username = url.username ? decodeURIComponent(url.username) : '';
            const password = url.password ? decodeURIComponent(url.password) : undefined;
            const host = url.hostname || 'localhost';
            const port = url.port ? parseInt(url.port, 10) : 5432;
            const database = (url.pathname || '').replace(/^\//, '') || '';
            const params = url.searchParams;
            const sslmode = params.get('sslmode') || params.get('ssl');
            const ssl = sslmode ? (['require', 'true', 'verify-ca', 'verify-full'].includes(sslmode)) : false;

            if (!username || !host || !database) {
                // Require at least user, host, and database
                return null;
            }

            return { host, port, database, username, password, ssl };
        } catch (err) {
            return null;
        }
    }

    /**
     * Tests a raw connection specification without saving it. This creates a
     * temporary client, attempts to connect, then immediately closes it so
     * the test does not modify ConnectionManager state.
     */
    public async testConnection(options: { connStr?: string; host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean; timeoutMs?: number }): Promise<{ success: boolean; error?: string }> {
        try {
            let parsed: { host: string; port: number; database: string; username: string; password?: string; ssl?: boolean } | null = null;
            if (options.connStr) {
                parsed = this.parseConnectionString(options.connStr);
                if (!parsed) {
                    return { success: false, error: 'Invalid connection string' };
                }
            } else {
                if (!options.host || !options.username || !options.database) {
                    return { success: false, error: 'Missing host/username/database' };
                }
                parsed = {
                    host: options.host,
                    port: options.port ?? 5432,
                    database: options.database,
                    username: options.username,
                    password: options.password,
                    ssl: options.ssl
                };
            }

            // Import the runtime Client at call-time so test harnesses can
            // mock or replace the 'pg' module before this code executes.
            // We keep a type-only import above so TypeScript still knows
            // the Client shape but the runtime module isn't statically
            // imported which interferes with some Jest ESM mock flows.
            const { Client } = await import('pg');

            const client = new Client({
                host: parsed.host,
                port: parsed.port,
                database: parsed.database,
                user: parsed.username,
                password: options.password ?? parsed.password,
                ssl: parsed.ssl ? { rejectUnauthorized: false } : undefined,
                // Use a reasonable test timeout to avoid long network waits
                connectionTimeoutMillis: options.timeoutMs ?? 5000
            });

            await client.connect();
            try {
                await client.end();
            } catch {
                // ignore end errors
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Persists a new connection configuration (or updates an existing one).
     * Generates an id if one is not provided.
     */
    public async saveNewConnection(config: Partial<ConnectionConfig> & { name: string }, password?: string, update: boolean = false): Promise<ConnectionConfig> {
        const connections = await this.getConnections();

        let finalConfig: ConnectionConfig;
        if (update && config.id) {
            const index = connections.findIndex(c => c.id === config.id);
            if (index !== -1) {
                finalConfig = { ...(connections[index]), ...(config as any) };
                connections[index] = finalConfig;
            } else {
                // Fall back to creating a new config
                finalConfig = { ...(config as any), id: this.generateId() } as ConnectionConfig;
                connections.push(finalConfig);
            }
        } else {
            finalConfig = { ...(config as any), id: config.id ?? this.generateId() } as ConnectionConfig;
            connections.push(finalConfig);
        }

        await this.context.globalState.update('connections', connections);
        if (password) {
            await this.context.secrets.store(`postgres-password-${finalConfig.id}`, password);
        }

        return finalConfig;
    }

    /**
     * Deletes a database connection by its ID.
     * @param id The ID of the connection to delete.
     */
    async deleteConnection(id: string): Promise<void> {
        const connections = await this.getConnections();
        const config = connections.find(c => c.id === id);
        if (!config) return;

        const status = this.getConnectionStatus(id);
        // (Removed test-only debug logging)

        // If the connection is currently connecting/connected/busy, ask the
        // user whether to disconnect (or cancel) and delete. For simple
        // disconnected entries, proceed with a normal delete confirmation.
    if (status === 'connecting') {
            const confirm = await vscode.window.showWarningMessage(
                `Connection "${config.name}" is currently connecting. Disconnect and delete?`,
                'Disconnect & Delete',
                'Cancel'
            );

            if (confirm !== 'Disconnect & Delete') return;
            // (Removed test-only debug logging)

            // Cancel the in-flight connect (best-effort) and ensure any
            // existing client is closed.
            try {
                await this.cancelConnect(id);
                await this.disconnect(id);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to cancel connection: ${err}`);
                return;
            }
    } else if (status === 'connected' || status === 'busy') {
            const confirm = await vscode.window.showWarningMessage(
                `Connection "${config.name}" is currently connected. Disconnect and delete?`,
                'Disconnect & Delete',
                'Cancel'
            );

            if (confirm !== 'Disconnect & Delete') return;

            try {
                await this.disconnect(id);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to disconnect: ${err}`);
                return;
            }
        } else {
            const confirm = await vscode.window.showWarningMessage(
                `Delete connection "${config.name}"?`,
                'Delete',
                'Cancel'
            );
            if (confirm !== 'Delete') return;
        }

        // Remove stored configuration and secrets after ensuring there are
        // no active or pending connections for the id.
        // (Removed test-only debug logging)
        const filtered = connections.filter(c => c.id !== id);
        await this.context.globalState.update('connections', filtered);
        await this.context.secrets.delete(`postgres-password-${id}`);

        vscode.window.showInformationMessage(`Connection "${config.name}" deleted`);
    }

    /**
     * Retrieves all saved database connections.
     * @returns A promise that resolves to an array of ConnectionConfig objects.
     */
    async getConnections(): Promise<ConnectionConfig[]> {
        return this.context.globalState.get<ConnectionConfig[]>('connections', []);
    }

    /**
     * Retrieves a PostgreSQL client for the specified connection ID.
     * Only returns an existing connection - does NOT attempt to connect.
     * Callers must explicitly use connect() to establish new connections.
     * @param id The ID of the connection.
     * @returns A promise that resolves to a PostgreSQL client or null if not connected.
     */
    async getClient(id: string): Promise<Client | null> {
        // Only return existing connections - no auto-connect
        return this.connections.get(id) ?? null;
    }

    async connect(id: string, forceReconnect: boolean = false): Promise<Client | null> {
        // If already connected and not forcing reconnect, return existing client without status changes
        if (!forceReconnect && this.connections.has(id)) {
            return this.connections.get(id)!;
        }

        if (forceReconnect) {
            await this.disconnect(id);
        }

        const pending = this.pendingConnections.get(id);
        if (pending) {
            return pending;
        }

        const connections = await this.getConnections();
        const config = connections.find(c => c.id === id);
        if (!config) {
            this.setStatus(id, 'error');
            return null;
        }

        const password = await this.context.secrets.get(`postgres-password-${id}`);
        if (!password) {
            vscode.window.showErrorMessage('Password not found for this connection');
            this.setStatus(id, 'error');
            return null;
        }

        this.setStatus(id, 'connecting');
        // Debug logging during tests to help diagnose race conditions in test environment
        // (Removed test-only debug logging)

        // Create an AbortController so callers can cancel this connection attempt
        const controller = new AbortController();
        this.pendingControllers.set(id, controller);
        // (Removed test-only debug logging)

        const connectPromise = (async () => {
            let client: Client | undefined;
            try {
                // Import the runtime Client at call-time so tests that mock
                // the 'pg' module (jest.doMock / moduleNameMapper) are
                // respected when creating a real client for connect().
                const { Client } = await import('pg');

                client = new Client({
                    host: config.host,
                    port: config.port,
                    database: config.database,
                    user: config.username,
                    password,
                    ssl: config.ssl ? { rejectUnauthorized: false } : undefined
                });

                // Promise that resolves to null if the user aborts the connection attempt.
                const abortPromise = new Promise<Client | null>((resolve) => {
                    controller.signal.addEventListener('abort', async () => {
                        // (Removed test-only debug logging)
                        try {
                            // Attempt to forcibly destroy the underlying socket/stream
                            // if the client has started a connection but hasn't
                            // completed. This increases the chance of cancelling a
                            // connect attempt that would otherwise block until OS
                            // TCP timeouts expire.
                            try {
                                const connAny = client as any;
                                if (connAny && connAny.connection && connAny.connection.stream) {
                                    try { connAny.connection.stream.destroy(); } catch {}
                                }
                            } catch {}

                            // Also attempt a graceful end if the client is already
                            // connected.
                            if (client) {
                                try { await client.end(); } catch {}
                            }
                        } catch (e) {
                            // swallow
                        }
                        // Resolve with null to indicate the connect was cancelled.
                        resolve(null);
                    }, { once: true });
                    // (Removed test-only debug logging)
                });

                // Race the real connect against the abort signal.
                const connectOp = client.connect().then(() => client);
                const result = await Promise.race([connectOp, abortPromise]);

                if (result === null) {
                    // User cancelled; return null without showing an error.
                    this.setStatus(id, 'disconnected');
                    return null;
                }

                // Successfully connected
                const connectedClient = result as Client;
                this.attachClientListeners(id, connectedClient);
                this.connections.set(id, connectedClient);
                this.setStatus(id, 'connected');
                return connectedClient;
            } catch (error) {
                // (Removed test-only debug logging)
                // If this connection was aborted, the controller will already have
                // set the status to 'disconnected' — treat that case as non-error.
                if (controller.signal.aborted) {
                    return null;
                }

                this.setStatus(id, 'error');
                vscode.window.showErrorMessage(`Failed to connect: ${error}`);
                return null;
            } finally {
                // Ensure controller is cleared when the attempt finishes
                // (Removed test-only debug logging)
                this.pendingControllers.delete(id);
            }
        })();

        this.pendingConnections.set(id, connectPromise);

        try {
            return await connectPromise;
        } finally {
            this.pendingConnections.delete(id);
        }
    }

    async disconnect(id: string): Promise<void> {
        // If a connection attempt is in-flight, abort it so the user doesn't
        // have to wait for a long network timeout.
        const controller = this.pendingControllers.get(id);
        if (controller) {
            try {
                controller.abort();
            } catch {
                // ignore
            }

            const pending = this.pendingConnections.get(id);
            if (pending) {
                try {
                    // Wait for the pending promise to settle so resources are cleaned up.
                    await pending;
                } catch {
                    // ignore
                }
            }
        }

        const client = this.connections.get(id);
        if (client) {
            this.connections.delete(id);
            this.activityCounters.delete(id);
            try {
                await client.end();
            } catch (error) {
                console.error(`Failed to close connection ${id}`, error);
            }
        }
        this.setStatus(id, 'disconnected');
    }

    async refreshConnection(id: string): Promise<Client | null> {
        await this.disconnect(id);
        return this.connect(id, false);
    }

    /**
     * Cancels an in-flight connection attempt if present.
     * Returns true if a pending attempt was found and cancelled, false otherwise.
     */
    async cancelConnect(id: string): Promise<boolean> {
        // (Removed test-only debug logging)

        const controller = this.pendingControllers.get(id);
        if (!controller) {
            // (Removed test-only debug logging)
            return false;
        }

        try {
            controller.abort();
        } catch (e) {
            // ignore errors during abort
        }

        const pending = this.pendingConnections.get(id);
        if (pending) {
            try {
                await pending;
            } catch {
                // ignore
            }
        }

        // Ensure internal maps are cleared and status reflects that we're not connecting
        this.pendingControllers.delete(id);
        this.pendingConnections.delete(id);
        this.setStatus(id, 'disconnected');
        // (Removed test-only debug logging)
        return true;
    }

    getConnectionStatus(id: string): ConnectionStatus {
        return this.connectionStatuses.get(id) ?? 'disconnected';
    }

    markBusy(id: string): void {
        if (!id) return;
        const count = this.activityCounters.get(id) ?? 0;
        this.activityCounters.set(id, count + 1);
        // Only change status if we're transitioning from idle to busy
        if (count === 0 && this.connections.has(id)) {
            this.setStatus(id, 'busy');
        }
    }

    markIdle(id: string): void {
        if (!id) return;
        const count = this.activityCounters.get(id) ?? 0;
        const next = Math.max(count - 1, 0);
        if (next === 0) {
            this.activityCounters.delete(id);
            const hasClient = this.connections.has(id);
            // Only change status if we're transitioning from busy to idle
            const currentStatus = this.connectionStatuses.get(id);
            if (currentStatus === 'busy') {
                this.setStatus(id, hasClient ? 'connected' : 'disconnected');
            }
        } else {
            this.activityCounters.set(id, next);
        }
    }

    flagError(id: string): void {
        this.connections.delete(id);
        this.activityCounters.delete(id);
        this.setStatus(id, 'error');
    }

    private attachClientListeners(id: string, client: Client): void {
        // Some test mocks provide a minimal client without an `on` method.
        // Guard to avoid throwing when tests pass in such mocks.
        if (client && typeof (client as any).on === 'function') {
            client.on('error', (error) => {
                console.error(`Connection ${id} error`, error);
                this.connections.delete(id);
                this.activityCounters.delete(id);
                this.setStatus(id, 'error');
            });

            client.on('end', () => {
                this.connections.delete(id);
                this.activityCounters.delete(id);
                this.setStatus(id, 'disconnected');
            });
        } else {
            // No-op if client does not support event listeners.
        }
    }

    /**
     * Saves a database connection configuration.
     * @param config The connection configuration to save.
     * @param update Whether to update an existing connection.
     */
    private async saveConnection(config: ConnectionConfig, update: boolean = false): Promise<void> {
        const connections = await this.getConnections();
        if (update) {
            const index = connections.findIndex(c => c.id === config.id);
            if (index !== -1) {
                connections[index] = config;
            }
        } else {
            connections.push(config);
        }
        await this.context.globalState.update('connections', connections);
    }

    /**
     * Generates a unique ID for a new database connection.
     * @returns A unique connection ID.
     */
    private generateId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private async promptInputBox(prompt: string, placeHolder: string, value?: string, password: boolean = false): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt,
            placeHolder,
            value,
            password
        });
    }

    private setStatus(id: string, status: ConnectionStatus): void {
        const previous = this.connectionStatuses.get(id);
        if (previous === status) {
            return;
        }
        this.connectionStatuses.set(id, status);
        this.statusEmitter.fire({ id, status });
    }
}
