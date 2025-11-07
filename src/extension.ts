import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from './connectionManager';
import { DatabaseTreeItem, DatabaseTreeProvider } from './databaseTreeProvider';
import { DataEditor } from './dataEditor';
import { SchemaDesigner } from './schemaDesigner';
import { CreateTableWizard } from './createTableWizard';
import { DropTableWizard } from './dropTableWizard';
import { CsvExporter } from './csvExporter';
import { CsvImportWizard } from './csvImportWizard';
import { QueryHistory } from './queryHistory';
import { QueryHistoryView } from './queryHistoryView';
import { SqlTerminalProvider } from './sqlTerminalProvider';
import { IndexManagerView } from './indexManagerView';
import { PermissionsManagerView } from './permissionsManagerView';
import { TableStatsViewProvider } from './tableStatsViewProvider';
import { BackupRestoreManager } from './backupRestoreManager';
import { info } from './logger';

export function activate(context: vscode.ExtensionContext) {
    info('PostgreSQL Data Editor extension is now active');

    const connectionManager = new ConnectionManager(context);
    // Track connection attempts so we can expose a toolbar action when any
    // connection is in the 'connecting' state.
    const connectingSet = new Set<string>();

    // Initialize toolbar context based on any existing connection statuses.
    (async () => {
        const configs = await connectionManager.getConnections();
        for (const c of configs) {
            if (connectionManager.getConnectionStatus(c.id) === 'connecting') {
                connectingSet.add(c.id);
            }
        }
        void vscode.commands.executeCommand('setContext', 'postgresHasConnecting', connectingSet.size > 0);
    })();

    connectionManager.onStatusChange((event) => {
        if (event.status === 'connecting') {
            connectingSet.add(event.id);
        } else {
            connectingSet.delete(event.id);
        }
        void vscode.commands.executeCommand('setContext', 'postgresHasConnecting', connectingSet.size > 0);
    });
    const treeProvider = new DatabaseTreeProvider(connectionManager);
    const dataEditor = new DataEditor(context, connectionManager);
    const schemaDesigner = new SchemaDesigner(context, connectionManager);
    const createTableWizard = new CreateTableWizard(context, connectionManager, () => treeProvider.refresh());
    const dropTableWizard = new DropTableWizard(context, connectionManager, () => treeProvider.refresh());
    const addConnectionWizard = new (require('./addConnectionWizard').AddConnectionWizard)(context, connectionManager, () => treeProvider.refresh());
    const queryHistory = new QueryHistory(context);
    const queryHistoryView = new QueryHistoryView(context, queryHistory);
    const sqlTerminalProvider = new SqlTerminalProvider(context, connectionManager, queryHistory);
    const indexManagerView = new IndexManagerView(context, connectionManager);
    const permissionsManagerView = new PermissionsManagerView(context, connectionManager);
    const tableStatsViewProvider = new TableStatsViewProvider(context, connectionManager);
    const backupRestoreManager = new BackupRestoreManager(connectionManager);

    // Register tree view
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    // Register Query History webview view
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            QueryHistoryView.viewType,
            queryHistoryView
        )
    );

    type ConnectionPickItem = vscode.QuickPickItem & { connection: ConnectionConfig };

    const asString = (label: string | vscode.TreeItemLabel | undefined): string => {
        if (!label) {
            return '';
        }
        return typeof label === 'string' ? label : label.label;
    };

    const resolveConnectionTarget = async (item?: DatabaseTreeItem): Promise<{ id: string; name: string } | null> => {
        if (item && item.connectionId) {
            return {
                id: item.connectionId,
                name: asString(item.label)
            };
        }

        const configs = await connectionManager.getConnections();
        if (configs.length === 0) {
            vscode.window.showInformationMessage('No saved PostgreSQL connections found.');
            return null;
        }

        const picks: ConnectionPickItem[] = configs.map(config => ({
            label: config.name,
            description: `${config.host}:${config.port}/${config.database}`,
            connection: config
        }));

        const choice = await vscode.window.showQuickPick<ConnectionPickItem>(picks, {
            placeHolder: 'Select a connection'
        });

        if (!choice) {
            return null;
        }

        return {
            id: choice.connection.id,
            name: choice.connection.name
        };
    };

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-editor.addConnection', async () => {
            await addConnectionWizard.openWizard();
        }),

        vscode.commands.registerCommand('postgres-editor.addConnectionFromOtherDb', async (item: DatabaseTreeItem) => {
            // Get the connection config to prefill values
            if (item && item.connectionId && item.databaseName) {
                const configs = await connectionManager.getConnections();
                const config = configs.find(c => c.id === item.connectionId);
                if (config) {
                    // Get the stored password but DO NOT include it in the prefill (security)
                    // const password = await context.secrets.get(`postgres-password-${item.connectionId}`);
                    // Open wizard with prefilled values, changing the database name to the clicked database
                    await addConnectionWizard.openWizard({
                        ...config,
                        database: item.databaseName, // Use the database from the tree item
                        name: `${config.name} (${item.databaseName})` // Suggest a new name
                    });
                }
            }
        }),

        vscode.commands.registerCommand('postgres-editor.editConnection', async (item) => {
            if (item && item.connectionId) {
                const configs = await connectionManager.getConnections();
                const config = configs.find(c => c.id === item.connectionId);
                if (config) {
                    // Open wizard with prefilled values and edit mode (do NOT prefill password)
                    await addConnectionWizard.openWizard({
                        ...config,
                        editMode: true
                    });
                }
            }
        }),

        vscode.commands.registerCommand('postgres-editor.deleteConnection', async (item) => {
            if (item && item.connectionId) {
                await connectionManager.deleteConnection(item.connectionId);
                treeProvider.refresh();
            }
        }),

        vscode.commands.registerCommand('postgres-editor.refreshExplorer', () => {
            treeProvider.refresh();
        }),

        vscode.commands.registerCommand('postgres-editor.connect', async (item?: DatabaseTreeItem) => {
            const target = await resolveConnectionTarget(item);
            if (!target) return;

            const status = connectionManager.getConnectionStatus(target.id);
            if (status === 'connected' || status === 'busy') {
                vscode.window.showInformationMessage(`Already connected to "${target.name}"`);
                return;
            }

            // Show a cancellable progress notification while attempting to connect.
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Connecting to "${target.name}"`,
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    // Delegate cancellation to the ConnectionManager so it can
                    // abort underlying socket attempts.
                    connectionManager.cancelConnect(target.id);
                });

                const client = await connectionManager.connect(target.id, status === 'error');
                if (client) {
                    vscode.window.showInformationMessage(`Connected to "${target.name}"`);
                    treeProvider.refresh();
                } else {
                    // If connect returned null and we are not connected, the
                    // connection was either cancelled or failed — connectionManager
                    // already set appropriate status and showed errors where needed.
                    const newStatus = connectionManager.getConnectionStatus(target.id);
                    if (newStatus === 'disconnected') {
                        vscode.window.showInformationMessage(`Connection to "${target.name}" cancelled`);
                    }
                }
            });
        }),

        vscode.commands.registerCommand('postgres-editor.disconnect', async (item?: DatabaseTreeItem) => {
            const target = await resolveConnectionTarget(item);
            if (!target) return;

            // Collapse only this connection node via provider model state
            if (item && item.type === 'connection' && item.connectionId) {
                try {
                    treeProvider.collapseConnectionNode(item.connectionId);
                } catch {
                    // Non-fatal; continue
                }
            }

            await connectionManager.disconnect(target.id);
            vscode.window.showInformationMessage(`Disconnected from "${target.name}"`);
            treeProvider.refresh();
        }),

        vscode.commands.registerCommand('postgres-editor.refreshConnection', async (item?: DatabaseTreeItem) => {
            const target = await resolveConnectionTarget(item);
            if (!target) return;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Reconnecting to "${target.name}"`,
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    connectionManager.cancelConnect(target.id);
                });

                const client = await connectionManager.connect(target.id, true);
                if (client) {
                    vscode.window.showInformationMessage(`Reconnected to "${target.name}"`);
                    treeProvider.refresh();
                } else {
                    const newStatus = connectionManager.getConnectionStatus(target.id);
                    if (newStatus === 'disconnected') {
                        vscode.window.showInformationMessage(`Reconnection to "${target.name}" cancelled`);
                    }
                }
            });
        }),

        // Allow cancelling a pending connection attempt via a dedicated command
        vscode.commands.registerCommand('postgres-editor.cancelConnect', async (item?: DatabaseTreeItem) => {
            // If invoked from the tree, ensure we have the target id
            let targetId: string | undefined;
            let name = 'connection';
            if (item && item.connectionId) {
                targetId = item.connectionId;
                // DatabaseTreeItem's label is declared as string in our constructor,
                // but the base TreeItem type is more permissive. Cast to string
                // to keep TypeScript happy.
                name = (item.label as string) || 'connection';
            } else {
                // If not invoked from a tree item, ask the user to pick a connecting target
                const configs = await connectionManager.getConnections();
                const connecting = configs.filter(c => connectionManager.getConnectionStatus(c.id) === 'connecting');
                if (connecting.length === 0) {
                    vscode.window.showInformationMessage('No connection attempts in progress');
                    return;
                }

                type ConnectAttemptPick = vscode.QuickPickItem & { id: string };
                const picks: ConnectAttemptPick[] = connecting.map(c => ({ label: c.name, id: c.id }));
                const choice = await vscode.window.showQuickPick<ConnectAttemptPick>(picks, { placeHolder: 'Select connection to cancel' });
                if (!choice) return;
                targetId = choice.id;
                name = choice.label || 'connection';
            }

            if (!targetId) return;

            const cancelled = await connectionManager.cancelConnect(targetId);
            if (cancelled) {
                vscode.window.showInformationMessage(`Cancelled connection attempt to "${name}"`);
                treeProvider.refresh();
            } else {
                vscode.window.showInformationMessage(`No active connection attempt to cancel for "${name}"`);
            }
        }),
        // Cancel all in-flight connection attempts
        vscode.commands.registerCommand('postgres-editor.cancelAllConnects', async () => {
            const configs = await connectionManager.getConnections();
            const connecting = configs.filter(c => connectionManager.getConnectionStatus(c.id) === 'connecting');
            if (connecting.length === 0) {
                vscode.window.showInformationMessage('No connection attempts in progress');
                return;
            }

            for (const c of connecting) {
                await connectionManager.cancelConnect(c.id);
            }

            vscode.window.showInformationMessage(`Cancelled ${connecting.length} connection attempt(s)`);
            treeProvider.refresh();
        }),

        // Test-only command to open Add Connection with a custom panelFactory
        vscode.commands.registerCommand('postgres-editor._testOpenAddConnection', async (panelFactory?: unknown) => {
            const testWizard = new (require('./addConnectionWizard').AddConnectionWizard)(context, connectionManager, () => treeProvider.refresh(), panelFactory);
            await testWizard.openWizard();
        }),

        // Test-only: return saved connections (for integration tests only)
        vscode.commands.registerCommand('postgres-editor._testListConnections', async () => {
            return await connectionManager.getConnections();
        }),

        vscode.commands.registerCommand('postgres-editor.openTable', async (item) => {
            if (item && item.type === 'table') {
                await dataEditor.openTable(item);
            }
        }),

        vscode.commands.registerCommand('postgres-editor.createTable', async (item?: DatabaseTreeItem) => {
            await createTableWizard.openWizard(item);
        }),

        vscode.commands.registerCommand('postgres-editor.alterTable', async (item: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Alter Table must be invoked on a table node.');
                return;
            }

            await schemaDesigner.openDesigner(item);
        }),

        vscode.commands.registerCommand('postgres-editor.dropTable', async (item?: DatabaseTreeItem) => {
            await dropTableWizard.openWizard(item);
        }),

        vscode.commands.registerCommand('postgres-editor.exportTableAsCSV', async (item?: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Export as CSV must be invoked on a table node.');
                return;
            }

            try {
                const tableName = item.label as string;
                const connectionId = item.connectionId;
                const schemaName = item.schemaName;

                if (!connectionId) {
                    vscode.window.showErrorMessage('Could not determine connection for table export');
                    return;
                }

                // Get the client to query table data
                const client = await connectionManager.getClient(connectionId);
                if (!client) {
                    vscode.window.showErrorMessage('Could not connect to database');
                    return;
                }

                try {
                    // Query all data from the table
                    const quotedSchema = `"${schemaName || 'public'}"`;
                    const quotedTable = `"${tableName}"`;
                    const result = await client.query(`SELECT * FROM ${quotedSchema}.${quotedTable}`);
                    const rows = result.rows;

                    if (rows.length === 0) {
                        vscode.window.showWarningMessage(`Table ${tableName} is empty`);
                        return;
                    }

                    // Ask if user wants headers
                    const includeHeaders = await vscode.window.showQuickPick(
                        ['Yes', 'No'],
                        { placeHolder: 'Include column headers in CSV?' }
                    );

                    if (includeHeaders === undefined) {
                        return; // User cancelled
                    }

                    // Get column names from first row
                    const columnNames = Object.keys(rows[0]);
                    
                    // Convert rows to arrays
                    const rowArrays = rows.map(row => columnNames.map(col => row[col]));

                    // Export to CSV file
                    const savedPath = await CsvExporter.exportToFile(
                        columnNames,
                        rowArrays,
                        tableName,
                        { includeHeaders: includeHeaders === 'Yes' }
                    );

                    if (savedPath) {
                        vscode.window.showInformationMessage(`Table exported successfully to ${savedPath}`);
                    }
                } finally {
                    connectionManager.markIdle(connectionId);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export table: ${error}`);
            }
        }),

        vscode.commands.registerCommand('postgres-editor.importTableFromCSV', async (item?: DatabaseTreeItem) => {
            try {
                const csvImportWizard = new CsvImportWizard(context, connectionManager, () => treeProvider.refresh());
                await csvImportWizard.openWizard(item || ({} as DatabaseTreeItem));
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open CSV import wizard: ${error}`);
            }
        }),

        vscode.commands.registerCommand('postgres-editor.viewQueryHistory', async () => {
            // Reveal the query history panel
            await vscode.commands.executeCommand('postgresQueryHistory.focus');
            queryHistoryView.refresh();
        }),

        vscode.commands.registerCommand('postgres-editor.clearQueryHistory', async () => {
            // The query history view already has a confirmation dialog, 
            // so we just trigger it via a message
            const confirmed = await vscode.window.showWarningMessage(
                'Clear all query history?',
                { modal: true },
                'Clear'
            );
            if (confirmed === 'Clear') {
                await vscode.commands.executeCommand('postgres-editor.refreshQueryHistory');
            }
        }),

        vscode.commands.registerCommand('postgres-editor.refreshQueryHistory', () => {
            queryHistoryView.refresh();
        }),

        vscode.commands.registerCommand('postgres-editor.openSqlTerminal', async (item?: DatabaseTreeItem) => {
            const connectionId = item?.connectionId;
            await sqlTerminalProvider.openSqlTerminal(connectionId);
        }),

        vscode.commands.registerCommand('postgres-editor.manageIndexes', async (item?: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Manage Indexes must be invoked on a table node.');
                return;
            }

            await indexManagerView.openIndexManager(item);
        }),

        vscode.commands.registerCommand('postgres-editor.managePermissions', async (item?: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Manage Permissions must be invoked on a table node.');
                return;
            }

            await permissionsManagerView.openPermissionsManager(item);
        }),

        vscode.commands.registerCommand('postgres-editor.viewTableStats', async (item?: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('View Table Statistics must be invoked on a table node.');
                return;
            }

            await tableStatsViewProvider.openStatsView(item);
        }),

        vscode.commands.registerCommand('postgres-editor.backupDatabase', async (item?: DatabaseTreeItem) => {
            const target = await resolveConnectionTarget(item);
            if (!target) return;

            // Check if pg_dump is available
            const available = await backupRestoreManager.checkPgDumpAvailable();
            if (!available) {
                const install = await vscode.window.showErrorMessage(
                    'pg_dump is not available. Please install PostgreSQL client tools.',
                    'Learn More'
                );
                if (install === 'Learn More') {
                    vscode.env.openExternal(vscode.Uri.parse('https://www.postgresql.org/download/'));
                }
                return;
            }

            // Get connection config for database name
            const connections = await connectionManager.getConnections();
            const config = connections.find(c => c.id === target.id);
            if (!config) {
                vscode.window.showErrorMessage('Connection not found');
                return;
            }

            // Select backup format
            const formatChoice = await vscode.window.showQuickPick([
                { label: 'Custom (recommended)', value: 'custom', description: 'PostgreSQL custom archive format (compressed)' },
                { label: 'Plain SQL', value: 'plain', description: 'Plain-text SQL script' },
                { label: 'Directory', value: 'directory', description: 'Directory format (parallel dump)' },
                { label: 'Tar', value: 'tar', description: 'Tar archive format' }
            ], { placeHolder: 'Select backup format' });

            if (!formatChoice) return;

            const format = formatChoice.value as 'custom' | 'plain' | 'directory' | 'tar';

            // Get save location
            const suggestedFilename = backupRestoreManager.getSuggestedBackupFilename(config.database, format);
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(suggestedFilename),
                filters: format === 'plain' ? { 'SQL Files': ['sql'] } : { 'Backup Files': ['dump', 'tar', 'dir'] }
            });

            if (!saveUri) return;

            // Perform backup with progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Backing up database "${config.database}"`,
                cancellable: false
            }, async (progress) => {
                try {
                    await backupRestoreManager.backupDatabase(
                        target.id,
                        saveUri.fsPath,
                        { format, verbose: true },
                        (backupProgress) => {
                            progress.report({
                                message: backupProgress.message,
                                increment: backupProgress.percentage
                            });
                        }
                    );

                    vscode.window.showInformationMessage(`Database backup completed: ${saveUri.fsPath}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Backup failed: ${error}`);
                }
            });
        }),

        vscode.commands.registerCommand('postgres-editor.restoreDatabase', async (item?: DatabaseTreeItem) => {
            const target = await resolveConnectionTarget(item);
            if (!target) return;

            // Check if pg_restore is available
            const available = await backupRestoreManager.checkPgRestoreAvailable();
            if (!available) {
                const install = await vscode.window.showErrorMessage(
                    'pg_restore is not available. Please install PostgreSQL client tools.',
                    'Learn More'
                );
                if (install === 'Learn More') {
                    vscode.env.openExternal(vscode.Uri.parse('https://www.postgresql.org/download/'));
                }
                return;
            }

            // Warning
            const proceed = await vscode.window.showWarningMessage(
                'Restoring a database will modify your data. Make sure you have a backup first.',
                { modal: true },
                'Continue'
            );

            if (proceed !== 'Continue') return;

            // Get backup file
            const openUri = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'Backup Files': ['dump', 'tar', 'sql'],
                    'All Files': ['*']
                }
            });

            if (!openUri || openUri.length === 0) return;

            const backupPath = openUri[0].fsPath;

            // Restore options
            const cleanChoice = await vscode.window.showQuickPick([
                { label: 'No', value: false, description: 'Add to existing database' },
                { label: 'Yes (Clean)', value: true, description: 'Drop existing objects before restore' }
            ], { placeHolder: 'Clean database before restore?' });

            if (cleanChoice === undefined) return;

            // Perform restore with progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Restoring database',
                cancellable: false
            }, async (progress) => {
                try {
                    await backupRestoreManager.restoreDatabase(
                        target.id,
                        backupPath,
                        {
                            clean: cleanChoice.value,
                            ifExists: true,
                            noOwner: true,
                            singleTransaction: true,
                            verbose: true
                        },
                        (restoreProgress) => {
                            progress.report({
                                message: restoreProgress.message,
                                increment: restoreProgress.percentage
                            });
                        }
                    );

                    vscode.window.showInformationMessage('Database restore completed successfully');
                    treeProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Restore failed: ${error}`);
                }
            });
        }),

        treeView
    );
}

export function deactivate() {
    // Cleanup connections
}