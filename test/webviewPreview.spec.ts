import { render, fireEvent } from '@testing-library/svelte';
import { fn } from 'jest-mock';
import App from '../webview/src/App.svelte';

const makeInitialState = () => ({
  schemaName: 'public',
  tableName: 't',
  columns: [{ name: 'id', type: 'bigint', nullable: false }],
  primaryKey: [],
  rows: [{ id: 1 }],
  currentPage: 0,
  totalRows: 1,
  paginationSize: 100,
  batchMode: true,
  sort: null,
  filters: {},
  searchTerm: ''
});

test('Preview SQL shows generated SQL when extension responds', async () => {
  const postMessage = fn();
  const vscode = { postMessage, getState: () => undefined, setState: () => undefined } as any;
  const { getByText, findByText } = render(App, { initialState: makeInitialState(), vscode });

  // Click preview and ensure request was sent
  await fireEvent.click(getByText('Preview SQL'));
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'previewSql' }));

  // Simulate extension success response
  window.dispatchEvent(new MessageEvent('message', { data: { command: 'sqlPreview', payload: 'SELECT 1', error: false } }));

  // The modal should now show the SQL
  expect(await findByText(/SELECT 1/)).toBeTruthy();

  // Simulate extension error response and ensure error banner is displayed
  window.dispatchEvent(new MessageEvent('message', { data: { command: 'sqlPreview', payload: '/* Failed to generate SQL: test error */', error: true } }));
  expect(await findByText(/Error generating SQL/)).toBeTruthy();
});
