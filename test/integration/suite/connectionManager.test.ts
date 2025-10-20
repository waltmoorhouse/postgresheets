/**
 * Connection Manager Integration Tests
 * Tests database connection lifecycle
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Connection Manager Integration Tests', () => {
    vscode.window.showInformationMessage('Start Connection Manager tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('WaltMoorhouse.postgresheets');
        assert.ok(extension, 'Extension not found');
    });

    test('Extension should activate', async function() {
        this.timeout(10000);
        const extension = vscode.extensions.getExtension('WaltMoorhouse.postgresheets');
        assert.ok(extension);
        
        if (!extension.isActive) {
            await extension.activate();
        }
        
        assert.ok(extension.isActive, 'Extension did not activate');
    });

    test('PostgreSQL tree view should be registered', async () => {
        const extension = vscode.extensions.getExtension('WaltMoorhouse.postgresheets');
        assert.ok(extension);
        
        if (!extension.isActive) {
            await extension.activate();
        }

        // Check if tree view exists
        const treeView = vscode.window.createTreeView('postgresExplorer', {
            treeDataProvider: {
                getTreeItem: (element: any) => element,
                getChildren: () => []
            }
        });
        
        assert.ok(treeView, 'Tree view not registered');
        treeView.dispose();
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        const expectedCommands = [
            'postgres-editor.addConnection',
            'postgres-editor.editConnection',
            'postgres-editor.deleteConnection',
            'postgres-editor.refreshExplorer',
            'postgres-editor.openTable',
            'postgres-editor.connect',
            'postgres-editor.disconnect',
            'postgres-editor.cancelConnect',
            'postgres-editor.cancelAllConnects',
            'postgres-editor.refreshConnection',
            'postgres-editor.createTable',
            'postgres-editor.alterTable',
            'postgres-editor.dropTable'
        ];

        for (const cmd of expectedCommands) {
            assert.ok(
                commands.includes(cmd),
                `Command ${cmd} not registered`
            );
        }
    });
});
