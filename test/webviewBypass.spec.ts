/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fn } from 'jest-mock';

describe('Validation Bypass Feature', () => {
  let vscode: any;
  let App: any;
  let container: HTMLElement;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    container = document.getElementById('app')!;

    // Mock VS Code API
    vscode = {
      postMessage: fn(),
      getState: fn(() => null),
      setState: fn()
    };

    (global as any).acquireVsCodeApi = () => vscode;

    // Set up initial state with validation errors
    (global as any).window = (global as any).window || {};
    (global as any).window.initialState = {
      schemaName: 'public',
      tableName: 'test_table',
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'value', type: 'integer', nullable: true }
      ],
      primaryKey: { columns: ['id'] },
      rows: [
        { id: 1, value: 'not_a_number' } // Invalid integer value
      ],
      currentPage: 0,
      totalRows: 1,
      paginationSize: 100,
      batchMode: true,
      sort: null,
      filters: {},
      searchTerm: ''
    };

    // Dynamically import the App component
    const AppModule = await import('../webview/src/App.svelte');
    App = AppModule.default;
  });

  it('should block execution when validation errors exist and bypass is disabled', () => {
    const app = new App({
      target: container,
      props: {
        vscode,
        initialState: (global as any).window.initialState
      }
    });

    // Find and click the Execute button
    const executeButton = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Execute'
    );
    expect(executeButton).toBeDefined();
    
    // Button should be disabled due to validation errors
    expect(executeButton?.disabled).toBe(true);

    app.$destroy();
  });

  it('should allow execution when validation errors exist but bypass is enabled', async () => {
    const app = new App({
      target: container,
      props: {
        vscode,
        initialState: (global as any).window.initialState
      }
    });

    // Find and enable the bypass validation checkbox
    const bypassCheckbox = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(
      (input) => {
        const label = input.parentElement;
        return label?.textContent?.includes('Bypass validation');
      }
    ) as HTMLInputElement;

    expect(bypassCheckbox).toBeDefined();
    
    // Enable bypass
    bypassCheckbox.checked = true;
    bypassCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait for Svelte to update
    await new Promise(resolve => setTimeout(resolve, 10));

    // Find the Execute button
    const executeButton = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Execute'
    );
    
    // Button should now be enabled even with validation errors
    expect(executeButton?.disabled).toBe(false);

    app.$destroy();
  });

  it('should include bypassValidation flag in executeChanges and previewSql messages when enabled', async () => {
    const app = new App({
      target: container,
      props: {
        vscode,
        initialState: {
          ...((global as any).window.initialState),
          rows: [{ id: 1, value: 100 }]
        }
      }
    });

    // First, make a change to the data to create a pending change
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (input) {
      input.value = '200';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    // Enable bypass
    const bypassCheckbox = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(
      (input) => {
        const label = input.parentElement;
        return label?.textContent?.includes('Bypass validation');
      }
    ) as HTMLInputElement;

    bypassCheckbox.checked = true;
    bypassCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 10));

    // Click Preview SQL
    const previewButton = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Preview SQL'
    );
    previewButton?.click();

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify postMessage was called with bypassValidation: true for preview
    const calls = (vscode.postMessage as any).mock.calls;
    const previewCall = calls.find((call: any) => call[0]?.command === 'previewSql');
    expect(previewCall).toBeDefined();
    expect(previewCall[0].payload.bypassValidation).toBe(true);

    app.$destroy();
  });
});
