import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../webview/src/App.svelte';

test('bigint cell input removes letters when typing', async () => {
  const initialState = {
    schemaName: 'public',
    tableName: 't',
    columns: [{ name: 'num', type: 'bigint', nullable: false }],
    primaryKey: [],
    rows: [{ num: null }],
    currentPage: 0,
    totalRows: 1,
    paginationSize: 100,
    batchMode: true,
    sort: null,
    filters: {},
    searchTerm: ''
  };
  const vscode = { postMessage: () => undefined, getState: () => undefined, setState: () => undefined } as any;
  const { container } = render(App, { initialState, vscode });

  const input = container.querySelector('input.cell-input') as HTMLInputElement;
  expect(input).toBeTruthy();

  await fireEvent.input(input, { target: { value: 'a1b2' } });
  await tick();
  expect(input.value).toBe('12');
});
