// databaseTreeProvider.ts - Provides tree view for database structure

import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from './connectionManager';

export class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'connection' | 'database' | 'schema' | 'table',
        public readonly connectionId?: string,
        public readonly databaseName?: string,
        public readonly schemaName?: string,
        public readonly tableName?: string
    ) {
        super(label, collapsibleState);
        
        this.contextValue = type;
        
        if (type === 'connection') {
            this.iconPath = new vscode.ThemeIcon('database');
        } else if (type === 'database') {
            this.iconPath = new vscode.ThemeIcon('server');
        } else if (type === 'schema') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (type === 'table') {
            this.iconPath = new vscode.ThemeIcon('table');
            this.command = {
                command: 'postgres-editor.openTable',
                title: 'Open Table',
                arguments: [this]
            };
        }
    }
}

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private connectionManager: ConnectionManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
        if (!element) {
            // Root level - show connections
            return this.getConnections();
        }

        if (element.type === 'connection') {
            // Show databases
            return this.getDatabases(element.connectionId!);
        }

        if (element.type === 'database') {
            // Show schemas
            return this.getSchemas(element.connectionId!, element.databaseName!);
        }

        if (element.type === 'schema') {
            // Show tables
            return this.getTables(element.connectionId!, element.databaseName!, element.schemaName!);
        }

        return [];
    }

    private async getConnections(): Promise<DatabaseTreeItem[]> {
        const configs = await this.connectionManager.getConnections();
        return configs.map(config => 
            new DatabaseTreeItem(
                config.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                config.id
            )
        );
    }

    private async getDatabases(connectionId: string): Promise<DatabaseTreeItem[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return [];

        try {
            const result = await client.query(`
                SELECT datname FROM pg_database 
                WHERE datistemplate = false 
                ORDER BY datname
            `);

            return result.rows.map(row => 
                new DatabaseTreeItem(
                    row.datname,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'database',
                    connectionId,
                    row.datname
                )
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load databases: ${error}`);
            return [];
        }
    }

    private async getSchemas(connectionId: string, databaseName: string): Promise<DatabaseTreeItem[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return [];

        try {
            const result = await client.query(`
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY schema_name
            `);

            return result.rows.map(row => 
                new DatabaseTreeItem(
                    row.schema_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'schema',
                    connectionId,
                    databaseName,
                    row.schema_name
                )
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load schemas: ${error}`);
            return [];
        }
    }

    private async getTables(connectionId: string, databaseName: string, schemaName: string): Promise<DatabaseTreeItem[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return [];

        try {
            const result = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = $1 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `, [schemaName]);

            return result.rows.map(row => 
                new DatabaseTreeItem(
                    row.table_name,
                    vscode.TreeItemCollapsibleState.None,
                    'table',
                    connectionId,
                    databaseName,
                    schemaName,
                    row.table_name
                )
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load tables: ${error}`);
            return [];
        }
    }
}