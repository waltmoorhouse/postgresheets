import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from './connectionManager';
import { DatabaseTreeItem, DatabaseTreeProvider } from './databaseTreeProvider';
import { DataEditor } from './dataEditor';
import { SchemaDesigner } from './schemaDesigner';
import { CreateTableWizard } from './createTableWizard';
import { DropTableWizard } from './dropTableWizard';

export function activate(context: vscode.ExtensionContext) {
    console.log('PostgreSQL Data Editor extension is now active');

    const connectionManager = new ConnectionManager(context);
    const treeProvider = new DatabaseTreeProvider(connectionManager);
    const dataEditor = new DataEditor(context, connectionManager);
    const schemaDesigner = new SchemaDesigner(context, connectionManager);
    const createTableWizard = new CreateTableWizard(context, connectionManager, () => treeProvider.refresh());
    const dropTableWizard = new DropTableWizard(context, connectionManager, () => treeProvider.refresh());

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
            await connectionManager.addConnection();
            treeProvider.refresh();
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

            const client = await connectionManager.connect(target.id, status === 'error');
            if (client) {
                vscode.window.showInformationMessage(`Connected to "${target.name}"`);
                treeProvider.refresh();
            }
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

            const client = await connectionManager.connect(target.id, true);
            if (client) {
                vscode.window.showInformationMessage(`Reconnected to "${target.name}"`);
                treeProvider.refresh();
            }
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

        treeView
    );
}

export function deactivate() {
    // Cleanup connections
}