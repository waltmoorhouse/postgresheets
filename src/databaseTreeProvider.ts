// databaseTreeProvider.ts - Provides tree view for database structure

import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig, ConnectionStatus } from './connectionManager';

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
    private refreshTimeout: NodeJS.Timeout | undefined;
    private pendingRefresh = false;
    private lastKnownStatuses = new Map<string, ConnectionStatus>();

    constructor(private connectionManager: ConnectionManager) {
        this.connectionManager.onStatusChange((event) => {
            const lastStatus = this.lastKnownStatuses.get(event.id);
            this.lastKnownStatuses.set(event.id, event.status);

            // Only refresh UI for connection state changes, not busy/idle flickers during queries
            if (this.shouldRefreshForStatusChange(lastStatus, event.status)) {
                this.throttledRefresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private shouldRefreshForStatusChange(oldStatus: ConnectionStatus | undefined, newStatus: ConnectionStatus): boolean {
        // Don't refresh for these transitions (they happen during normal operations)
        if (oldStatus === 'connected' && newStatus === 'busy') return false;
        if (oldStatus === 'busy' && newStatus === 'connected') return false;
        if (oldStatus === 'busy' && newStatus === 'busy') return false;
        if (oldStatus === 'connected' && newStatus === 'connected') return false;
        
        // Refresh for all other state changes (disconnected, connecting, error)
        return true;
    }

    private throttledRefresh(): void {
        if (this.pendingRefresh) {
            return;
        }
        this.pendingRefresh = true;
        
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        
        this.refreshTimeout = setTimeout(() => {
            this.pendingRefresh = false;
            this.refresh();
        }, 100);
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
        return configs.map(config => {
            const status = this.connectionManager.getConnectionStatus(config.id);
            const item = new DatabaseTreeItem(
                config.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                config.id
            );

            item.iconPath = this.getStatusIcon(status);
            item.description = this.formatStatusLabel(status);
            item.contextValue = this.getConnectionContextValue(status);
            item.tooltip = `${config.host}:${config.port}/${config.database}\nStatus: ${this.formatStatusLabel(status)}`;

            return item;
        });
    }

    private async getDatabases(connectionId: string): Promise<DatabaseTreeItem[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return [];

        this.connectionManager.markBusy(connectionId);

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
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async getSchemas(connectionId: string, databaseName: string): Promise<DatabaseTreeItem[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return [];

        this.connectionManager.markBusy(connectionId);

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
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async getTables(connectionId: string, databaseName: string, schemaName: string): Promise<DatabaseTreeItem[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return [];

        this.connectionManager.markBusy(connectionId);

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
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private getStatusIcon(status: ConnectionStatus): vscode.ThemeIcon {
        switch (status) {
            case 'connected':
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'));
            case 'busy':
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.blue'));
            case 'connecting':
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.yellow'));
            case 'error':
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.red'));
            case 'disconnected':
            default:
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.red'));
        }
    }

    private formatStatusLabel(status: ConnectionStatus): string {
        switch (status) {
            case 'connected':
                return 'Connected';
            case 'busy':
                return 'Working...';
            case 'connecting':
                return 'Connecting...';
            case 'error':
                return 'Error';
            case 'disconnected':
            default:
                return 'Disconnected';
        }
    }

    private getConnectionContextValue(status: ConnectionStatus): string {
        return `connection.${status}`;
    }
}