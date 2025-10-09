import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeProvider } from './databaseTreeProvider';
import { DataEditor } from './dataEditor';

export function activate(context: vscode.ExtensionContext) {
    console.log('PostgreSQL Data Editor extension is now active');

    const connectionManager = new ConnectionManager(context);
    const treeProvider = new DatabaseTreeProvider(connectionManager);
    const dataEditor = new DataEditor(context, connectionManager);

    // Register tree view
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

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

        vscode.commands.registerCommand('postgres-editor.openTable', async (item) => {
            if (item && item.type === 'table') {
                await dataEditor.openTable(item);
            }
        }),

        treeView
    );
}

export function deactivate() {
    // Cleanup connections
}