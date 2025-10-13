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

  interface DraftState {
    current: Record<string, unknown>;
    deleted: boolean;
  }

  interface DraftSnapshot {
    updates: Record<string, DraftState>;
    inserts: RowState[];
  }

  interface PersistedState {
    columnWidths?: Record<string, number>;
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
  let sqlPreviewOpen = false;
  let previewLoading = false;
  let executionMessage = '';
  let executionError = '';
  let executing = false;
  let initialized = false;
  let selectAll = false;
  let activeSort: SortDescriptor | null = null;
  let filters: FilterMap = {};
  let columnWidths: Record<string, number> = {};
  let resetDraftState = false;
  let discardDraftForNextLoad = false;

  const persistedState: PersistedState | undefined =
    vscode && typeof vscode.getState === 'function'
      ? (vscode.getState() as PersistedState | undefined)
      : undefined;
  if (persistedState?.columnWidths) {
    columnWidths = { ...persistedState.columnWidths };
  }

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

  function cloneRowState(row: RowState): RowState {
    return {
      id: row.id,
      original: deepClone(row.original),
      current: deepClone(row.current),
      selected: row.selected,
      isNew: row.isNew,
      deleted: row.deleted
    };
  }

  function buildRowKey(source: Record<string, unknown>): string {
    if (!primaryKey.length) {
      return JSON.stringify(source);
    }
    return primaryKey
      .map((column) => `${column}:${JSON.stringify(source[column])}`)
      .join('|');
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

  function initialise(payload: TableStatePayload, snapshot?: DraftSnapshot): void {
    const previousColumnWidths = { ...columnWidths };
    const updateSnapshot = snapshot?.updates ?? {};

    schemaName = payload.schemaName;
    tableName = payload.tableName;
    columns = payload.columns ?? [];
    primaryKey = normalizePrimaryKey(payload.primaryKey);
    const rawRows = payload.rows ?? [];
    rows = rawRows.map((row, index) => {
      const original = deepClone(row);
      const key = buildRowKey(original);
      const draft = updateSnapshot[key];
      return {
        id: index + 1,
        original,
        current: draft ? deepClone(draft.current) : deepClone(row),
        selected: false,
        isNew: false,
        deleted: draft?.deleted ?? false
      };
    });
    if (snapshot?.inserts?.length) {
      rows = [
        ...rows,
        ...snapshot.inserts.map((row) => cloneRowState(row))
      ];
    }
    currentPage = payload.currentPage ?? 0;
    totalRows = payload.totalRows ?? rawRows.length;
    paginationSize = payload.paginationSize ?? 100;
    batchMode = payload.batchMode ?? true;
    searchTerm = '';
    sqlPreview = '';
    sqlPreviewOpen = false;
    previewLoading = false;
    executionMessage = '';
    executionError = '';
    executing = false;
  selectAll = rows.length > 0 && rows.every((row) => row.deleted || row.selected);
    initialized = true;
    activeSort = payload.sort ?? null;
    filters = { ...(payload.filters ?? {}) };
    searchTerm = payload.searchTerm ?? '';
    const sanitizedColumnWidths: Record<string, number> = {};
    columns.forEach((column) => {
      const width = previousColumnWidths[column.name];
      if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        sanitizedColumnWidths[column.name] = width;
      }
    });
    columnWidths = sanitizedColumnWidths;
    persistColumnWidths();
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

  function createDraftSnapshot(): DraftSnapshot {
    if (resetDraftState) {
      resetDraftState = false;
      return { updates: {}, inserts: [] };
    }

    const updates: Record<string, DraftState> = {};
    const inserts: RowState[] = [];

    rows.forEach((row) => {
      if (row.isNew) {
        if (!row.deleted) {
          inserts.push(cloneRowState(row));
        }
        return;
      }

      if (!row.deleted && !isRowModified(row)) {
        return;
      }

      const key = buildRowKey(row.original);
      updates[key] = {
        current: deepClone(row.current),
        deleted: row.deleted
      };
    });

    return { updates, inserts };
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

  function persistColumnWidths(): void {
    if (!vscode || typeof vscode.setState !== 'function') {
      return;
    }
    let previous: PersistedState = {};
    if (typeof vscode.getState === 'function') {
      previous = (vscode.getState() as PersistedState | undefined) ?? {};
    }
    vscode.setState({
      ...previous,
      columnWidths
    });
  }

  function setColumnWidth(columnName: string, width: number): void {
    columnWidths = { ...columnWidths, [columnName]: width };
    const header = headerRefs[columnName];
    if (header) {
      header.style.width = `${width}px`;
      header.style.minWidth = `${width}px`;
      header.style.maxWidth = `${width}px`;
    }
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
      setColumnWidth(column.name, resizeStartWidth);
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
    return width ? `width: ${width}px; min-width: ${width}px; max-width: ${width}px;` : '';
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!resizingColumn) {
      return;
    }
    event.preventDefault();
    const delta = event.clientX - resizeStartX;
    const newWidth = Math.max(60, resizeStartWidth + delta);
    setColumnWidth(resizingColumn, newWidth);
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!resizingColumn) {
      return;
    }
    event.preventDefault();
    const delta = event.clientX - resizeStartX;
    const newWidth = Math.max(60, resizeStartWidth + delta);
    setColumnWidth(resizingColumn, newWidth);
  }

  function stopResize(event?: Event): void {
    const hadActiveColumn = Boolean(resizingColumn);
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

    if (hadActiveColumn) {
      persistColumnWidths();
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
    discardDraftForNextLoad = true;
    ensureVscode().postMessage({
      command: 'refresh'
    });
  }

  function requestPreview(): void {
    const changes = gatherChanges();
    previewLoading = true;
    sqlPreviewOpen = true;
    sqlPreview = '';
    ensureVscode().postMessage({
      command: 'previewSql',
      payload: {
        changes,
        primaryKey
      }
    });
  }

  function closeSqlPreview(): void {
    sqlPreviewOpen = false;
    previewLoading = false;
  }

  function executeFromPreview(): void {
    closeSqlPreview();
    requestExecution();
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
    const snapshot = discardDraftForNextLoad ? undefined : createDraftSnapshot();
    initialise(payload, snapshot);
    discardDraftForNextLoad = false;
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
        previewLoading = false;
        sqlPreviewOpen = true;
        break;
      case 'executionComplete':
        executing = false;
        if (message.success) {
          resetDraftState = true;
          executionMessage = 'Changes executed successfully';
          executionError = '';
        } else {
          executionError = message.error ? String(message.error) : 'Execution failed';
          executionMessage = '';
        }
        previewLoading = false;
        sqlPreviewOpen = false;
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
      <div class="header-title">
        <h2>
          <span class="schema-name">{schemaName}</span>
          <span class="delimiter" aria-hidden="true">.</span>
          <span class="table-name">{tableName}</span>
        </h2>
        <p class="subheader">
          <span>{totalRows} rows</span>
          <span class="separator" aria-hidden="true">•</span>
          <span>Page {currentPage + 1}</span>
          {#if activeSort}
            <span class="separator" aria-hidden="true">•</span>
            <span class="badge" title={`Sorted by ${activeSort.column} ${activeSort.direction}`}>
              Sort · {activeSort.column} {activeSort.direction}
            </span>
          {/if}
          {#if Object.values(filters).some((value) => value)}
            <span class="separator" aria-hidden="true">•</span>
            <span class="badge" title="Active filters applied">Filters active</span>
          {/if}
        </p>
      </div>
      <div class="actions" role="toolbar" aria-label="Table actions">
        <label class="batch-toggle">
          <input type="checkbox" bind:checked={batchMode}>
          <span>Batch mode</span>
        </label>
        <button type="button" class="ps-btn ps-btn--primary" on:click={addRow}>Add row</button>
        <button
          type="button"
          class="ps-btn ps-btn--ghost"
          on:click={deleteSelected}
          disabled={!rows.some((row) => row.selected)}
        >
          Delete selected
        </button>
        <button type="button" class="ps-btn" on:click={requestRefresh}>Refresh</button>
        <button type="button" class="ps-btn ps-btn--ghost" on:click={requestPreview}>Preview SQL</button>
        <button
          type="button"
          class="ps-btn ps-btn--accent"
          on:click={requestExecution}
          disabled={executing}
        >
          Execute
        </button>
        <button
          type="button"
          class="ps-btn ps-btn--link"
          on:click={clearFilters}
          disabled={Object.values(filters).every((value) => !value)}
        >
          Clear filters
        </button>
      </div>
    </header>

    <section class="toolbar">
      <div class="toolbar-group toolbar-search">
        <input
          type="search"
          placeholder="Search this table…"
          bind:value={searchTerm}
          on:keydown={(event) => event.key === 'Enter' && executeSearch()}
        >
        <button type="button" class="ps-btn ps-btn--ghost" on:click={executeSearch}>Search</button>
      </div>
      <div class="toolbar-group pagination" role="navigation" aria-label="Pagination">
        <button
          type="button"
          class="ps-btn ps-btn--ghost"
          on:click={() => requestPage(Math.max(currentPage - 1, 0))}
          disabled={currentPage === 0}
        >
          Previous
        </button>
        <span>Page {currentPage + 1} · Rows {totalRows}</span>
        <button
          type="button"
          class="ps-btn ps-btn--ghost"
          on:click={() => requestPage(currentPage + 1)}
          disabled={(currentPage + 1) * paginationSize >= totalRows}
        >
          Next
        </button>
      </div>
    </section>

    <section class="table-wrapper">
      <table>
        <colgroup>
          <col class="select-column">
          {#each columns as column}
            <col style={columnStyle(column)}>
          {/each}
          <col class="row-actions-column">
        </colgroup>
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
                  <button type="button" class="header-button" on:click={() => toggleSort(column)}>
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
                    <button
                      type="button"
                      class="ps-btn ps-btn--ghost json-button"
                      disabled={row.deleted}
                      on:click={() => openJsonEditor(row, column)}
                    >
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
                    <div class="cell-edit">
                      <input
                        type="text"
                        value={formatCellValue(row.current[column.name], column)}
                        disabled={row.deleted}
                        on:input={(event) => handleTextInput(row, column, event)}
                        class="cell-input"
                      >
                      <button
                        type="button"
                        class="ps-btn ps-btn--icon text-expand-button"
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
                  <button type="button" class="ps-btn ps-btn--ghost" on:click={() => restoreRow(row)}>
                    Restore
                  </button>
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
      {#if executionMessage}
        <div class="message success">{executionMessage}</div>
      {/if}

      {#if executionError}
        <div class="message error">{executionError}</div>
      {/if}
    </section>
  </div>

  {#if sqlPreviewOpen}
    <div class="modal">
      <div class="modal-content preview-modal">
        <header>
          <h3>SQL Preview</h3>
        </header>
        {#if previewLoading}
          <p class="preview-status">Generating SQL preview…</p>
        {:else if sqlPreview}
          <pre>{sqlPreview}</pre>
        {:else}
          <p class="preview-status">No SQL changes to display.</p>
        {/if}
        <footer>
          <button type="button" class="ps-btn" on:click={closeSqlPreview}>Cancel</button>
          <button
            type="button"
            class="ps-btn ps-btn--accent"
            on:click={executeFromPreview}
            disabled={executing || previewLoading}
          >
            Execute
          </button>
        </footer>
      </div>
    </div>
  {/if}

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
          <button type="button" class="ps-btn" on:click={closeJsonEditor}>Cancel</button>
          <button type="button" class="ps-btn ps-btn--accent" on:click={saveJsonDraft}>Save</button>
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
          <button type="button" class="ps-btn" on:click={closeTextEditor}>Cancel</button>
          <button type="button" class="ps-btn ps-btn--accent" on:click={saveTextDraft}>Save</button>
        </footer>
      </div>
    </div>
  {/if}
{/if}

<style>
  .loading {
    padding: calc(var(--ps-spacing-xl) * 1.25);
    text-align: center;
    color: var(--ps-text-secondary);
  }

  .container {
    padding: var(--ps-spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-lg);
    background: var(--ps-surface);
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ps-spacing-lg);
    padding: var(--ps-spacing-md) var(--ps-spacing-lg);
    background: var(--ps-surface-subtle);
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-lg);
    flex-wrap: wrap;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
  }

  .header-title {
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-xs);
    min-width: 220px;
  }

  .header-title h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--ps-text-primary);
    display: flex;
    align-items: baseline;
    gap: var(--ps-spacing-xs);
  }

  .schema-name {
    opacity: 0.9;
  }

  .delimiter {
    opacity: 0.6;
  }

  .table-name {
    color: var(--ps-accent-foreground);
    background: var(--ps-accent-muted);
    padding: 0 var(--ps-spacing-xs);
    border-radius: var(--ps-radius-sm);
  }

  .subheader {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ps-spacing-xs);
    color: var(--ps-text-secondary);
    font-size: 0.9rem;
  }

  .separator {
    color: var(--ps-text-tertiary);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--ps-spacing-sm);
    height: 22px;
    border-radius: 999px;
    background: var(--ps-accent-muted);
    color: var(--ps-accent-foreground);
    font-weight: 500;
    font-size: 0.75rem;
    letter-spacing: 0.01em;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--ps-spacing-sm);
    flex-wrap: wrap;
  }

  .batch-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--ps-spacing-xs);
    padding: var(--ps-spacing-xs) var(--ps-spacing-sm);
    border-radius: var(--ps-radius-sm);
    background: var(--ps-surface-muted);
    color: var(--ps-text-secondary);
    border: 1px solid transparent;
    transition: border-color 160ms ease;
  }

  .batch-toggle:focus-within {
    border-color: var(--ps-focus-ring);
  }

  .batch-toggle input {
    width: 16px;
    height: 16px;
  }

  .ps-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ps-spacing-2xs);
    border-radius: var(--ps-radius-sm);
    border: 1px solid transparent;
    background: var(--ps-surface-subtle);
    color: var(--ps-text-primary);
    padding: calc(var(--ps-spacing-xs) + 2px) var(--ps-spacing-md);
    cursor: pointer;
    transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease,
      transform 160ms ease;
    min-height: 30px;
    text-decoration: none;
  }

  .ps-btn:hover:enabled {
    background: color-mix(in srgb, var(--ps-accent) 20%, var(--ps-surface-subtle));
  }

  .ps-btn:focus-visible {
    outline: 2px solid var(--ps-focus-ring);
    outline-offset: 1px;
  }

  .ps-btn:active:enabled {
    transform: translateY(1px);
  }

  .ps-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ps-btn--primary,
  .ps-btn--accent {
    background: var(--ps-accent);
    color: var(--ps-accent-foreground);
    border-color: var(--ps-accent-border);
  }

  .ps-btn--accent:hover:enabled,
  .ps-btn--primary:hover:enabled {
    background: var(--ps-accent-hover);
  }

  .ps-btn--ghost {
    background: transparent;
    border-color: var(--ps-border);
    color: var(--ps-text-primary);
  }

  .ps-btn--ghost:hover:enabled {
    background: var(--ps-surface-muted);
  }

  .ps-btn--link {
    background: transparent;
    color: var(--vscode-textLink-foreground, #3794ff);
    padding: var(--ps-spacing-xs) var(--ps-spacing-xs);
  }

  .ps-btn--link:hover:enabled {
    text-decoration: underline;
  }

  .ps-btn--icon {
    width: 28px;
    height: 28px;
    padding: var(--ps-spacing-2xs);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ps-spacing-md);
    flex-wrap: wrap;
    background: var(--ps-surface-subtle);
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-lg);
    padding: var(--ps-spacing-sm) var(--ps-spacing-lg);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--ps-spacing-sm);
    flex-wrap: wrap;
  }

  .toolbar-search input[type='search'] {
    min-width: 220px;
  }

  input[type='search'],
  input[type='text'] {
    border-radius: var(--ps-radius-sm);
    border: 1px solid var(--ps-border);
    background: var(--ps-surface-elevated);
    color: var(--ps-text-primary);
    padding: var(--ps-spacing-xs) var(--ps-spacing-md);
    min-width: 140px;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }

  input[type='search']:focus,
  input[type='text']:focus {
    border-color: var(--ps-focus-ring);
    box-shadow: 0 0 0 1px var(--ps-focus-ring);
    outline: none;
  }

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--ps-accent);
  }

  input[type='checkbox']:focus-visible {
    outline: 2px solid var(--ps-focus-ring);
    outline-offset: 1px;
  }

  .pagination {
    color: var(--ps-text-secondary);
  }

  .table-wrapper {
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-lg);
    overflow: auto;
    max-width: 100%;
    background: var(--ps-surface-subtle);
    box-shadow: var(--ps-shadow-soft);
    position: relative;
  }

  table {
    width: auto;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 13px;
    table-layout: fixed;
  }

  col.select-column {
    width: 36px;
  }

  col.row-actions-column {
    width: 96px;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }

  th,
  td {
    border-bottom: 1px solid var(--ps-border);
    padding: var(--ps-spacing-sm) var(--ps-spacing-md);
    text-align: left;
    vertical-align: middle;
  }

  td {
    overflow: hidden;
    background: var(--ps-surface-subtle);
    transition: background-color 160ms ease;
  }

  th {
    font-weight: 600;
    color: var(--ps-text-primary);
    background: var(--ps-surface-elevated);
    box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.04);
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: var(--ps-spacing-xs);
    position: relative;
  }

  .column-header-cell {
    position: relative;
    padding-right: var(--ps-spacing-lg);
  }

  .column-header-cell small {
    display: block;
    margin-top: var(--ps-spacing-2xs);
    color: var(--ps-text-tertiary);
    font-weight: 400;
    font-size: 0.75rem;
  }

  .header-button {
    display: inline-flex;
    align-items: center;
    gap: var(--ps-spacing-2xs);
    background: transparent;
    color: inherit;
    padding: 0;
    border: none;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .header-button:hover,
  .header-button:focus-visible {
    text-decoration: underline;
  }

  .pk {
    font-size: 1rem;
    opacity: 0.8;
  }

  .sort-indicator {
    font-size: 0.75rem;
    opacity: 0.85;
  }

  .filters th {
    background: var(--ps-surface-elevated);
  }

  .filters input {
    width: 100%;
    box-sizing: border-box;
  }

  tbody tr {
    transition: background-color 160ms ease, border-color 160ms ease;
  }

  tbody tr:hover {
    background: var(--ps-selection);
  }

  tbody tr:hover td {
    background: var(--ps-selection);
  }

  tbody tr:hover td.cell.modified {
    background: color-mix(in srgb, var(--ps-accent) 32%, var(--ps-selection));
  }

  tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--ps-surface-subtle) 85%, transparent);
  }

  .select-cell {
    width: 36px;
    text-align: center;
  }

  .cell.modified {
    background: color-mix(in srgb, var(--ps-accent) 24%, transparent);
  }

  tr.modified td.select-cell {
    border-left: 4px solid var(--ps-focus-ring);
  }

  tr.deleted {
    opacity: 0.6;
    text-decoration: line-through;
  }

  .cell-edit {
    display: flex;
    align-items: center;
    gap: var(--ps-spacing-2xs);
  }

  .cell-input {
    flex: 1;
    min-width: 0;
  }

  .ps-btn--icon.text-expand-button {
    border-color: var(--ps-border);
  }

  .ps-btn--icon.text-expand-button:hover:enabled {
    border-color: var(--ps-focus-ring);
  }

  .json {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .json-button {
    width: 100%;
    justify-content: flex-start;
    text-align: left;
    border-color: var(--ps-border);
  }

  .json-button:hover:enabled {
    border-color: var(--ps-focus-ring);
  }

  .json .null {
    opacity: 0.6;
    font-style: italic;
  }

  .row-actions {
    width: 96px;
    text-align: right;
    white-space: nowrap;
  }

  .empty {
    text-align: center;
    padding: var(--ps-spacing-xl);
    color: var(--ps-text-secondary);
  }

  .feedback {
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-sm);
  }

  .message {
    padding: var(--ps-spacing-sm) var(--ps-spacing-md);
    border-radius: var(--ps-radius-md);
    border: 1px solid transparent;
    background: var(--ps-surface-subtle);
    color: var(--ps-text-primary);
  }

  .message.success {
    background: var(--ps-success-bg);
    border-color: var(--ps-success-border);
  }

  .message.error {
    background: var(--ps-danger-bg);
    border-color: var(--ps-danger-border);
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 3;
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
    transition: background-color 160ms ease;
  }

  .resize-handle:hover::before {
    background: var(--ps-focus-ring);
  }

  .resize-handle:active::before {
    background: var(--ps-accent);
  }

  pre {
    margin: 0;
    padding: var(--ps-spacing-md);
    background: var(--vscode-terminal-background, #1e1e1e);
    border-radius: var(--ps-radius-md);
    border: 1px solid var(--ps-border);
    max-height: 360px;
    overflow: auto;
  }

  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(6px);
    animation: fade-in 160ms ease forwards;
  }

  .modal-content {
    width: min(720px, 90vw);
    background: var(--ps-surface-elevated);
    border-radius: var(--ps-radius-lg);
    border: 1px solid var(--ps-border-strong);
    padding: var(--ps-spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-md);
    box-shadow: var(--ps-shadow-soft);
    animation: scale-in 160ms ease forwards;
  }

  .modal-content header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--ps-text-primary);
  }

  textarea {
    min-height: 280px;
    font-family: var(--vscode-editor-font-family, monospace);
    background: var(--ps-surface-subtle);
    color: var(--ps-text-primary);
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-md);
    padding: var(--ps-spacing-md);
    resize: vertical;
  }

  textarea:focus {
    border-color: var(--ps-focus-ring);
    outline: none;
    box-shadow: 0 0 0 1px var(--ps-focus-ring);
  }

  textarea.invalid {
    border-color: var(--ps-danger-border);
  }

  .modal-content.preview-modal {
    width: min(900px, 95vw);
  }

  .preview-status {
    margin: 0;
    color: var(--ps-text-secondary);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--ps-spacing-sm);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes scale-in {
    from {
      transform: translateY(6px) scale(0.97);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (max-width: 900px) {
    .header,
    .toolbar {
      padding: var(--ps-spacing-md);
    }

    .actions {
      width: 100%;
      justify-content: flex-start;
    }

    .header-title h2 {
      font-size: 1.3rem;
    }
  }

  @media (forced-colors: active) {
    .header,
    .toolbar,
    .table-wrapper,
    .modal-content {
      border: 1px solid CanvasText;
      box-shadow: none;
    }

    .ps-btn,
    .json-button {
      forced-color-adjust: none;
      border-color: CanvasText;
      background: Canvas;
      color: CanvasText;
    }

    .badge {
      border: 1px solid CanvasText;
      background: Canvas;
      color: CanvasText;
    }
  }
</style>
