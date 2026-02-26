jest.mock('vscode');

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { SqlEditor } from '../src/sqlEditor';

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

describe('SqlEditor fetchColumnsForTable', () => {
  let ctx: any;
  let mockConnMgr: any;
  let mockClient: any;
  let sqlEditor: SqlEditor;

  beforeEach(() => {
    ctx = makeContext();

    mockClient = {
      query: jest.fn(async (sql: string, values?: any[]) => {
        if (/information_schema.columns/.test(sql)) {
          return { rows: [ { column_name: 'id', data_type: 'integer' }, { column_name: 'name', data_type: 'text' } ] } as any;
        }
        return { rows: [] } as any;
      })
    };

    mockConnMgr = {
      getClient: jest.fn(async (id: string) => mockClient),
      connect: jest.fn(async (id: string) => mockClient),
      getConnections: jest.fn(async () => [{ id: 'c1', name: 'test', database: 'db' }])
    };

    const mockSqlTerminalProvider = { executeSqlSilent: jest.fn() } as any;
    const mockQueryHistory = {} as any;

    sqlEditor = new SqlEditor(ctx, mockConnMgr as any, mockSqlTerminalProvider as any, mockQueryHistory as any);
  });

  it('returns columns for a table with given schema', async () => {
    const cols = await sqlEditor.fetchColumnsForTable('c1', 'public', 'users');
    expect(cols).toBeTruthy();
    expect(cols.length).toBe(2);
    expect(cols[0].column_name).toBe('id');
  });

  it('returns columns for a table without schema', async () => {
    const cols = await sqlEditor.fetchColumnsForTable('c1', undefined, 'users');
    expect(cols.length).toBe(2);
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('WHERE table_name = $1'), ['users']);
  });
});
