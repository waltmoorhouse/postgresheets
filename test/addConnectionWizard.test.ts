import { jest } from '@jest/globals';
jest.mock('vscode');

import * as vscode from 'vscode';
import { AddConnectionWizard } from '../src/addConnectionWizard';

describe('AddConnectionWizard', () => {
    test('testConnection message calls connectionManager.testConnection and posts result', async () => {
        const mockConnMgr: any = {
            testConnection: (jest.fn() as any).mockResolvedValue({ success: true }),
            parseConnectionString: jest.fn(),
            saveNewConnection: jest.fn()
        };

        const disposables: any[] = [];
        const webviewListeners: any = {};

        const mockPanel: any = {
            webview: {
                cspSource: 'vscode-resource:',
                postMessage: jest.fn(),
                onDidReceiveMessage: (cb: any) => {
                    webviewListeners['cb'] = cb;
                    return { dispose: jest.fn() };
                }
            },
            dispose: jest.fn(),
            onDidDispose: (cb: any) => disposables.push(cb)
        };

        const refreshSpy = jest.fn();
        const panelFactory = jest.fn().mockReturnValue(mockPanel as any);
        const w = new AddConnectionWizard({} as any, mockConnMgr, refreshSpy, panelFactory as any);
        try {
            await w.openWizard();
        } catch (err) {
            console.error('openWizard threw', err);
            throw err;
        }

    // Ensure panelFactory was used to create the panel
    expect((panelFactory as any)).toHaveBeenCalled();

    // Ensure the wizard has the expected connection manager
    expect((w as any).connectionManager).toBe(mockConnMgr);
    // Invoke the registered handler directly (our wizard stores it on the instance)
    expect((w as any).lastMessageHandler).toBeDefined();
    expect(typeof (w as any).lastMessageHandler).toBe('function');
    await (w as any).lastMessageHandler({ command: 'testConnection', payload: { connStr: 'postgres://u:p@h:5432/db' } });

        if ((mockConnMgr.testConnection as jest.Mock).mock.calls.length === 0) {
            throw new Error('mockConnMgr.testConnection was not called. postMessage calls: ' + JSON.stringify((mockPanel.webview.postMessage as jest.Mock).mock.calls));
        }

        const calledWithTestResult = (mockPanel.webview.postMessage as jest.Mock).mock.calls.some((c: any[]) => c[0] && c[0].command === 'testResult');
        if (!calledWithTestResult) {
            throw new Error('webview.postMessage was not called with testResult. calls: ' + JSON.stringify((mockPanel.webview.postMessage as jest.Mock).mock.calls));
        }
    });

    test('saveConnection message calls saveNewConnection and disposes panel', async () => {
        const mockConnMgr: any = {
            testConnection: (jest.fn() as any).mockResolvedValue({ success: true }),
            parseConnectionString: jest.fn().mockReturnValue({ host: 'h', port: 5432, database: 'db', username: 'u', password: 'p', ssl: false }),
            saveNewConnection: (jest.fn() as any).mockResolvedValue({ id: 'new-id', name: 'name', host: 'h', port: 5432, database: 'db', username: 'u' })
        };

        const webviewListeners: any = {};
        const mockPanel: any = {
            webview: {
                cspSource: 'vscode-resource:',
                postMessage: jest.fn(),
                onDidReceiveMessage: (cb: any) => {
                    webviewListeners['cb'] = cb;
                    return { dispose: jest.fn() };
                }
            },
            dispose: jest.fn(),
            onDidDispose: jest.fn()
        };

        const refreshSpy = jest.fn();
        const panelFactory = jest.fn().mockReturnValue(mockPanel as any);
        const w = new AddConnectionWizard({} as any, mockConnMgr, refreshSpy, panelFactory as any);
        try {
            await w.openWizard();
        } catch (err) {
            console.error('openWizard threw', err);
            throw err;
        }

    // Ensure panelFactory was used to create the panel
    expect((panelFactory as any)).toHaveBeenCalled();

    // Ensure the wizard has the expected connection manager
    expect((w as any).connectionManager).toBe(mockConnMgr);
    // Invoke the registered handler directly (our wizard stores it on the instance)
    expect((w as any).lastMessageHandler).toBeDefined();
    expect(typeof (w as any).lastMessageHandler).toBe('function');
    await (w as any).lastMessageHandler({ command: 'saveConnection', payload: { mode: 'connectionString', connStr: 'postgres://u:p@h:5432/db', name: 'name', password: '' } });

        if ((mockConnMgr.parseConnectionString as jest.Mock).mock.calls.length === 0) {
            throw new Error('parseConnectionString was not called');
        }
        if ((mockConnMgr.saveNewConnection as jest.Mock).mock.calls.length === 0) {
            throw new Error('saveNewConnection was not called');
        }
        if ((mockPanel.dispose as jest.Mock).mock.calls.length === 0) {
            throw new Error('panel.dispose was not called');
        }
        if (refreshSpy.mock.calls.length === 0) {
            throw new Error('refreshTree was not called');
        }
    });
});
