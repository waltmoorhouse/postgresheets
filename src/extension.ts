import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from './connectionManager';
import { DatabaseTreeItem, DatabaseTreeProvider } from './databaseTreeProvider';
import { DataEditor } from './dataEditor';
import { buildCreateTableSql, buildDropTableSql } from './tableSqlBuilder';
import { SchemaDesigner } from './schemaDesigner';

export function activate(context: vscode.ExtensionContext) {
    console.log('PostgreSQL Data Editor extension is now active');

    const connectionManager = new ConnectionManager(context);
    const treeProvider = new DatabaseTreeProvider(connectionManager);
    const dataEditor = new DataEditor(context, connectionManager);
    const schemaDesigner = new SchemaDesigner(context, connectionManager);

    // Register tree view
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    type ConnectionPickItem = vscode.QuickPickItem & { connection: ConnectionConfig };
    type DropOptionPick = vscode.QuickPickItem & { cascade: boolean };

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

    const showSqlConfirmation = async (title: string, sql: string, actionLabel: string = 'Run'): Promise<boolean> => {
        const selection = await vscode.window.showInformationMessage(
            title,
            { modal: true, detail: sql },
            actionLabel,
            'Cancel'
        );
        return selection === actionLabel;
    };

    const executeSql = async (connectionId: string | undefined, sql: string): Promise<boolean> => {
        if (!connectionId) return false;
        const client = await connectionManager.getClient(connectionId);
        if (!client) return false;

        connectionManager.markBusy(connectionId);
        try {
            await client.query(sql);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`SQL execution failed: ${error}`);
            return false;
        } finally {
            connectionManager.markIdle(connectionId);
        }
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

        vscode.commands.registerCommand('postgres-editor.createTable', async (item: DatabaseTreeItem) => {
            if (!item || item.type !== 'schema') {
                vscode.window.showErrorMessage('Create Table must be invoked on a schema node.');
                return;
            }

            const tableName = await vscode.window.showInputBox({
                prompt: 'New table name',
                validateInput: value => value && value.trim().length > 0 ? undefined : 'Table name is required'
            });
            if (!tableName) return;

            const columnsDefinition = await vscode.window.showInputBox({
                prompt: 'Enter column definitions (e.g. id SERIAL PRIMARY KEY, name TEXT NOT NULL)',
                value: 'id SERIAL PRIMARY KEY'
            });
            if (columnsDefinition === undefined) return;

            let sql: string;
            try {
                sql = buildCreateTableSql(item.schemaName!, tableName.trim(), columnsDefinition);
            } catch (error) {
                vscode.window.showErrorMessage(String(error));
                return;
            }

            const shouldRun = await showSqlConfirmation(`Create table "${tableName}"?`, sql);
            if (!shouldRun) return;

            const executed = await executeSql(item.connectionId, sql);
            if (executed) {
                vscode.window.showInformationMessage(`Table "${tableName}" created successfully.`);
                treeProvider.refresh();
            }
        }),

        vscode.commands.registerCommand('postgres-editor.alterTable', async (item: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Alter Table must be invoked on a table node.');
                return;
            }

            await schemaDesigner.openDesigner(item);
        }),

        vscode.commands.registerCommand('postgres-editor.dropTable', async (item: DatabaseTreeItem) => {
            if (!item || item.type !== 'table') {
                vscode.window.showErrorMessage('Drop Table must be invoked on a table node.');
                return;
            }

            const cascadeChoice = await vscode.window.showQuickPick<DropOptionPick>(
                [
                    { label: 'No Cascade', description: 'Fail if dependent objects exist.', cascade: false },
                    { label: 'Cascade', description: 'Drop dependent objects as well.', cascade: true }
                ],
                { placeHolder: 'Choose drop behavior' }
            );

            if (!cascadeChoice) return;

            const sql = buildDropTableSql(item.schemaName!, item.tableName!, cascadeChoice.cascade);

            const shouldRun = await showSqlConfirmation(`Drop table "${item.tableName}"?`, sql, 'Drop');
            if (!shouldRun) return;

            const executed = await executeSql(item.connectionId, sql);
            if (executed) {
                vscode.window.showInformationMessage(`Table "${item.tableName}" dropped.`);
                treeProvider.refresh();
            }
        }),

        treeView
    );
}

export function deactivate() {
    // Cleanup connections
}