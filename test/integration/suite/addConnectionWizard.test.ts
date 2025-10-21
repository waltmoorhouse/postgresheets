// @ts-nocheck
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Add Connection Integration', () => {
    test('Add Connection command opens webview', async function() {
        this.timeout(20000);

        const extension = vscode.extensions.getExtension('WaltMoorhouse.postgresheets');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }

        // We can't inspect the webview DOM from here, but we can verify that
        // the command exists and can be executed without throwing.
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('postgres-editor.addConnection'), 'addConnection command not registered');

        // Create a harness panelFactory so the extension opens the wizard with
        // a test-friendly panel. The harness captures postMessage calls
        // and exposes a function to send messages to the extension handler.
        let lastHandler: any = null;
        const postMessages: any[] = [];
        const harnessPanel: any = {
            webview: {
                cspSource: 'vscode-resource:',
                postMessage: (msg: any) => postMessages.push(msg),
                asWebviewUri: (uri: vscode.Uri) => uri,
                onDidReceiveMessage: (cb: any) => {
                    lastHandler = cb;
                    return { dispose: () => {} };
                }
            },
            dispose: () => {},
            onDidDispose: (_cb: any) => {}
        };

        const panelFactory = () => harnessPanel;

        // Open the wizard using the test-only command that accepts a panelFactory
        await vscode.commands.executeCommand('postgres-editor._testOpenAddConnection', panelFactory);

        // Ensure the extension registered a handler
        assert.ok(typeof lastHandler === 'function', 'webview handler not registered');

        // Simulate sending 'testConnection' message from the webview
        await lastHandler({ command: 'testConnection', payload: { mode: 'connectionString', connStr: 'postgres://u:p@localhost:5432/db' } });
        // The extension should call webview.postMessage with a 'testResult'
    assert.ok(postMessages.some((m: any) => m && m.command === 'testResult'));

        // Now simulate saving. Provide a mock parseConnectionString and saveNewConnection via the real connection manager
        await lastHandler({ command: 'saveConnection', payload: { mode: 'connectionString', connStr: 'postgres://u:p@localhost:5432/db', name: 'integration-test', password: '' } });

        // After save, the extension should have updated globalState connections; use the test-only command to list them.
        const saved = await vscode.commands.executeCommand('postgres-editor._testListConnections');
        assert.ok(Array.isArray(saved), 'saved connections list expected');
        assert.ok(saved.some((c: any) => c.name === 'integration-test'), 'Saved connection not found');
    });
});
