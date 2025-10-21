import { render, fireEvent } from '@testing-library/svelte';
import { fn } from 'jest-mock';
import { tick } from 'svelte';
import App from '../webview/src/App.svelte';

test('numeric input (bigint) strips letters and leaves digits only', async () => {
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

  const { container } = render(App, { initialState: initState, vscode });
  const input = container.querySelector('input.cell-input') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  if (!input) return;

  // Simulate typing letters with digits — sanitization should remove letters
  await fireEvent.input(input, { target: { value: '12a3' } });
  await tick();
  expect(input.value).toBe('123');

  // Floats: letters and multiple dots are normalized
  const floatState = { ...initState, columns: [{ name: 'f', type: 'numeric', nullable: true }], rows: [{ f: 0 }] };
  const { container: c2 } = render(App, { initialState: floatState, vscode });
  const floatInput = c2.querySelector('input.cell-input') as HTMLInputElement | null;
  expect(floatInput).not.toBeNull();
  if (!floatInput) return;
  await fireEvent.input(floatInput, { target: { value: '1.2.3abc' } });
  await tick();
  expect(floatInput.value).toBe('1.23');
});
