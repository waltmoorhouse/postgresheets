import { render, fireEvent } from '@testing-library/svelte';
import { fn } from 'jest-mock';
import App from '../webview/src/App.svelte';

test('Refresh sends refresh message and reloads data when loadData arrives', async () => {
  const postMessage = fn();
  const vscode = { postMessage, getState: () => undefined, setState: () => undefined } as any;
  const initState = {
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
  };
  const { getByText, findByText } = render(App, { initialState: initState, vscode });

  // Click refresh and confirm the postMessage
  await fireEvent.click(getByText('Refresh'));
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'refresh' }));

  // Simulate a loadData message with new rows
  const newPayload = { ...initState, rows: [{ id: 2 }], totalRows: 2 };
  window.dispatchEvent(new MessageEvent('message', { data: { command: 'loadData', payload: newPayload } }));

  // The UI should reflect the updated totalRows text
  expect(await findByText(/Rows 2/)).toBeTruthy();
});
