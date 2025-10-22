jest.mock('vscode');

import * as vscode from 'vscode';
import { jest } from '@jest/globals';
import { DataEditor } from '../src/dataEditor';

const makeContext = (): vscode.ExtensionContext => {
  return {
    subscriptions: [],
    workspaceState: { get: jest.fn(), update: jest.fn() } as any,
    globalState: { get: jest.fn(), update: jest.fn() } as any,
    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() } as any,
    extensionPath: '',
    asAbsolutePath: (p: string) => p,
    storagePath: undefined,
    globalStoragePath: '',
    logPath: '',
    environmentVariableCollection: {} as any
  } as any;
};

describe('DataEditor table preferences persistence', () => {
  test('saveTablePreferences persists preferences and notifies webview', async () => {
    const ctx = makeContext();
    const mockConnMgr = {} as any;
    const editor = new DataEditor(ctx, mockConnMgr);

    const panel = { webview: { postMessage: jest.fn() } } as any;

    const prefs = { columnOrder: ['id', 'name'], hiddenColumns: ['secret'] };
  ((ctx.globalState.update) as any).mockResolvedValue(undefined);

    await (editor as any).saveTablePreferences(panel, 'public', 'users', prefs);

    expect((ctx.globalState.update as jest.Mock)).toHaveBeenCalledWith('tablePrefs:public.users', prefs);
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ command: 'saveTablePreferencesResult', payload: { success: true } });
  });

  test('loadTablePreferences returns stored prefs', async () => {
    const ctx = makeContext();
    const mockConnMgr = {} as any;
    const editor = new DataEditor(ctx, mockConnMgr);

    const stored = { columnOrder: ['a','b'], hiddenColumns: ['x'] };
    (ctx.globalState.get as jest.Mock).mockReturnValue(stored);

    const prefs = await (editor as any).loadTablePreferences('public', 'users');
    expect(prefs).toEqual(stored);
    expect((ctx.globalState.get as jest.Mock)).toHaveBeenCalledWith('tablePrefs:public.users', {});
  });

  test('resetTablePreferences clears stored prefs and notifies webview', async () => {
    const ctx = makeContext();
    const mockConnMgr = {} as any;
    const editor = new DataEditor(ctx, mockConnMgr);

    const panel = { webview: { postMessage: jest.fn() } } as any;
  ((ctx.globalState.update) as any).mockResolvedValue(undefined);

    await (editor as any).resetTablePreferences(panel, 'public', 'users');

    expect((ctx.globalState.update as jest.Mock)).toHaveBeenCalledWith('tablePrefs:public.users', undefined);
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ command: 'resetTablePreferencesResult', payload: { success: true } });
  });
});
