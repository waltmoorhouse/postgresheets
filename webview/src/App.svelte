<script lang="ts">
  import { onMount } from 'svelte';
  import { clsx } from 'clsx';
  import type {
    VSCodeApi,
    ColumnInfo,
    TableStatePayload,
    GridChange,
    PrimaryKeyInfo,
    SortDescriptor,
    FilterMap
  } from '$lib/types';

  export let vscode: VSCodeApi | undefined;
  export let initialState: unknown;

  interface RowState {
    id: number;
    original: Record<string, unknown>;
    current: Record<string, unknown>;
    selected: boolean;
    isNew: boolean;
    deleted: boolean;
  }

  let schemaName = '';
  let tableName = '';
  let columns: ColumnInfo[] = [];
  let primaryKey: string[] = [];
  let rows: RowState[] = [];
  let currentPage = 0;
  let totalRows = 0;
  let paginationSize = 100;
  let batchMode = true;
  let searchTerm = '';
  let sqlPreview = '';
  let executionMessage = '';
  let executionError = '';
  let executing = false;
  let initialized = false;
  let selectAll = false;
  let activeSort: SortDescriptor | null = null;
  let filters: FilterMap = {};
  let columnWidths: Record<string, number> = {};

  const headerRefs: Record<string, HTMLTableCellElement> = {};
  function registerHeader(node: HTMLTableCellElement, columnName: string) {
    let key = columnName;
    if (key) {
      headerRefs[key] = node;
    }
    return {
      update(nextKey?: string) {
        if (key && key !== nextKey) {
          delete headerRefs[key];
        }
        key = nextKey ?? '';
        if (key) {
          headerRefs[key] = node;
        }
      },
      destroy() {
        if (key) {
          delete headerRefs[key];
        }
      }
    };
  }
  type ResizeEvent = PointerEvent | MouseEvent;

  let resizingColumn: string | null = null;
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  let activeResizePointerId: number | null = null;
  let activeResizeHandle: HTMLElement | null = null;

  // JSON modal state
  let jsonEditorOpen = false;
  let jsonEditorRow: RowState | null = null;
  let jsonEditorColumn: ColumnInfo | null = null;
  let jsonDraft = '';
  let jsonError = '';

  // Text modal state
  let textEditorOpen = false;
  let textEditorRow: RowState | null = null;
  let textEditorColumn: ColumnInfo | null = null;
  let textDraft = '';

  function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePrimaryKey(payloadPk: PrimaryKeyInfo | string[] | undefined): string[] {
    if (!payloadPk) {
      return [];
    }
    if (Array.isArray(payloadPk)) {
      return payloadPk;
    }
    return payloadPk.columns ?? [];
  }

  function initialise(payload: TableStatePayload): void {
    schemaName = payload.schemaName;
    tableName = payload.tableName;
    columns = payload.columns ?? [];
    primaryKey = normalizePrimaryKey(payload.primaryKey);
    const rawRows = payload.rows ?? [];
    rows = rawRows.map((row, index) => ({
      id: index + 1,
      original: deepClone(row),
      current: deepClone(row),
      selected: false,
      isNew: false,
      deleted: false
    }));
    currentPage = payload.currentPage ?? 0;
    totalRows = payload.totalRows ?? rawRows.length;
    paginationSize = payload.paginationSize ?? 100;
    batchMode = payload.batchMode ?? true;
    searchTerm = '';
    sqlPreview = '';
    executionMessage = '';
    executionError = '';
    executing = false;
    selectAll = false;
    initialized = true;
    activeSort = payload.sort ?? null;
    filters = { ...(payload.filters ?? {}) };
    searchTerm = payload.searchTerm ?? '';
  columnWidths = {};
    jsonEditorOpen = false;
    jsonEditorRow = null;
    jsonEditorColumn = null;
    jsonDraft = '';
    jsonError = '';
  }

  if (initialState && typeof initialState === 'object') {
    initialise(initialState as TableStatePayload);
  }

  function parseValue(raw: unknown, type: string): unknown {
    if (raw === null || raw === undefined) {
      return null;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.toUpperCase() === 'NULL') {
        return null;
      }
      if ((type === 'json' || type === 'jsonb') && trimmed.length > 0) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed;
        }
      }
      if (type.includes('int') || type === 'bigint' || type === 'smallint') {
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isNaN(parsed) ? trimmed : parsed;
      }
      if (
        type === 'numeric' ||
        type === 'decimal' ||
        type.includes('float') ||
        type === 'real' ||
        type === 'double precision'
      ) {
        const parsed = Number.parseFloat(trimmed);
        return Number.isNaN(parsed) ? trimmed : parsed;
      }
      if (type === 'boolean' || type === 'bool') {
        return trimmed.toLowerCase() === 'true' || trimmed === '1';
      }
      return raw;
    }

    if (type === 'boolean' || type === 'bool') {
      return Boolean(raw);
    }

    return raw;
  }

  function formatCellValue(value: unknown, column: ColumnInfo): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (column.type === 'json' || column.type === 'jsonb') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function isColumnModified(row: RowState, column: ColumnInfo): boolean {
    const original = row.original[column.name];
    const current = row.current[column.name];
    const originalJson = column.type.startsWith('json')
      ? JSON.stringify(original)
      : original;
    const currentJson = column.type.startsWith('json')
      ? JSON.stringify(current)
      : current;
    if (originalJson === currentJson) {
      return false;
    }
    return true;
  }

  function isRowModified(row: RowState): boolean {
    if (row.isNew || row.deleted) {
      return true;
    }
    return columns.some((column) => isColumnModified(row, column));
  }

  function toggleRowSelection(row: RowState, event: Event): void {
    const target = event.target as HTMLInputElement;
    const checked = target.checked;
    rows = rows.map((current) => {
      if (current.id !== row.id) {
        return current;
      }
      return { ...current, selected: checked };
    });
    if (!checked) {
      selectAll = false;
    } else {
      selectAll = rows.every((current) => current.deleted || current.selected);
    }
  }

  function toggleSelectAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    const next = target.checked;
    selectAll = next;
    rows = rows.map((current) => {
      if (current.deleted) {
        return current;
      }
      return { ...current, selected: next };
    });
  }

  function addRow(): void {
    const baseline: Record<string, unknown> = {};
    columns.forEach((column) => {
      baseline[column.name] = null;
    });
    rows = [
      ...rows,
      {
        id: Date.now(),
        original: deepClone(baseline),
        current: deepClone(baseline),
        selected: false,
        isNew: true,
        deleted: false
      }
    ];
  }

  function deleteSelected(): void {
    const updated: RowState[] = [];
    for (const current of rows) {
      if (!current.selected) {
        updated.push(current);
        continue;
      }
      if (current.isNew) {
        continue;
      }
      updated.push({ ...current, selected: false, deleted: true });
    }
    rows = updated;
    if (jsonEditorRow && !updated.some((entry) => entry.id === jsonEditorRow?.id)) {
      closeJsonEditor();
    }
    selectAll = false;
  }

  function restoreRow(row: RowState): void {
    rows = rows.map((current) => {
      if (current.id !== row.id) {
        return current;
      }
      return { ...current, deleted: false, selected: false };
    });
  }

  function updateCell(row: RowState, column: ColumnInfo, rawValue: unknown): void {
    const updatedRows = rows.map((current) => {
      if (current.id !== row.id) {
        return current;
      }
      if (current.deleted) {
        return current;
      }
      let value: unknown;
      if (column.type === 'boolean' || column.type === 'bool') {
        value = Boolean(rawValue);
      } else {
        value = rawValue as string;
      }
      return {
        ...current,
        current: {
          ...current.current,
          [column.name]: value
        }
      };
    });
    rows = updatedRows;
    if (jsonEditorRow && jsonEditorRow.id === row.id) {
      jsonEditorRow = updatedRows.find((current) => current.id === row.id) ?? null;
    }
  }

  function handleBooleanChange(row: RowState, column: ColumnInfo, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    updateCell(row, column, Boolean(target?.checked));
  }

  function handleTextInput(row: RowState, column: ColumnInfo, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    updateCell(row, column, target?.value ?? '');
  }

  function openJsonEditor(row: RowState, column: ColumnInfo): void {
    jsonEditorOpen = true;
    jsonEditorRow = rows.find((current) => current.id === row.id) ?? row;
    jsonEditorColumn = column;
    jsonDraft = formatCellValue(jsonEditorRow.current[column.name], column);
    jsonError = '';
  }

  function closeJsonEditor(): void {
    jsonEditorOpen = false;
    jsonEditorRow = null;
    jsonEditorColumn = null;
    jsonDraft = '';
    jsonError = '';
  }

  function openTextEditor(row: RowState, column: ColumnInfo): void {
    textEditorOpen = true;
    textEditorRow = rows.find((current) => current.id === row.id) ?? row;
    textEditorColumn = column;
    textDraft = formatCellValue(textEditorRow.current[column.name], column);
  }

  function closeTextEditor(): void {
    textEditorOpen = false;
    textEditorRow = null;
    textEditorColumn = null;
    textDraft = '';
  }

  function saveTextDraft(): void {
    if (!textEditorRow || !textEditorColumn) {
      return;
    }
    const { name } = textEditorColumn;
    const updatedRows = rows.map((row) => {
      if (row.id !== textEditorRow?.id) {
        return row;
      }
      return {
        ...row,
        current: {
          ...row.current,
          [name]: textDraft
        }
      };
    });
    rows = updatedRows;
    closeTextEditor();
  }

  function saveJsonDraft(): void {
    if (!jsonEditorRow || !jsonEditorColumn) {
      return;
    }
    const { type, name } = jsonEditorColumn;
    if (jsonDraft.trim().length === 0) {
      const updatedRows = rows.map((row) => {
        if (row.id !== jsonEditorRow?.id) {
          return row;
        }
        return {
          ...row,
          current: {
            ...row.current,
            [name]: null
          }
        };
      });
      rows = updatedRows;
      closeJsonEditor();
      return;
    }
    try {
      const parsedValue = type === 'json' || type === 'jsonb' ? JSON.parse(jsonDraft) : jsonDraft;
      const updatedRows = rows.map((row) => {
        if (row.id !== jsonEditorRow?.id) {
          return row;
        }
        return {
          ...row,
          current: {
            ...row.current,
            [name]: parsedValue
          }
        };
      });
      rows = updatedRows;
      jsonError = '';
      closeJsonEditor();
    } catch (error) {
      jsonError = error instanceof Error ? error.message : 'Invalid JSON value';
    }
  }

  function toggleSort(column: ColumnInfo): void {
    let next: SortDescriptor | null = null;
    if (!activeSort || activeSort.column !== column.name) {
      next = { column: column.name, direction: 'asc' };
    } else if (activeSort.direction === 'asc') {
      next = { column: column.name, direction: 'desc' };
    } else {
      next = null;
    }
    activeSort = next;
    ensureVscode().postMessage({
      command: 'applySort',
      payload: { sort: next }
    });
  }

  function sortIndicator(column: ColumnInfo): string {
    if (!activeSort || activeSort.column !== column.name) {
      return '';
    }
    return activeSort.direction === 'asc' ? '▲' : '▼';
  }

  function updateFilter(column: ColumnInfo, value: string): void {
    filters = { ...filters, [column.name]: value };
  }

  function commitFilters(): void {
    ensureVscode().postMessage({
      command: 'applyFilters',
      payload: { filters: { ...filters } }
    });
  }

  function clearFilters(): void {
    filters = {};
    commitFilters();
  }

  function startResize(column: ColumnInfo, event: ResizeEvent): void {
    if (resizingColumn) {
      return;
    }

    if ('button' in event && typeof event.button === 'number' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const header = target.closest('th') as HTMLTableCellElement;
    if (!header) {
      console.error('Could not find header element for resize');
      return;
    }

    resizingColumn = column.name;
    resizeStartX = event.clientX;
    resizeStartWidth = header.getBoundingClientRect().width;

    // Set initial width if not set
    if (!columnWidths[column.name]) {
      columnWidths = { ...columnWidths, [column.name]: resizeStartWidth };
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    attachResizeListeners(event, target);
  }

  function attachResizeListeners(event: ResizeEvent, handle: HTMLElement): void {
    if ('pointerId' in event) {
      activeResizePointerId = event.pointerId;
      activeResizeHandle = handle;
      if (typeof handle.setPointerCapture === 'function') {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // Ignore pointer capture failures; resize still works without it.
        }
      }
      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
    } else {
      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', stopResize);
    }
  }

  function handleFilterInput(column: ColumnInfo, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    updateFilter(column, target?.value ?? '');
  }

  function columnStyle(column: ColumnInfo): string {
    const width = columnWidths[column.name];
    return width ? `width: ${width}px; min-width: ${width}px;` : '';
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!resizingColumn) {
      return;
    }
    event.preventDefault();
    const delta = event.clientX - resizeStartX;
    const newWidth = Math.max(60, resizeStartWidth + delta);
    columnWidths = { ...columnWidths, [resizingColumn]: newWidth };
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!resizingColumn) {
      return;
    }
    event.preventDefault();
    const delta = event.clientX - resizeStartX;
    const newWidth = Math.max(60, resizeStartWidth + delta);
    columnWidths = { ...columnWidths, [resizingColumn]: newWidth };
  }

  function stopResize(event?: Event): void {
    if (activeResizeHandle && activeResizePointerId !== null) {
      if (typeof activeResizeHandle.releasePointerCapture === 'function') {
        try {
          activeResizeHandle.releasePointerCapture(activeResizePointerId);
        } catch {
          // Ignore pointer capture release failures.
        }
      }
    }
    activeResizeHandle = null;
    activeResizePointerId = null;

    if (resizingColumn) {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizingColumn = null;
    }

  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResize);
    if (event instanceof MouseEvent && event.type === 'mouseup') {
      event.preventDefault();
    }
  }

  function gatherChanges(): GridChange[] {
    const changes: GridChange[] = [];
    rows.forEach((row) => {
      if (row.isNew && !row.deleted) {
        const data: Record<string, unknown> = {};
        columns.forEach((column) => {
          const current = row.current[column.name];
          data[column.name] = parseValue(current, column.type);
        });
        changes.push({ type: 'insert', data });
        return;
      }
      if (row.deleted && !row.isNew) {
        const where: Record<string, unknown> = {};
        primaryKey.forEach((columnName) => {
          where[columnName] = row.original[columnName];
        });
        if (Object.keys(where).length > 0) {
          changes.push({ type: 'delete', where });
        }
        return;
      }
      if (row.deleted && row.isNew) {
        return;
      }
      const data: Record<string, unknown> = {};
      columns.forEach((column) => {
        if (isColumnModified(row, column)) {
          const current = row.current[column.name];
          data[column.name] = parseValue(current, column.type);
        }
      });
      if (Object.keys(data).length > 0) {
        const where: Record<string, unknown> = {};
        primaryKey.forEach((columnName) => {
          where[columnName] = row.original[columnName];
        });
        changes.push({ type: 'update', data, where });
      }
    });
    return changes;
  }

  function ensureVscode(): VSCodeApi {
    if (!vscode) {
      throw new Error('VS Code API unavailable.');
    }
    return vscode;
  }

  function requestRefresh(): void {
    ensureVscode().postMessage({
      command: 'refresh'
    });
  }

  function requestPreview(): void {
    const changes = gatherChanges();
    ensureVscode().postMessage({
      command: 'previewSql',
      payload: {
        changes,
        primaryKey
      }
    });
  }

  function requestExecution(): void {
    const changes = gatherChanges();
    if (changes.length === 0) {
      executionMessage = 'No pending changes to execute.';
      executionError = '';
      return;
    }
    executionMessage = '';
    executionError = '';
    executing = true;
    ensureVscode().postMessage({
      command: 'executeChanges',
      payload: {
        changes,
        batchMode
      }
    });
  }

  function requestPage(page: number): void {
    ensureVscode().postMessage({
      command: 'loadPage',
      payload: {
        page
      }
    });
  }

  function executeSearch(): void {
    ensureVscode().postMessage({
      command: 'search',
      payload: {
        searchTerm: searchTerm.trim()
      }
    });
  }

  function refreshFromMessage(payload: TableStatePayload): void {
    initialise(payload);
  }

  function handleMessage(event: MessageEvent): void {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    switch (message.command) {
      case 'loadData':
        refreshFromMessage(message.payload as TableStatePayload);
        break;
      case 'sqlPreview':
        sqlPreview = String(message.payload ?? '');
        break;
      case 'executionComplete':
        executing = false;
        if (message.success) {
          executionMessage = 'Changes executed successfully';
          executionError = '';
        } else {
          executionError = message.error ? String(message.error) : 'Execution failed';
          executionMessage = '';
        }
        break;
      case 'showMessage':
        executionMessage = message.text ? String(message.text) : '';
        break;
      default:
        break;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResize);
    };
  });
