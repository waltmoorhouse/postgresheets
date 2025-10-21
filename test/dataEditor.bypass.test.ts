/**
 * Server-side tests for validation bypass feature
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Client } from 'pg';

describe('DataEditor Validation Bypass', () => {
  let mockClient: Partial<Client>;
  let queryMock: any;

  beforeEach(() => {
    queryMock = jest.fn();
    mockClient = {
      query: queryMock
    };
  });

  it('should skip validation when bypassValidation is true', async () => {
    // Mock validator to track if it was called
    let validatorCalled = false;
    const mockValidator = {
      validateChangesAgainstSchema: jest.fn(async () => {
        validatorCalled = true;
        return ['Some validation error'];
      })
    };

    // Mock the import of sqlValidator
    jest.unstable_mockModule('../src/sqlValidator', () => mockValidator);

    // Import DataEditor after mocking
    const { DataEditor } = await import('../src/dataEditor');
    const { ConnectionManager } = await import('../src/connectionManager');

    // Create mock extension context
    const mockContext: any = {
      subscriptions: [],
      extensionUri: { fsPath: '/fake/path' },
      globalState: {
        get: jest.fn(() => ({})),
        update: jest.fn()
      },
      secrets: {
        get: jest.fn(),
        store: jest.fn()
      }
    };

    const connectionManager = new ConnectionManager(mockContext);
    
    // Mock getClient to return our mock client
    jest.spyOn(connectionManager, 'getClient').mockResolvedValue(mockClient as Client);
    jest.spyOn(connectionManager, 'markBusy').mockImplementation(() => {});
    jest.spyOn(connectionManager, 'markIdle').mockImplementation(() => {});

    const dataEditor = new DataEditor(mockContext, connectionManager);

    // Create a mock webview panel
    const mockPanel: any = {
      webview: {
        postMessage: jest.fn(),
        asWebviewUri: jest.fn((uri: any) => uri),
        html: '',
        cspSource: 'mock'
      },
      reveal: jest.fn(),
      onDidDispose: jest.fn(() => ({ dispose: jest.fn() }))
    };

    // Set up query mock to return successful results
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    // Call executeChanges with bypassValidation = true
    const changes = [
      {
        type: 'insert' as const,
        data: { id: 1, value: 'invalid_integer' }
      }
    ];

    // Use reflection to access private method
    const executeChanges = (dataEditor as any).executeChanges.bind(dataEditor);
    await executeChanges(
      mockPanel,
      'test-connection',
      'public',
      'test_table',
      changes,
      true,
      true // bypassValidation = true
    );

    // Validator should NOT have been called when bypass is enabled
    expect(validatorCalled).toBe(false);
    expect(mockValidator.validateChangesAgainstSchema).not.toHaveBeenCalled();
  });

  it('should call validation when bypassValidation is false', async () => {
    // Mock validator to track if it was called
    let validatorCalled = false;
    const mockValidator = {
      validateChangesAgainstSchema: jest.fn(async () => {
        validatorCalled = true;
        return []; // No errors
      })
    };

    // Mock the import of sqlValidator
    jest.unstable_mockModule('../src/sqlValidator', () => mockValidator);

    // Import DataEditor after mocking
    const { DataEditor } = await import('../src/dataEditor');
    const { ConnectionManager } = await import('../src/connectionManager');

    const mockContext: any = {
      subscriptions: [],
      extensionUri: { fsPath: '/fake/path' },
      globalState: {
        get: jest.fn(() => ({})),
        update: jest.fn()
      },
      secrets: {
        get: jest.fn(),
        store: jest.fn()
      }
    };

    const connectionManager = new ConnectionManager(mockContext);
    
    jest.spyOn(connectionManager, 'getClient').mockResolvedValue(mockClient as Client);
    jest.spyOn(connectionManager, 'markBusy').mockImplementation(() => {});
    jest.spyOn(connectionManager, 'markIdle').mockImplementation(() => {});

    const dataEditor = new DataEditor(mockContext, connectionManager);

    const mockPanel: any = {
      webview: {
        postMessage: jest.fn(),
        asWebviewUri: jest.fn((uri: any) => uri),
        html: '',
        cspSource: 'mock'
      },
      reveal: jest.fn(),
      onDidDispose: jest.fn(() => ({ dispose: jest.fn() }))
    };

    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    const changes = [
      {
        type: 'insert' as const,
        data: { id: 1, value: 100 }
      }
    ];

    // Call executeChanges with bypassValidation = false (default)
    const executeChanges = (dataEditor as any).executeChanges.bind(dataEditor);
    await executeChanges(
      mockPanel,
      'test-connection',
      'public',
      'test_table',
      changes,
      true,
      false // bypassValidation = false
    );

    // Validator SHOULD have been called when bypass is disabled
    expect(validatorCalled).toBe(true);
    expect(mockValidator.validateChangesAgainstSchema).toHaveBeenCalled();
  });
});
