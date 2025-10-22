<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { ColumnInfo, RowData, VSCodeApi } from './lib/types';

  const dispatch = createEventDispatcher();

  interface ForeignKeySelection {
    fkRows: RowData[];
    pkColumn: string;
    selectedValue: unknown | null;
  }

  export let column: ColumnInfo | null = null;
  export let schemaName: string = '';
  export let tableName: string = '';
  export let isOpen = false;
  export let vscode: VSCodeApi | undefined = undefined;

  let fkData: ForeignKeySelection | null = null;
  let loading = false;
  let error = '';
  let searchTerm = '';
  let selectedRowValue: unknown | null = null;

  function handleMessage(event: MessageEvent): void {
    const message = event.data;

    if (message.command === 'foreignKeyRows') {
      fkData = {
        fkRows: message.rows || [],
        pkColumn: message.pkColumn || 'id',
        selectedValue: null
      };
      loading = false;
    } else if (message.command === 'webviewError') {
      error = message.error?.message || 'An error occurred';
      loading = false;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  async function openFKSelector(): Promise<void> {
    if (!column || !column.foreignKey) {
      error = 'Column is not a foreign key';
      return;
    }

    if (!vscode) {
      error = 'VS Code API not available';
      return;
    }

    loading = true;
    error = '';
    fkData = null;
    searchTerm = '';
    selectedRowValue = null;

    // Request the FK rows from the extension
    vscode.postMessage({
      command: 'loadForeignKeyRows',
      schemaName,
      tableName,
      columnName: column.name
    });
  }

  function closeFKSelector(): void {
    dispatch('close');
    fkData = null;
    error = '';
    loading = false;
    searchTerm = '';
    selectedRowValue = null;
  }

  function selectRow(rowValue: unknown): void {
    selectedRowValue = rowValue;
  }

  function confirmSelection(): void {
    if (selectedRowValue !== null) {
      // Dispatch custom event to parent with the selected value
      dispatch('fkSelected', { value: selectedRowValue });
      fkData = null;
      error = '';
      loading = false;
      searchTerm = '';
      selectedRowValue = null;
    }
  }

  function getDisplayValue(row: RowData, column: string): string {
    const value = row[column];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function getFilteredRows(): RowData[] {
    if (!fkData || !searchTerm) return fkData?.fkRows || [];

    const term = searchTerm.toLowerCase();
    return (fkData?.fkRows || []).filter(row => {
      // Search across all visible columns
      return Object.values(row).some(val => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }

  function getVisibleColumns(): string[] {
    if (!fkData || !fkData.fkRows || fkData.fkRows.length === 0) return [];
    
    // Get first few columns, limit to 5 for readability
    const firstRow = fkData.fkRows[0];
    return Object.keys(firstRow).slice(0, 5);
  }

  $: {
    if (isOpen && !fkData && !loading) {
      openFKSelector();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="modal-backdrop"
    role="presentation"
    on:click={closeFKSelector}
    on:keydown={(e) => e.key === 'Escape' && closeFKSelector()}
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="modal dialog fk-selector-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fk-selector-heading"
      on:click|stopPropagation
    >
      <div class="modal-header">
        <h2 id="fk-selector-heading">
          Select {column?.foreignKey?.referencedTable || 'value'}
        </h2>
        <button
          type="button"
          class="close-button"
          aria-label="Close FK selector"
          on:click={closeFKSelector}
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        {#if error}
          <div class="error-message" role="alert">
            {error}
          </div>
        {:else if loading}
          <div class="loading-indicator">
            <div class="spinner"></div>
            Loading...
          </div>
        {:else if fkData && fkData.fkRows.length > 0}
          <div class="search-container">
            <input
              type="text"
              class="search-input"
              placeholder="Search rows..."
              bind:value={searchTerm}
              aria-label="Search foreign key rows"
            />
          </div>

          <div class="fk-table-container">
            {#if getFilteredRows().length > 0}
              <table class="fk-selector-table">
                <thead>
                  <tr>
                    {#each getVisibleColumns() as col (col)}
                      <th>{col}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each getFilteredRows() as row (row[fkData.pkColumn])}
                    {@const rowPkValue = row[fkData.pkColumn]}
                    {@const isSelected = selectedRowValue === rowPkValue}
                    <tr
                      class:selected={isSelected}
                      on:click={() => selectRow(rowPkValue)}
                      role="button"
                      tabindex="0"
                      on:keydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          selectRow(rowPkValue);
                        }
                      }}
                    >
                      {#each getVisibleColumns() as col (col)}
                        <td>
                          {getDisplayValue(row, col)}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <div class="no-results">
                No rows match your search.
              </div>
            {/if}
          </div>
        {:else}
          <div class="no-rows">
            No rows available in the referenced table.
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="ps-btn ps-btn-secondary"
          on:click={closeFKSelector}
        >
          Cancel
        </button>
        <button
          type="button"
          class="ps-btn ps-btn-primary"
          disabled={selectedRowValue === null}
          on:click={confirmSelection}
        >
          Select
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .fk-selector-modal {
    display: flex;
    flex-direction: column;
    max-width: 700px;
    max-height: 80vh;
    width: 90%;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    padding: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-button:hover {
    background-color: var(--vscode-button-hoverBackground);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .search-container {
    margin-bottom: 16px;
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--vscode-input-border);
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 4px;
    font-size: 13px;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
  }

  .fk-table-container {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    max-height: 400px;
    overflow-y: auto;
  }

  .fk-selector-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .fk-selector-table thead {
    background-color: var(--vscode-list-hoverBackground);
    position: sticky;
    top: 0;
  }

  .fk-selector-table th {
    padding: 8px 12px;
    text-align: left;
    font-weight: 500;
    border-bottom: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
  }

  .fk-selector-table tbody tr {
    border-bottom: 1px solid var(--vscode-panel-border);
    cursor: pointer;
    transition: background-color 160ms ease;
  }

  .fk-selector-table tbody tr:hover {
    background-color: var(--vscode-list-hoverBackground);
  }

  .fk-selector-table tbody tr.selected {
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .fk-selector-table td {
    padding: 8px 12px;
    word-break: break-all;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-message {
    padding: 12px;
    background-color: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    border-radius: 4px;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px;
    color: var(--vscode-foreground);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--vscode-panel-border);
    border-top-color: var(--vscode-foreground);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .no-results,
  .no-rows {
    padding: 32px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }

  .modal-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 16px;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .ps-btn {
    padding: 6px 16px;
    border-radius: 4px;
    border: none;
    font-size: 13px;
    cursor: pointer;
    transition: all 160ms ease;
  }

  .ps-btn-primary {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .ps-btn-primary:hover:not(:disabled) {
    background-color: var(--vscode-button-hoverBackground);
  }

  .ps-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ps-btn-secondary {
    background-color: transparent;
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-button-border);
  }

  .ps-btn-secondary:hover {
    background-color: var(--vscode-button-hoverBackground);
  }
</style>