</script>

<svelte:head>
  <style>
    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-foreground);
    }
  </style>
</svelte:head>

{#if !initialized}
  <div class="loading">Loading table data…</div>
{:else}
  <div class="container">
    <header class="header">
      <div>
        <h2>{schemaName}.<span class="table-name">{tableName}</span></h2>
        <p class="subheader">{totalRows} rows · page {currentPage + 1}</p>
      </div>
      <div class="actions">
        <label class="batch-toggle">
          <input type="checkbox" bind:checked={batchMode}>
          <span>Batch mode</span>
        </label>
        <button class="primary" on:click={addRow}>Add row</button>
        <button on:click={deleteSelected} disabled={!rows.some((row) => row.selected)}>Delete selected</button>
        <button on:click={requestRefresh}>Refresh</button>
        <button on:click={requestPreview}>Preview SQL</button>
        <button class="accent" on:click={requestExecution} disabled={executing}>Execute</button>
        <button class="link" on:click={clearFilters} disabled={Object.values(filters).every((value) => !value)}>
          Clear filters
        </button>
      </div>
    </header>

    <section class="toolbar">
      <div class="search">
        <input
          type="search"
          placeholder="Search this table…"
          bind:value={searchTerm}
          on:keydown={(event) => event.key === 'Enter' && executeSearch()}
        >
        <button on:click={executeSearch}>Search</button>
      </div>
      <div class="pagination">
        <button on:click={() => requestPage(Math.max(currentPage - 1, 0))} disabled={currentPage === 0}>
          Previous
        </button>
        <span>Page {currentPage + 1} · Rows {totalRows}</span>
        <button
          on:click={() => requestPage(currentPage + 1)}
          disabled={(currentPage + 1) * paginationSize >= totalRows}
        >
          Next
        </button>
      </div>
    </section>

    <section class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="select-cell">
              <input type="checkbox" checked={selectAll} on:change={toggleSelectAll}>
            </th>
            {#each columns as column}
              <th
                class="column-header-cell"
                use:registerHeader={column.name}
                style={columnStyle(column)}
              >
                <div class="column-header">
                  <button class="header-button" on:click={() => toggleSort(column)}>
                    <span>{column.name}</span>
                    {#if primaryKey.includes(column.name)}
                      <span class="pk" title="Primary key">🔑</span>
                    {/if}
                    {#if sortIndicator(column)}
                      <span class="sort-indicator">{sortIndicator(column)}</span>
                    {/if}
                  </button>
                </div>
                <span
                  class="resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-hidden="true"
                  on:pointerdown={(event) => startResize(column, event)}
                  on:mousedown={(event) => startResize(column, event)}
                ></span>
                <small>{column.type}</small>
              </th>
            {/each}
            <th class="row-actions" aria-label="Row actions"></th>
          </tr>
          <tr class="filters">
            <th></th>
            {#each columns as column}
              <th style={columnStyle(column)}>
                <input
                  type="text"
                  placeholder="Filter"
                  value={filters[column.name] ?? ''}
                  on:input={(event) => handleFilterInput(column, event)}
                  on:change={commitFilters}
                  on:keydown={(event) => event.key === 'Enter' && commitFilters()}
                >
              </th>
            {/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr class={clsx({ deleted: row.deleted, modified: isRowModified(row) })}>
              <td class="select-cell">
                <input
                  type="checkbox"
                  checked={row.selected}
                  disabled={row.deleted}
                  on:change={(event) => toggleRowSelection(row, event)}
                >
              </td>
              {#each columns as column}
                {#if column.type === 'boolean' || column.type === 'bool'}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <input
                      type="checkbox"
                      checked={Boolean(row.current[column.name])}
                      disabled={row.deleted}
                      on:change={(event) => handleBooleanChange(row, column, event)}
                    >
                  </td>
                {:else if column.type === 'json' || column.type === 'jsonb'}
                  <td class={clsx('cell json', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <button class="json-button" disabled={row.deleted} on:click={() => openJsonEditor(row, column)}>
                      {#if row.current[column.name] === null}
                        <span class="null">NULL</span>
                      {:else}
                        {#if formatCellValue(row.current[column.name], column).length > 80}
                          {formatCellValue(row.current[column.name], column).slice(0, 80)}…
                        {:else}
                          {formatCellValue(row.current[column.name], column)}
                        {/if}
                      {/if}
                    </button>
                  </td>
                {:else}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <div style="display: flex; gap: 4px; align-items: center;">
                      <input
                        type="text"
                        value={formatCellValue(row.current[column.name], column)}
                        disabled={row.deleted}
                        on:input={(event) => handleTextInput(row, column, event)}
                        style="flex: 1; min-width: 0;"
                      >
                      <button
                        class="text-expand-button"
                        disabled={row.deleted}
                        on:click={() => openTextEditor(row, column)}
                        title="Expand text editor"
                      >
                        📝
                      </button>
                    </div>
                  </td>
                {/if}
              {/each}
              <td class="row-actions">
                {#if row.deleted}
                  <button on:click={() => restoreRow(row)}>Restore</button>
                {/if}
              </td>
            </tr>
          {/each}
          {#if rows.length === 0}
            <tr>
              <td class="empty" colspan={columns.length + 2}>No rows in this page.</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </section>

    <section class="feedback">
      {#if sqlPreview}
        <details open>
          <summary>SQL preview</summary>
          <pre>{sqlPreview}</pre>
        </details>
      {/if}

      {#if executionMessage}
        <div class="message success">{executionMessage}</div>
      {/if}

      {#if executionError}
        <div class="message error">{executionError}</div>
      {/if}
    </section>
  </div>

  {#if jsonEditorOpen && jsonEditorRow && jsonEditorColumn}
    <div class="modal">
      <div class="modal-content">
        <header>
          <h3>Edit {jsonEditorColumn.name} (JSON)</h3>
        </header>
        <textarea
          bind:value={jsonDraft}
          spellcheck={false}
          class={jsonError ? 'invalid' : ''}
        ></textarea>
        {#if jsonError}
          <p class="error">{jsonError}</p>
        {/if}
        <footer>
          <button on:click={closeJsonEditor}>Cancel</button>
          <button class="accent" on:click={saveJsonDraft}>Save</button>
        </footer>
      </div>
    </div>
  {/if}

  {#if textEditorOpen && textEditorRow && textEditorColumn}
    <div class="modal">
      <div class="modal-content">
        <header>
          <h3>Edit {textEditorColumn.name} (Text)</h3>
        </header>
        <textarea
          bind:value={textDraft}
          spellcheck={false}
        ></textarea>
        <footer>
          <button on:click={closeTextEditor}>Cancel</button>
          <button class="accent" on:click={saveTextDraft}>Save</button>
        </footer>
      </div>
    </div>
  {/if}
{/if}

<style>
  .loading {
    padding: 2rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }

  .container {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .header .table-name {
    color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
  }

  .subheader {
    margin: 4px 0 0;
    color: var(--vscode-descriptionForeground);
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-foreground, #ffffff);
    cursor: pointer;
    transition: background 120ms ease;
  }

  button.link {
    background: transparent;
    color: var(--vscode-textLink-foreground, #3794ff);
    padding: 0 6px;
  }

  button.link:hover:enabled {
    background: transparent;
    text-decoration: underline;
  }

  button:not(.link):hover:enabled {
    background: var(--vscode-button-hoverBackground, #45494e);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  button.primary {
    background: var(--vscode-button-background, #0e639c);
  }

  button.accent {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .search {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  input[type='search'],
  input[type='text'] {
    border-radius: 4px;
    border: 1px solid var(--vscode-input-border, #3d3d3d);
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #f5f5f5);
    padding: 6px 10px;
    min-width: 140px;
  }

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--vscode-descriptionForeground);
  }

  .table-wrapper {
    border: 1px solid var(--vscode-panel-border, #3d3d3d);
    border-radius: 6px;
    overflow-x: auto;
    overflow-y: auto;
    max-width: 100%;
  }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  thead {
    background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th,
  td {
    border-bottom: 1px solid var(--vscode-panel-border, #3d3d3d);
    padding: 8px 10px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    font-weight: 600;
    color: var(--vscode-titleBar-activeForeground, #f5f5f5);
    background: var(--vscode-editor-background, #1e1e1e);
  }

  tbody tr:hover {
    background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.04));
  }

  .select-cell {
    width: 36px;
    text-align: center;
  }

  .cell input[type='text'] {
    width: 100%;
    box-sizing: border-box;
  }

  .cell.modified {
    background: rgba(83, 161, 249, 0.15);
  }

  tr.modified td.select-cell {
    border-left: 4px solid var(--vscode-charts-blue, #3794ff);
  }

  tr.deleted {
    opacity: 0.6;
    text-decoration: line-through;
  }

  .row-actions {
    width: 90px;
    text-align: right;
    white-space: nowrap;
  }

  .empty {
    text-align: center;
    padding: 24px;
    color: var(--vscode-descriptionForeground);
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .column-header-cell {
    position: relative;
    padding-right: 12px;
  }

  .header-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    color: inherit;
    padding: 2px 0;
    border: none;
    cursor: pointer;
    font: inherit;
  }

  .header-button:hover {
    text-decoration: underline;
  }

  .pk {
    font-size: 1rem;
    filter: grayscale(20%);
  }

  .sort-indicator {
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .json-button {
    width: 100%;
    justify-content: flex-start;
    background: transparent;
    border: 1px solid var(--vscode-input-border, #3d3d3d);
    color: inherit;
    text-align: left;
    padding: 6px 10px;
  }

  .text-expand-button {
    flex-shrink: 0;
    padding: 4px 8px;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    border: 1px solid var(--vscode-input-border, #3d3d3d);
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    line-height: 1;
  }

  .text-expand-button:hover:enabled {
    background: var(--vscode-button-hoverBackground, #45494e);
  }

  .text-expand-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .json {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .json .null {
    opacity: 0.6;
    font-style: italic;
  }

  .message {
    padding: 10px 12px;
    border-radius: 4px;
    margin-top: 10px;
  }

  .message.success {
    background: rgba(64, 200, 130, 0.15);
    border: 1px solid rgba(64, 200, 130, 0.3);
  }

  .message.error {
    background: rgba(232, 70, 80, 0.2);
    border: 1px solid rgba(232, 70, 80, 0.35);
  }

  .filters th {
    background: var(--vscode-editor-background, #1e1e1e);
    border-bottom: 1px solid var(--vscode-panel-border, #3d3d3d);
  }

  .filters input {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--vscode-input-border, #3d3d3d);
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #f5f5f5);
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    touch-action: none;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: transparent;
    transform: translateX(-50%);
    transition: background 0.15s ease;
  }

  .resize-handle:hover::before {
    background: var(--vscode-list-highlightForeground, rgba(100, 150, 255, 0.6));
  }

  .resize-handle:active::before {
    background: var(--vscode-list-activeSelectionForeground, rgba(100, 150, 255, 0.9));
  }

  details {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 4px;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  pre {
    margin: 6px 0 0;
    padding: 10px;
    background: var(--vscode-terminal-background, #1e1e1e);
    border-radius: 4px;
    overflow: auto;
  }

  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
  }

  .modal-content {
    width: min(720px, 90vw);
    background: var(--vscode-editor-background, #1e1e1e);
    border-radius: 6px;
    border: 1px solid var(--vscode-panel-border, #3d3d3d);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .modal-content header h3 {
    margin: 0;
    font-size: 1.2rem;
  }

  textarea {
    min-height: 280px;
    font-family: var(--vscode-editor-font-family, monospace);
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #f5f5f5);
    border: 1px solid var(--vscode-input-border, #3d3d3d);
    border-radius: 4px;
    padding: 12px;
    resize: vertical;
  }

  textarea.invalid {
    border-color: rgba(232, 70, 80, 0.7);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .batch-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
  }

  .feedback {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
