import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from './connectionManager';
import { DatabaseTreeItem, DatabaseTreeProvider } from './databaseTreeProvider';
import { DataEditor } from './dataEditor';
import { SchemaDesigner } from './schemaDesigner';
import { CreateTableWizard } from './createTableWizard';
import { DropTableWizard } from './dropTableWizard';
import { CsvExporter } from './csvExporter';
import { QueryHistory } from './queryHistory';
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

    // Register tree view
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

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

        vscode.commands.registerCommand('postgres-editor.editConnection', async (item) => {
            if (item && item.connectionId) {
                await connectionManager.editConnection(item.connectionId);
                treeProvider.refresh();
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
        vscode.commands.registerCommand('postgres-editor._testOpenAddConnection', async (panelFactory?: any) => {
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
                // Ask user if they want to include headers
                const includeHeaders = await vscode.window.showQuickPick(
                    [
                        { label: '$(check) Include Headers', picked: true, value: true },
                        { label: '$(close) Without Headers', picked: false, value: false }
                    ],
                    {
                        title: 'CSV Export Options',
                        placeHolder: 'Include column headers in export?',
                        canPickMany: false
                    }
                );

                if (includeHeaders === undefined) {
                    return; // User cancelled
                }

                // Get table data from data editor
                const tableName = item.label as string;
                const connectionId = item.connectionId;

                if (!connectionId) {
                    vscode.window.showErrorMessage('Could not determine connection for table export');
                    return;
                }

                // Open table to get data
                const result = await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Exporting ${tableName} as CSV...`,
                        cancellable: false
                    },
                    async () => {
                        // This will be called from the data editor via postMessage
                        // For now, we'll show a message that the export button should be used in the UI
                        return null;
                    }
                );

                vscode.window.showInformationMessage('Use the Export CSV button in the data editor toolbar to export table data.');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export table: ${error}`);
            }
        }),

        vscode.commands.registerCommand('postgres-editor.importTableFromCSV', async (item?: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Import from CSV must be invoked on a table node.');
                return;
            }

            try {
                const tableName = item.label as string;
                const connectionId = item.connectionId;
                const schemaName = item.schemaName;

                if (!connectionId) {
                    vscode.window.showErrorMessage('Could not determine connection for table import');
                    return;
                }

                // Import CSV file
                const csvData = await CsvExporter.importFromFile();
                if (!csvData) {
                    return; // User cancelled
                }

                // Get table structure to show column mapping options
                const client = await connectionManager.getClient(connectionId);
                if (!client) {
                    vscode.window.showErrorMessage('Could not connect to database');
                    return;
                }

                try {
                    // Fetch table columns
                    const columnsResult = await client.query(`
                        SELECT column_name, data_type
                        FROM information_schema.columns
                        WHERE table_schema = $1 AND table_name = $2
                        ORDER BY ordinal_position
                    `, [schemaName || 'public', tableName]);

                    const tableColumns = columnsResult.rows.map(row => ({
                        name: row.column_name,
                        type: row.data_type
                    }));

                    if (tableColumns.length === 0) {
                        vscode.window.showErrorMessage(`Could not find columns for table ${tableName}`);
                        return;
                    }

                    // Detect if first row is headers
                    const firstRowIsHeader = await vscode.window.showQuickPick(
                        [
                            { label: '$(check) First row contains headers', picked: true, value: true },
                            { label: '$(close) First row is data', picked: false, value: false }
                        ],
                        { title: 'CSV Import', placeHolder: 'Is the first row column headers?' }
                    );

                    if (firstRowIsHeader === undefined) {
                        return; // User cancelled
                    }

                    let dataRows = csvData.rows;
                    let csvHeaders: string[] = [];

                    if (firstRowIsHeader && dataRows.length > 0) {
                        csvHeaders = dataRows[0];
                        dataRows = dataRows.slice(1);
                    }

                    if (dataRows.length === 0) {
                        vscode.window.showErrorMessage('No data rows found in CSV');
                        return;
                    }

                    // Create column mapping
                    const columnMapping: Record<number, string> = {};

                    if (csvHeaders.length > 0) {
                        // Auto-map headers to table columns
                        for (let i = 0; i < csvHeaders.length; i++) {
                            const header = csvHeaders[i].trim();
                            const tableCol = tableColumns.find(c => c.name.toLowerCase() === header.toLowerCase());
                            if (tableCol) {
                                columnMapping[i] = tableCol.name;
                            }
                        }
                    } else {
                        // Auto-map by position if no headers
                        for (let i = 0; i < Math.min(dataRows[0].length, tableColumns.length); i++) {
                            columnMapping[i] = tableColumns[i].name;
                        }
                    }

                    // Show mapping confirmation
                    const mappedColumns = Object.entries(columnMapping)
                        .map(([idx, col]) => `Column ${parseInt(idx) + 1} → ${col}`)
                        .join('\n');

                    const confirmImport = await vscode.window.showQuickPick(
                        [
                            { label: `$(check) Import ${dataRows.length} rows`, value: true },
                            { label: '$(close) Cancel', value: false }
                        ],
                        { 
                            title: 'CSV Import Confirmation',
                            placeHolder: `Mapping:\n${mappedColumns}`,
                            canPickMany: false
                        }
                    );

                    if (!confirmImport?.value) {
                        return;
                    }

                    // Convert types and prepare data
                    const typedRows = dataRows.map(row => {
                        const typedRow: any = {};
                        for (const [csvIdx, tableCol] of Object.entries(columnMapping)) {
                            const idx = parseInt(csvIdx);
                            const colDef = tableColumns.find(c => c.name === tableCol);
                            if (idx < row.length && colDef) {
                                typedRow[tableCol] = CsvExporter.convertValue(row[idx], colDef.type);
                            }
                        }
                        return typedRow;
                    });

                    // Build INSERT statements
                    const columns = Object.values(columnMapping);
                    const insertStatements = typedRows.map((row, idx) => {
                        const values = columns.map(col => row[col] ?? null);
                        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                        const sql = `INSERT INTO "${schemaName || 'public'}"."${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
                        return { sql, values };
                    });

                    // Execute imports in a transaction
                    await client.query('BEGIN');
                    try {
                        for (const stmt of insertStatements) {
                            await client.query(stmt.sql, stmt.values);
                        }
                        await client.query('COMMIT');
                        vscode.window.showInformationMessage(`Successfully imported ${dataRows.length} rows into ${tableName}`);
                        
                        // Refresh tree view
                        treeProvider.refresh();
                    } catch (error) {
                        await client.query('ROLLBACK');
                        throw error;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Import failed: ${error}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to import CSV: ${error}`);
            }
        }),

        vscode.commands.registerCommand('postgres-editor.showQueryHistory', async () => {
            const entries = queryHistory.getRecent(50);

            if (entries.length === 0) {
                vscode.window.showInformationMessage('No query history available.');
                return;
            }

            interface QuickPickItemWithQuery extends vscode.QuickPickItem {
                query: string;
                entry: any;
            }

            const items: QuickPickItemWithQuery[] = entries.map(entry => ({
                label: QueryHistory.formatEntry(entry),
                description: `${entry.connectionName}`,
                detail: `${new Date(entry.timestamp).toLocaleString()}${entry.executionTime ? ` (${entry.executionTime}ms)` : ''}`,
                query: entry.query,
                entry
            }));

            const selected = await vscode.window.showQuickPick(items, {
                title: 'Query History',
                placeHolder: 'Select a query to copy or re-run'
            });

            if (!selected) {
                return;
            }

            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(copy) Copy to Clipboard', value: 'copy' },
                    { label: '$(redo) Re-run Query', value: 'rerun' }
                ],
                { title: 'Query History', placeHolder: 'What would you like to do?' }
            );

            if (!action) {
                return;
            }

            if (action.value === 'copy') {
                await vscode.env.clipboard.writeText(selected.query);
                vscode.window.showInformationMessage('Query copied to clipboard');
            } else if (action.value === 'rerun') {
                vscode.window.showInformationMessage('Re-running queries is not yet implemented');
                // TODO: Implement query re-run functionality
            }
        }),

        vscode.commands.registerCommand('postgres-editor.clearQueryHistory', async () => {
            const confirmed = await vscode.window.showQuickPick(
                [
                    { label: '$(check) Clear All History', value: true },
                    { label: '$(close) Cancel', value: false }
                ],
                { title: 'Clear Query History', placeHolder: 'This action cannot be undone' }
            );

            if (confirmed?.value) {
                await queryHistory.clearHistory();
                vscode.window.showInformationMessage('Query history cleared');
            }
        }),

        treeView
    );
}

export function deactivate() {
    // Cleanup connections
}