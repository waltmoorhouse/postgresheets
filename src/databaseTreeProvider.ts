// databaseTreeProvider.ts - Provides tree view for database structure

import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig, ConnectionStatus } from './connectionManager';

export class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'connection' | 'database' | 'otherDatabases' | 'otherDatabase' | 'schema' | 'table',
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
        } else if (type === 'otherDatabases') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (type === 'otherDatabase') {
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
    // Track collapsed/expanded state for connection nodes so we can programmatically
    // collapse a single connection without affecting others.
    private connectionCollapsedState = new Map<string, boolean>();

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

    // Collapse a specific connection node programmatically (model-driven)
    collapseConnectionNode(connectionId: string): void {
        this.connectionCollapsedState.set(connectionId, true);
        this._onDidChangeTreeData.fire();
    }

    // Optional: expand helper if needed elsewhere
    expandConnectionNode(connectionId: string): void {
        this.connectionCollapsedState.set(connectionId, false);
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
            // Show the connected database and "Other DBs" folder
            return this.getDatabases(element.connectionId!);
        }

        if (element.type === 'otherDatabases') {
            // Show other databases (non-expandable)
            return this.getOtherDatabases(element.connectionId!);
        }

        if (element.type === 'database') {
            // Show schemas for the connected database
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
            const collapsed = this.connectionCollapsedState.get(config.id);
            const collapsibleState = collapsed === false
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
            const item = new DatabaseTreeItem(
                config.name,
                collapsibleState,
                'connection',
                config.id
            );
            // Provide a stable id so VS Code can track the item across refreshes
            item.id = config.id;

            item.iconPath = this.getStatusIcon(status);
            // Description uses a shape glyph plus a short textual status so
            // colorblind users have a shape to rely on in addition to color.
            item.description = this.formatStatusLabel(status);
            item.contextValue = this.getConnectionContextValue(status);
            // Tooltip contains a plain text status for screen readers and clarity.
            item.tooltip = `${config.host}:${config.port}/${config.database}\nStatus: ${this.formatStatusText(status)}`;

            return item;
        });
    }

    private async getDatabases(connectionId: string): Promise<DatabaseTreeItem[]> {
        // Try to get existing client, if not connected, attempt to connect
        let client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            client = await this.connectionManager.connect(connectionId);
            if (!client) return [];
        }

        this.connectionManager.markBusy(connectionId);

        try {
            // Get the connection config to find the connected database
            const configs = await this.connectionManager.getConnections();
            const config = configs.find(c => c.id === connectionId);
            if (!config) return [];

            const result = await client.query(`
                SELECT datname FROM pg_database 
                WHERE datistemplate = false 
                ORDER BY datname
            `);

            const databases = result.rows.map(row => row.datname);
            const connectedDb = config.database;
            
            const items: DatabaseTreeItem[] = [];
            
            // Add the connected database first (expandable)
            items.push(new DatabaseTreeItem(
                connectedDb,
                vscode.TreeItemCollapsibleState.Collapsed,
                'database',
                connectionId,
                connectedDb
            ));

            // Add "Other DBs" folder if there are other databases
            const otherDbs = databases.filter(db => db !== connectedDb);
            if (otherDbs.length > 0) {
                const otherDbsItem = new DatabaseTreeItem(
                    'Other DBs',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'otherDatabases',
                    connectionId
                );
                items.push(otherDbsItem);
            }

            return items;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load databases: ${error}`);
            return [];
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async getOtherDatabases(connectionId: string): Promise<DatabaseTreeItem[]> {
        // Get list of all databases except the connected one
        let client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            client = await this.connectionManager.connect(connectionId);
            if (!client) return [];
        }

        this.connectionManager.markBusy(connectionId);

        try {
            const configs = await this.connectionManager.getConnections();
            const config = configs.find(c => c.id === connectionId);
            if (!config) return [];

            const result = await client.query(`
                SELECT datname FROM pg_database 
                WHERE datistemplate = false 
                ORDER BY datname
            `);

            const connectedDb = config.database;
            
            // Return non-expandable items for other databases with "+ Add connection" 
            return result.rows
                .filter(row => row.datname !== connectedDb)
                .map(row => {
                    const item = new DatabaseTreeItem(
                        row.datname,
                        vscode.TreeItemCollapsibleState.None,
                        'otherDatabase',
                        connectionId,
                        row.datname
                    );
                    // Add the "+ Add connection" description and command
                    item.description = '+ Add connection';
                    item.tooltip = `Click to add a new connection to ${row.datname}`;
                    item.command = {
                        command: 'postgres-editor.addConnectionFromOtherDb',
                        title: 'Add Connection',
                        arguments: [item]
                    };
                    return item;
                });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load databases: ${error}`);
            return [];
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async getSchemas(connectionId: string, databaseName: string): Promise<DatabaseTreeItem[]> {
        // Try to get existing client, if not connected, attempt to connect
        let client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            client = await this.connectionManager.connect(connectionId);
            if (!client) return [];
        }

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
        // Try to get existing client, if not connected, attempt to connect
        let client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            client = await this.connectionManager.connect(connectionId);
            if (!client) return [];
        }

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
        // Color blind users might not be able to see these, but we can still have them for people with color vision.
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
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.gray'));
        }
    }

    private formatStatusLabel(status: ConnectionStatus): string {
        // Provide a glyph plus a short status so users do not rely on  color alone (e.g. green circle). 
        // Shapes give an additional visual cue for colorblind users.
        switch (status) {
            case 'connected':
                return '✔ Connected';
            case 'busy':
                return '⚙ Busy';
            case 'connecting':
                return '⏳ Connecting';
            case 'error':
                return '🔴 Error';
            case 'disconnected':
            default:
                return '✖ Disconnected';
        }
    }
    private formatStatusText(status: ConnectionStatus): string {
        switch (status) {
            case 'connected':
                return 'Connected';
            case 'busy':
                return 'Busy';
            case 'connecting':
                return 'Connecting';
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