// connectionManager.ts - Manages database connections and credentials

import * as vscode from 'vscode';
import { Client } from 'pg';

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

/**
 * Manages PostgreSQL database connections and credentials.
 */
export class ConnectionManager {
    private context: vscode.ExtensionContext;
    private connections: Map<string, Client> = new Map();

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
    private parseConnectionString(conn: string): { host: string; port: number; database: string; username: string; password?: string; ssl?: boolean } | null {
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
     * Deletes a database connection by its ID.
     * @param id The ID of the connection to delete.
     */
    async deleteConnection(id: string): Promise<void> {
        const connections = await this.getConnections();
        const config = connections.find(c => c.id === id);
        if (!config) return;

        const confirm = await vscode.window.showWarningMessage(
            `Delete connection "${config.name}"?`,
            'Delete',
            'Cancel'
        );

        if (confirm === 'Delete') {
            const filtered = connections.filter(c => c.id !== id);
            await this.context.globalState.update('connections', filtered);
            await this.context.secrets.delete(`postgres-password-${id}`);
            
            // Close connection if open
            const client = this.connections.get(id);
            if (client) {
                await client.end();
                this.connections.delete(id);
            }

            vscode.window.showInformationMessage(`Connection "${config.name}" deleted`);
        }
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
     * @param id The ID of the connection.
     * @returns A promise that resolves to a PostgreSQL client or null if the connection fails.
     */
    async getClient(id: string): Promise<Client | null> {
        // Return cached connection if exists
        if (this.connections.has(id)) {
            return this.connections.get(id)!;
        }

        const connections = await this.getConnections();
        const config = connections.find(c => c.id === id);
        if (!config) return null;

        const password = await this.context.secrets.get(`postgres-password-${id}`);
        if (!password) {
            vscode.window.showErrorMessage('Password not found for this connection');
            return null;
        }

        try {
            const client = new Client({
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.username,
                password: password,
                ssl: config.ssl ? { rejectUnauthorized: false } : undefined
            });

            await client.connect();
            this.connections.set(id, client);
            return client;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect: ${error}`);
            return null;
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
}
