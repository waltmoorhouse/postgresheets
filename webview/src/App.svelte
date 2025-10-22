<script lang="ts">
  import { onMount } from 'svelte';
  import ColumnManager from './ColumnManager.svelte';
  import HiddenColumnsModal from './HiddenColumnsModal.svelte';
  import FKSelectorModal from './FKSelectorModal.svelte';
  import DateTimeModal from './DateTimeModal.svelte';
  import FocusTrap from '$lib/components/FocusTrap.svelte';
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
  import { isIntegerType, isFloatType, sanitizeIntegerInput, sanitizeFloatInput } from '$lib/inputUtils';

  export let vscode: VSCodeApi | undefined;
  export let initialState: unknown;

  interface RowState {
    id: number;
    original: Record<string, unknown>;
    current: Record<string, unknown>;
    selected: boolean;
    isNew: boolean;
    deleted: boolean;
    // Map of column name -> validation error message (null when valid)
    validation?: Record<string, string | null>;
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
  let searchTerm = '';
  let sqlPreview = '';
  let sqlPreviewOpen = false;
  let sqlPreviewIsError = false;
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
  let bypassValidation = false;

  $: hasValidationErrors = rows.some(r => {
    if (!r || !r.validation) return false;
    return Object.values(r.validation).some(v => v !== null && v !== undefined);
  });

  // Column preferences / manager
  let hiddenColumnsSet: Set<string> = new Set();
  let visibleColumns: ColumnInfo[] = [];
  let columnManagerOpen = false;
  let masterColumnsMap: Map<string, ColumnInfo> = new Map();
  // Drag-and-drop state for reordering in the column manager is handled by
  // the ColumnManager component; App.svelte only coordinates opening and
  // persisting preferences.

  // Hidden columns modal
  let hiddenModalOpen = false;

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
  let resizingColumnKeyboard: string | null = null;
  let ariaLiveMessage = '';
  let selectionRangeStart: number | null = null;

  // JSON modal state
  let jsonEditorOpen = false;
  let jsonEditorRow: RowState | null = null;
  let jsonEditorColumn: ColumnInfo | null = null;
  let jsonDraft = '';
  let jsonError = '';
  let jsonTextarea: HTMLTextAreaElement | null = null;

  // Text modal state
  let textEditorOpen = false;
  let textEditorRow: RowState | null = null;
  let textEditorColumn: ColumnInfo | null = null;
  let textDraft = '';
  let textTextarea: HTMLTextAreaElement | null = null;

  // Foreign key selector modal state
  let fkSelectorOpen = false;
  let fkSelectorRow: RowState | null = null;
  let fkSelectorColumn: ColumnInfo | null = null;
  let currentConnectionId = '';

  // DateTime modal state
  let dateTimeModalOpen = false;
  let dateTimeRow: RowState | null = null;
  let dateTimeColumn: ColumnInfo | null = null;
  let dateTimeValue: string = '';

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
      deleted: row.deleted,
      validation: { ...(row.validation ?? {}) }
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
  // maintain a master map of column metadata so reorders can reconstruct ColumnInfo
  masterColumnsMap = new Map(columns.map((c) => [c.name, c]));
    primaryKey = normalizePrimaryKey(payload.primaryKey);
    const rawRows = payload.rows ?? [];
    rows = rawRows.map((row, index) => {
      const original = deepClone(row);
      const key = buildRowKey(original);
      const draft = updateSnapshot[key];
      const current = draft ? deepClone(draft.current) : deepClone(row);
      // Compute initial validation for each column so any invalid values
      // received from the server are surfaced client-side immediately.
      const validation: Record<string, string | null> = {};
      for (const col of columns) {
        validation[col.name] = validateCellValue(current[col.name], col);
      }
      return {
        id: index + 1,
        original,
        current,
        selected: false,
        isNew: false,
        deleted: draft?.deleted ?? false,
        validation
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
    // Apply persisted table preferences (if any)
    const prefs = (payload as TableStatePayload).tablePreferences ?? {};
    if (prefs.columnOrder && Array.isArray(prefs.columnOrder) && prefs.columnOrder.length > 0) {
      // Reorder columns according to stored order while keeping unknown columns appended
      const order = prefs.columnOrder;
      const byName = new Map(columns.map((c) => [c.name, c]));
      const ordered: ColumnInfo[] = [];
      for (const name of order) {
        const col = byName.get(name);
        if (col) {
          ordered.push(col);
          byName.delete(name);
        }
      }
      // append any remaining columns not present in stored order
      for (const col of columns) {
        if (byName.has(col.name)) {
          ordered.push(col);
        }
      }
      columns = ordered;
    }
    if (prefs.hiddenColumns && Array.isArray(prefs.hiddenColumns)) {
      hiddenColumnsSet = new Set(prefs.hiddenColumns);
    } else {
      hiddenColumnsSet = new Set();
    }
  // Build visibleColumns
  visibleColumns = columns.filter((c) => !hiddenColumnsSet.has(c.name));
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

  function errorId(rowId: number, columnName: string): string {
    // Produce a DOM-safe id by replacing non-alphanum chars
    const safe = String(columnName).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `cell-error-${rowId}-${safe}`;
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
    // Array types: prefer JSON string representation for clarity
    if (String(column.type).endsWith('[]')) {
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
      selectionRangeStart = null;
    } else {
      selectAll = rows.every((current) => current.deleted || current.selected);
      selectionRangeStart = row.id;
      ariaLiveMessage = `Row ${row.id} selected`;
    }
  }

  function handleRowCheckboxClick(row: RowState, event: MouseEvent): void {
    if (event.shiftKey && selectionRangeStart !== null) {
      // Range selection with Shift+Click
      event.preventDefault();
      const startIdx = rows.findIndex(r => r.id === selectionRangeStart);
      const endIdx = rows.findIndex(r => r.id === row.id);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const [min, max] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const selectedCount = max - min + 1;
        
        rows = rows.map((r, idx) => {
          if (idx >= min && idx <= max && !r.deleted) {
            return { ...r, selected: true };
          }
          return r;
        });
        
        selectAll = rows.every((current) => current.deleted || current.selected);
        ariaLiveMessage = `Selected ${selectedCount} rows from row ${Math.min(selectionRangeStart, row.id)} to row ${Math.max(selectionRangeStart, row.id)}`;
      }
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

  function generateUUID(): string {
    // Generate a random UUID v4
    // https://developer.mozilla.org/en-US/docs/Web/API/crypto/getRandomValues
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    // Set version to 4 (random)
    array[6] = (array[6] & 0x0f) | 0x40;
    // Set variant to RFC 4122
    array[8] = (array[8] & 0x3f) | 0x80;
    const hex = Array.from(array).map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function addRow(): void {
    const baseline: Record<string, unknown> = {};
    columns.forEach((column) => {
      baseline[column.name] = null;
    });
    rows = [
      {
        id: Date.now(),
        original: deepClone(baseline),
        current: deepClone(baseline),
        selected: false,
        isNew: true,
        deleted: false
        ,validation: {}
      },
      ...rows
    ];
  }

  function addRowWithUUID(): void {
    const baseline: Record<string, unknown> = {};
    columns.forEach((column) => {
      // Fill UUID primary key columns with generated UUIDs
      if (primaryKey.includes(column.name) && column.type.toLowerCase() === 'uuid') {
        baseline[column.name] = generateUUID();
      } else {
        baseline[column.name] = null;
      }
    });
    rows = [
      {
        id: Date.now(),
        original: deepClone(baseline),
        current: deepClone(baseline),
        selected: false,
        isNew: true,
        deleted: false
        ,validation: {}
      },
      ...rows
    ];
  }

  function validateCellValue(value: unknown, column: ColumnInfo): string | null {
    if (value === null || value === undefined) return null;
    // Allow empty strings as null-ish values
    if (typeof value === 'string' && value.trim().length === 0) return null;
    const baseType = String(column.type).replace(/\[\]$/, '').toLowerCase();
    
    // UUID validation
    if (baseType === 'uuid') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof value === 'string' && !uuidRegex.test(value)) {
        return 'Invalid UUID format (expected: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)';
      }
      return null;
    }
    
    // JSON/JSONB validation
    if (baseType === 'json' || baseType === 'jsonb') {
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
          return null;
        } catch {
          return 'Invalid JSON';
        }
      }
      return null;
    }
    
    // Integers
    if (baseType.includes('int') || baseType === 'bigint' || baseType === 'smallint' || baseType === 'integer') {
      const s = String(value).trim();
      if (!/^-?\d+$/.test(s)) return 'Must be an integer';
      return null;
    }
    // Floating / numeric types
    if (
      baseType === 'numeric' ||
      baseType === 'decimal' ||
      baseType.includes('float') ||
      baseType === 'real' ||
      baseType === 'double precision'
    ) {
      const s = String(value).trim();
      if (!/^-?\d+(?:\.\d+)?$/.test(s)) return 'Must be a number';
      return null;
    }
    return null;
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
      const validationError = validateCellValue(value, column);
      return {
        ...current,
        current: {
          ...current.current,
          [column.name]: value
        },
        validation: {
          ...(current.validation ?? {}),
          [column.name]: validationError
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
    let value = target?.value ?? '';
    if (isIntegerType(column.type)) {
      const sanitized = sanitizeIntegerInput(value);
      if (target) target.value = sanitized;
      updateCell(row, column, sanitized === '' ? null : sanitized);
      return;
    }
    if (isFloatType(column.type)) {
      const sanitized = sanitizeFloatInput(value);
      if (target) target.value = sanitized;
      updateCell(row, column, sanitized === '' ? null : sanitized);
      return;
    }
    updateCell(row, column, value);
  }

  function handleEnumSelectChange(row: RowState, column: ColumnInfo, event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const value = target ? target.value : '';
    updateCell(row, column, value === '' ? null : value);
  }

  function openJsonEditor(row: RowState, column: ColumnInfo): void {
    jsonEditorOpen = true;
    jsonEditorRow = rows.find((current) => current.id === row.id) ?? row;
    jsonEditorColumn = column;
    jsonDraft = formatCellValue(jsonEditorRow.current[column.name], column);
    jsonError = '';
    // Focus the textarea on the next tick (after DOM update)
    setTimeout(() => {
      if (jsonTextarea) {
        jsonTextarea.focus();
        jsonTextarea.select();
      }
    }, 0);
  }

  function closeJsonEditor(): void {
    jsonEditorOpen = false;
    jsonEditorRow = null;
    jsonEditorColumn = null;
    jsonDraft = '';
    jsonError = '';
    jsonTextarea = null;
  }

  function openTextEditor(row: RowState, column: ColumnInfo): void {
    textEditorOpen = true;
    textEditorRow = rows.find((current) => current.id === row.id) ?? row;
    textEditorColumn = column;
    textDraft = formatCellValue(textEditorRow.current[column.name], column);
    // Focus the textarea on the next tick (after DOM update)
    setTimeout(() => {
      if (textTextarea) {
        textTextarea.focus();
        textTextarea.select();
      }
    }, 0);
  }

  function closeTextEditor(): void {
    textEditorOpen = false;
    textEditorRow = null;
    textEditorColumn = null;
    textDraft = '';
    textTextarea = null;
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

  function editorLabel(column: ColumnInfo | null): string {
    if (!column) return '';
    if (column.type === 'json') return 'JSON';
    if (column.type === 'jsonb') return 'JSONB';
    if (String(column.type).endsWith('[]')) return 'Array';
    return 'JSON';
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
      const shouldParse = type === 'json' || type === 'jsonb' || String(type).endsWith('[]');
      const parsedValue = shouldParse ? JSON.parse(jsonDraft) : jsonDraft;
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

  function openFKSelector(row: RowState, column: ColumnInfo): void {
    if (!column.foreignKey) {
      return;
    }
    fkSelectorOpen = true;
    fkSelectorRow = rows.find((current) => current.id === row.id) ?? row;
    fkSelectorColumn = column;
  }

  function closeFKSelector(): void {
    fkSelectorOpen = false;
    fkSelectorRow = null;
    fkSelectorColumn = null;
  }

  function handleFKSelected(event: CustomEvent<{ value: unknown }>): void {
    if (!fkSelectorRow || !fkSelectorColumn) {
      return;
    }
    const { name } = fkSelectorColumn;
    const { value } = event.detail;
    const updatedRows = rows.map((row) => {
      if (row.id !== fkSelectorRow?.id) {
        return row;
      }
      return {
        ...row,
        current: {
          ...row.current,
          [name]: value
        }
      };
    });
    rows = updatedRows;
    closeFKSelector();
  }

  function openDateTimeModal(row: RowState, column: ColumnInfo): void {
    const isTimestampType = column.type && /timestamp|date|time/i.test(column.type);
    if (!isTimestampType) {
      return;
    }
    dateTimeModalOpen = true;
    dateTimeRow = rows.find((current) => current.id === row.id) ?? row;
    dateTimeColumn = column;
    dateTimeValue = String(row.current[column.name] ?? '');
  }

  function closeDateTimeModal(): void {
    dateTimeModalOpen = false;
    dateTimeRow = null;
    dateTimeColumn = null;
    dateTimeValue = '';
  }

  function handleDateTimeSaved(value: string): void {
    if (!dateTimeRow || !dateTimeColumn) {
      return;
    }
    const { name } = dateTimeColumn;
    const updatedRows = rows.map((row) => {
      if (row.id !== dateTimeRow?.id) {
        return row;
      }
      return {
        ...row,
        current: {
          ...row.current,
          [name]: value || null
        }
      };
    });
    rows = updatedRows;
    closeDateTimeModal();
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
      sort: next
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
      filters: { ...filters }
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
    // Update the state reactively
    columnWidths = { ...columnWidths, [columnName]: width };
    
    // Also update DOM directly for immediate visual feedback
    const header = headerRefs[columnName];
    if (header) {
      header.style.width = `${width}px`;
      header.style.minWidth = `${width}px`;
      header.style.maxWidth = `${width}px`;
    }
    
    // Update all cells in this column
    const table = document.querySelector('.data-table');
    if (table) {
      const colIndex = visibleColumns.findIndex(col => col.name === columnName);
      if (colIndex >= 0) {
        // Update header cells (including filter row)
        const headerCells = table.querySelectorAll(`thead th:nth-child(${colIndex + 2})`);
        headerCells.forEach((cell: Element) => {
          if (cell instanceof HTMLElement) {
            cell.style.width = `${width}px`;
            cell.style.minWidth = `${width}px`;
            cell.style.maxWidth = `${width}px`;
          }
        });
        
        // Update body cells
        const bodyCells = table.querySelectorAll(`tbody td:nth-child(${colIndex + 2})`);
        bodyCells.forEach((cell: Element) => {
          if (cell instanceof HTMLElement) {
            cell.style.width = `${width}px`;
            cell.style.minWidth = `${width}px`;
            cell.style.maxWidth = `${width}px`;
          }
        });
      }
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

  function handleResizeKeydown(column: ColumnInfo, event: KeyboardEvent): void {
    // Arrow keys for accessibility: Up/Right = increase width, Down/Left = decrease width
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      const currentWidth = columnWidths[column.name] || 100;
      const newWidth = Math.max(60, currentWidth - 10);
      setColumnWidth(column.name, newWidth);
      resizingColumnKeyboard = column.name;
      ariaLiveMessage = `${column.name} column width decreased to ${newWidth} pixels`;
      // Persist immediately for better user feedback
      setTimeout(() => persistColumnWidths(), 100);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      const currentWidth = columnWidths[column.name] || 100;
      const newWidth = currentWidth + 10;
      setColumnWidth(column.name, newWidth);
      resizingColumnKeyboard = column.name;
      ariaLiveMessage = `${column.name} column width increased to ${newWidth} pixels`;
      // Persist immediately for better user feedback
      setTimeout(() => persistColumnWidths(), 100);
    } else if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      resizingColumnKeyboard = null;
      persistColumnWidths();
    }
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
    // Client-side validation: block preview when validation errors exist (unless bypassed).
    const errors = rows.flatMap((r) =>
      Object.entries(r.validation ?? {})
        .filter(([, v]) => v)
        .map(([k, v]) => ({ rowId: r.id, column: k, error: v }))
    );
    if (errors.length > 0 && !bypassValidation) {
      executionError = 'Fix validation errors before generating SQL preview.';
      sqlPreviewOpen = true;
      sqlPreview = '';
      previewLoading = false;
      sqlPreviewIsError = true;
      return;
    }

  previewLoading = true;
  sqlPreviewOpen = true;
  sqlPreview = '';
  sqlPreviewIsError = false;
    ensureVscode().postMessage({
      command: 'previewChanges',
      changes
    });
  }

  function closeSqlPreview(): void {
    sqlPreviewOpen = false;
    previewLoading = false;
  }

  function copyToSqlTerminal(): void {
    // Send message to extension to open SQL terminal and paste the SQL
    ensureVscode().postMessage({
      command: 'copyToSqlTerminal',
      sql: sqlPreview
    });
    // Close the preview modal
    closeSqlPreview();
  }

  function executeFromPreview(): void {
    closeSqlPreview();
    requestExecution();
  }

  function requestExecution(): void {
    const changes = gatherChanges();
    // Block execution while there are client-side validation errors (unless bypassed)
    const errors = rows.flatMap((r) =>
      Object.entries(r.validation ?? {})
        .filter(([, v]) => v)
        .map(([k, v]) => ({ rowId: r.id, column: k, error: v }))
    );
    if (errors.length > 0 && !bypassValidation) {
      executionError = 'Fix validation errors before executing changes.';
      executionMessage = '';
      return;
    }
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
      changes,
      batchMode: true,
      bypassValidation
    });
  }

  // Column preferences helpers
  function openColumnManager(): void {
    columnManagerOpen = true;
  }

  // Column visibility toggles and reordering are managed by ColumnManager;
  // the component emits change/save/reset events which App.svelte consumes.

  // Drag & Drop handlers for column manager reordering
  // Drag & drop handlers removed — ColumnManager now encapsulates reordering
  // and keyboard move logic. App.svelte will respond to events emitted by it.

  // Hidden columns modal helpers
  function openHiddenModal(): void {
    hiddenModalOpen = true;
  }

  function showColumn(name: string): void {
    if (hiddenColumnsSet.has(name)) {
      hiddenColumnsSet.delete(name);
      visibleColumns = columns.filter((c) => !hiddenColumnsSet.has(c.name));
      // Persist immediately
      const prefs = {
        columnOrder: columns.map((c) => c.name),
        hiddenColumns: Array.from(hiddenColumnsSet)
      };
      ensureVscode().postMessage({ command: 'saveTablePreferences', prefs });
    }
  }

  function showAllHidden(): void {
    hiddenColumnsSet.clear();
    visibleColumns = columns.filter((c) => !hiddenColumnsSet.has(c.name));
    const prefs = {
      columnOrder: columns.map((c) => c.name),
      hiddenColumns: []
    };
    ensureVscode().postMessage({ command: 'saveTablePreferences', prefs });
    hiddenModalOpen = false;
  }

  function savePreferences(): void {
    const prefs = {
      columnOrder: columns.map((c) => c.name),
      hiddenColumns: Array.from(hiddenColumnsSet)
    };
    ensureVscode().postMessage({ command: 'saveTablePreferences', prefs });
  }

  // Handler for ColumnManager 'change' events. Kept as a top-level function so
  // the template can bind it without inline TypeScript annotations.
  function handleColumnManagerChange(e: CustomEvent<{ items: { name: string; type: string; visible: boolean }[] }>) {
    const updated = e.detail.items;
    // Reconstruct columns ordered as user expects while preserving the
    // authoritative ColumnInfo metadata.
    columns = updated.map(i => masterColumnsMap.get(i.name) ?? { name: i.name, type: i.type, nullable: false });
    hiddenColumnsSet = new Set(updated.filter(i => !i.visible).map(i => i.name));
    visibleColumns = columns.filter((c) => !hiddenColumnsSet.has(c.name));
  }

  function handleHiddenShow(e: CustomEvent<{ name: string }>) {
    showColumn(e.detail.name);
  }

  // Small utility functions missing after the refactor: pagination, search,
  // and resetting preferences. These invoke the extension via postMessage.
  function requestPage(page: number): void {
    ensureVscode().postMessage({ command: 'loadPage', pageNumber: page });
    ariaLiveMessage = `Page ${page + 1} of ${Math.ceil(totalRows / paginationSize)} loaded`;
  }

  function executeSearch(): void {
    ensureVscode().postMessage({ command: 'search', term: (searchTerm || '').trim() });
    ariaLiveMessage = searchTerm?.trim() 
      ? `Searching for "${searchTerm.trim()}"`
      : 'Search cleared, showing all rows';
  }

  function resetPreferences(): void {
    ensureVscode().postMessage({ command: 'resetTablePreferences' });
    ariaLiveMessage = 'Column preferences reset to defaults';
  }

  function handleColumnManagerSave(e: CustomEvent<{ items: { name: string; type: string; visible: boolean }[] }>) {
    const items = e.detail.items;
    columns = items.map(i => masterColumnsMap.get(i.name) ?? { name: i.name, type: i.type, nullable: false });
    hiddenColumnsSet = new Set(items.filter(i => !i.visible).map(i => i.name));
    visibleColumns = columns.filter((c) => !hiddenColumnsSet.has(c.name));
    const prefs = { columnOrder: columns.map((c) => c.name), hiddenColumns: Array.from(hiddenColumnsSet) };
    ensureVscode().postMessage({ command: 'saveTablePreferences', prefs });
  }

  function handleMessage(event: MessageEvent): void {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.command) {
      case 'sqlPreview':
        previewLoading = false;
        sqlPreviewIsError = Boolean((message as any).error);
        sqlPreview = message.payload && typeof message.payload === 'string' ? String(message.payload) : '';
        sqlPreviewOpen = true;
        break;
      case 'loadData':
        // If the webview requested a refresh that should discard local drafts,
        // set the reset flag so createDraftSnapshot() returns an empty snapshot.
        if (discardDraftForNextLoad) {
          resetDraftState = true;
          discardDraftForNextLoad = false;
        }
        initialise(message.payload as TableStatePayload);
        const payload = message.payload as TableStatePayload;
        ariaLiveMessage = `Table loaded: ${payload.totalRows} rows, page ${payload.currentPage + 1} of ${Math.ceil(payload.totalRows / payload.paginationSize)}`;
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
      case 'saveTablePreferencesResult':
        if (message.payload && (message.payload as any).success) {
          executionMessage = 'Column preferences saved';
          executionError = '';
          columnManagerOpen = false;
        } else {
          executionError = message.payload && (message.payload as any).error ? String((message.payload as any).error) : 'Failed to save column preferences';
        }
        break;
      case 'resetTablePreferencesResult':
        if (message.payload && (message.payload as any).success) {
          executionMessage = 'Column preferences reset to defaults';
          executionError = '';
          hiddenColumnsSet = new Set();
          columns = Array.from(masterColumnsMap.values());
          visibleColumns = columns.filter((c) => !hiddenColumnsSet.has(c.name));
          // Ensure columns are reset and visible; the ColumnManager will be
          // provided items derived directly from columns/hiddenColumnsSet.
          columnManagerOpen = false;
        } else {
          executionError = message.payload && (message.payload as any).error ? String((message.payload as any).error) : 'Failed to reset column preferences';
        }
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
        <label class="bypass-toggle" title="Skip client-side validation and let the database enforce constraints">
          <input type="checkbox" bind:checked={bypassValidation}>
          <span>Bypass validation</span>
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
          disabled={executing || (hasValidationErrors && !bypassValidation)}
          title={hasValidationErrors && !bypassValidation ? 'Fix validation errors before executing' : undefined}
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
  <button type="button" class="ps-btn" on:click={openColumnManager}>Columns</button>
  <button type="button" class="ps-btn" on:click={openHiddenModal}>Hidden</button>
      </div>
    </header>

    {#if columnManagerOpen}
      <div class="modal-backdrop">
        <FocusTrap ariaLabel="Column Manager" on:escapepressed={() => columnManagerOpen = false}>
          <div class="modal dialog column-manager" role="dialog" aria-modal="true" aria-labelledby="column-manager-heading">
            <h2 id="column-manager-heading" class="sr-only">Manage Columns</h2>
            <ColumnManager
              items={columns.map((c) => ({ name: c.name, type: c.type, visible: !hiddenColumnsSet.has(c.name) }))}
              on:change={handleColumnManagerChange}
              on:save={handleColumnManagerSave}
              on:reset={() => resetPreferences()}
              on:cancel={() => columnManagerOpen = false}
            />
          </div>
        </FocusTrap>
      </div>
    {/if}

    {#if hiddenModalOpen}
      <HiddenColumnsModal
        hidden={Array.from(hiddenColumnsSet)}
        on:show={handleHiddenShow}
        on:showAll={() => { showAllHidden(); }}
        on:close={() => { hiddenModalOpen = false; }}
      />
    {/if}

    {#if fkSelectorOpen && fkSelectorColumn}
      <FKSelectorModal
        column={fkSelectorColumn}
        schemaName={schemaName}
        tableName={tableName}
        isOpen={fkSelectorOpen}
        {vscode}
        on:fkSelected={handleFKSelected}
        on:close={closeFKSelector}
      />
    {/if}

    {#if dateTimeModalOpen && dateTimeColumn}
      <DateTimeModal
        isOpen={dateTimeModalOpen}
        value={dateTimeValue}
        columnType={dateTimeColumn.type}
        onClose={closeDateTimeModal}
        onSave={handleDateTimeSaved}
      />
    {/if}

    <section class="toolbar">
      <div class="toolbar-group toolbar-search">
        <input
          type="search"
          placeholder="Search this table…"
          bind:value={searchTerm}
          on:keydown={(event) => event.key === 'Enter' && executeSearch()}
          on:search={() => {
            // Handle native browser clear button (X in search inputs)
            if (!searchTerm || searchTerm.trim().length === 0) {
              executeSearch();
            }
          }}
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
          {#each visibleColumns as column}
            <col style={columnStyle(column)}>
          {/each}
          <col class="row-actions-column">
        </colgroup>
        <thead>
          <tr>
            <th class="select-cell">
              <input type="checkbox" checked={selectAll} on:change={toggleSelectAll}>
            </th>
            {#each visibleColumns as column}
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
                    {#if column.foreignKey}
                      <span class="fk" title={`Foreign key: ${column.foreignKey.referencedSchema}.${column.foreignKey.referencedTable}.${column.foreignKey.referencedColumn}`}>🔗</span>
                    {/if}
                    {#if column.isUnique}
                      <span class="unique" title="Unique constraint">✓</span>
                    {/if}
                    {#if column.isIndexed}
                      <button 
                        type="button" 
                        class="index-indicator" 
                        title="Click to manage indexes for this table"
                        on:click={(event) => {
                          event.stopPropagation();
                          ensureVscode().postMessage({ command: 'openIndexManager' });
                        }}
                      >📑</button>
                    {/if}
                    {#if sortIndicator(column)}
                      <span class="sort-indicator">{sortIndicator(column)}</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="resize-handle"
                    tabindex="0"
                    aria-label={`Resize ${column.name} column. Use arrow keys to adjust width.`}
                    on:pointerdown={(event) => startResize(column, event)}
                    on:mousedown={(event) => startResize(column, event)}
                    on:keydown={(event) => handleResizeKeydown(column, event)}
                    title="Drag to resize, or use arrow keys (Left/Right to decrease/increase width)"
                  ></button>
                </div>
                <small>{column.type}</small>
              </th>
            {/each}
            <th class="row-actions" aria-label="Row actions"></th>
          </tr>
          <tr class="filters">
            <th></th>
            {#each visibleColumns as column}
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
                  on:click={(event) => handleRowCheckboxClick(row, event)}
                  title="Click to select, Shift+Click to select a range"
                >
              </td>
              {#each visibleColumns as column}
                {#if column.enumValues && column.enumValues.length > 0 && !String(column.type).endsWith('[]')}
                    {@const err = row.validation?.[column.name]}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <select
                      disabled={row.deleted}
                      value={row.current[column.name] ?? ''}
                      on:change={(event) => handleEnumSelectChange(row, column, event)}
                      aria-invalid={err ? 'true' : 'false'}
                      aria-describedby={err ? errorId(row.id, column.name) : undefined}
                    >
                      <option value="">NULL</option>
                      {#each column.enumValues as option}
                        <option value={option}>{option}</option>
                      {/each}
                    </select>
                    <span id={errorId(row.id, column.name)} class="cell-error" role="img" aria-hidden={!err} title={err}>{err ? '⚠' : ''}</span>
                  </td>
                {:else if column.type === 'boolean' || column.type === 'bool'}
                    {@const err = row.validation?.[column.name]}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <input
                      type="checkbox"
                      checked={Boolean(row.current[column.name])}
                      disabled={row.deleted}
                      on:change={(event) => handleBooleanChange(row, column, event)}
                      aria-invalid={err ? 'true' : 'false'}
                      aria-describedby={err ? errorId(row.id, column.name) : undefined}
                    >
                    <span id={errorId(row.id, column.name)} class="cell-error" role="img" aria-hidden={!err} title={err}>{err ? '⚠' : ''}</span>
                  </td>
                {:else if column.type === 'json' || column.type === 'jsonb' || String(column.type).endsWith('[]')}
                    {@const err = row.validation?.[column.name]}
                  <td class={clsx('cell json', { modified: isColumnModified(row, column), 'cell-error-state': err })} style={columnStyle(column)}>
                    <button
                      type="button"
                      class="ps-btn ps-btn--ghost json-button"
                      disabled={row.deleted}
                      on:click={() => openJsonEditor(row, column)}
                      aria-describedby={err ? errorId(row.id, column.name) : undefined}
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
                    <span id={errorId(row.id, column.name)} class="cell-error" role="img" aria-hidden={!err} title={err}>{err ? '⚠' : ''}</span>
                  </td>
                {:else if column.foreignKey}
                    {@const err = row.validation?.[column.name]}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <div class="cell-edit">
                      <input
                        type="text"
                        value={formatCellValue(row.current[column.name], column)}
                        disabled={row.deleted}
                        on:input={(event) => handleTextInput(row, column, event)}
                        class="cell-input"
                        aria-invalid={err ? 'true' : 'false'}
                        aria-describedby={err ? errorId(row.id, column.name) : undefined}
                        placeholder="Enter FK value or click..."
                      >
                      <button
                        type="button"
                        class="ps-btn ps-btn--icon text-expand-button"
                        disabled={row.deleted}
                        on:click={() => openFKSelector(row, column)}
                        title="Browse and select from referenced table"
                      >
                        🔗
                      </button>
                      <span id={errorId(row.id, column.name)} class="cell-error" role="img" aria-hidden={!err} title={err}>{err ? '⚠' : ''}</span>
                    </div>
                  </td>
                {:else if /timestamp|date|time/i.test(column.type)}
                    {@const err = row.validation?.[column.name]}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <div class="cell-edit">
                      <input
                        type="text"
                        value={formatCellValue(row.current[column.name], column)}
                        disabled={row.deleted}
                        on:input={(event) => handleTextInput(row, column, event)}
                        class="cell-input"
                        aria-invalid={err ? 'true' : 'false'}
                        aria-describedby={err ? errorId(row.id, column.name) : undefined}
                        placeholder="Enter date/time or click..."
                      >
                      <button
                        type="button"
                        class="ps-btn ps-btn--icon text-expand-button"
                        disabled={row.deleted}
                        on:click={() => openDateTimeModal(row, column)}
                        title="Open date/time picker"
                      >
                        📅
                      </button>
                      <span id={errorId(row.id, column.name)} class="cell-error" role="img" aria-hidden={!err} title={err}>{err ? '⚠' : ''}</span>
                    </div>
                  </td>
                {:else}
                    {@const err = row.validation?.[column.name]}
                    {@const isUuidPk = primaryKey.includes(column.name) && column.type.toLowerCase() === 'uuid'}
                  <td class={clsx('cell', { modified: isColumnModified(row, column) })} style={columnStyle(column)}>
                    <div class="cell-edit">
                      <input
                        type="text"
                        inputmode={isIntegerType(column.type) ? 'numeric' : isFloatType(column.type) ? 'decimal' : undefined}
                        pattern={isIntegerType(column.type) ? '\\d*' : isFloatType(column.type) ? '[-+]?\\d*(\\.\\d+)?' : undefined}
                        value={formatCellValue(row.current[column.name], column)}
                        disabled={row.deleted}
                        on:input={(event) => handleTextInput(row, column, event)}
                        class="cell-input"
                        aria-invalid={err ? 'true' : 'false'}
                        aria-describedby={err ? errorId(row.id, column.name) : undefined}
                      >
                      {#if isUuidPk && row.isNew}
                        <button
                          type="button"
                          class="ps-btn ps-btn--icon text-expand-button"
                          disabled={row.deleted}
                          on:click={() => {
                            const uuid = generateUUID();
                            updateCell(row, column, uuid);
                          }}
                          title="Generate random UUID"
                        >
                          🎲
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="ps-btn ps-btn--icon text-expand-button"
                        disabled={row.deleted}
                        on:click={() => openTextEditor(row, column)}
                        title="Expand text editor"
                      >
                        📝
                      </button>
                      <span id={errorId(row.id, column.name)} class="cell-error" role="img" aria-hidden={!err} title={err}>{err ? '⚠' : ''}</span>
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
              <td class="empty" colspan={visibleColumns.length + 2}>No rows in this page.</td>
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
      
      <!-- ARIA live region for dynamic announcements -->
      <div role="status" aria-live="polite" aria-atomic="true" class="aria-live-region">
        {ariaLiveMessage}
      </div>
    </section>
  </div>

  {#if sqlPreviewOpen}
    <div class="modal-backdrop">
      <FocusTrap ariaLabel="SQL Preview" on:escapepressed={closeSqlPreview}>
        <div
          class="modal dialog preview-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sql-preview-heading"
          aria-describedby="sql-preview-content"
        >
          <header class="modal-header">
            <h3 id="sql-preview-heading">SQL Preview</h3>
          </header>
          <div id="sql-preview-content" class="modal-body">
            {#if previewLoading}
              <p class="preview-status">Generating SQL preview…</p>
            {:else if sqlPreviewIsError}
              <div class="sql-error-banner" role="alert" aria-live="polite">
                <strong>Error generating SQL</strong>
                <p class="sql-error-msg">{sqlPreview}</p>
              </div>
              <pre class="sql-preview">{sqlPreview}</pre>
            {:else if sqlPreview}
              <pre class="sql-preview">{sqlPreview}</pre>
            {:else}
              <p class="preview-status">No SQL changes to display.</p>
            {/if}
          </div>
          <footer class="modal-actions" role="group">
            <button
              type="button"
              class="ps-btn ps-btn--ghost"
              on:click={closeSqlPreview}
              title="Close preview (Escape)"
            >
              Cancel
            </button>
            <button
              type="button"
              class="ps-btn ps-btn--ghost"
              on:click={copyToSqlTerminal}
              disabled={executing || previewLoading || !sqlPreview}
              title="Copy SQL to terminal without executing"
            >
              📋 Copy to Terminal
            </button>
            <button
              type="button"
              class="ps-btn ps-btn--accent"
              on:click={executeFromPreview}
              disabled={executing || previewLoading || (hasValidationErrors && !bypassValidation)}
              title={hasValidationErrors && !bypassValidation ? 'Fix validation errors before executing' : 'Execute changes (Enter)'}
            >
              Execute
            </button>
          </footer>
        </div>
      </FocusTrap>
    </div>
  {/if}

  {#if jsonEditorOpen && jsonEditorRow && jsonEditorColumn}
    <div class="modal-backdrop">
      <FocusTrap ariaLabel="JSON Editor" on:escapepressed={closeJsonEditor}>
        <div
          class="modal dialog json-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="json-editor-heading"
          aria-describedby="json-editor-description"
        >
          <header class="modal-header">
            <h3 id="json-editor-heading">Edit {jsonEditorColumn.name} ({editorLabel(jsonEditorColumn)})</h3>
            {#if jsonEditorColumn.enumValues && jsonEditorColumn.enumValues.length > 0}
              <p id="json-editor-description" class="enum-hint">Allowed values: {jsonEditorColumn.enumValues.join(', ')}</p>
            {/if}
          </header>
          <div class="modal-body">
            <textarea
              bind:this={jsonTextarea}
              bind:value={jsonDraft}
              spellcheck={false}
              class={jsonError ? 'invalid' : ''}
              aria-label="JSON content editor"
              aria-describedby={jsonError ? 'json-error-message' : undefined}
              aria-invalid={jsonError ? 'true' : 'false'}
            ></textarea>
            {#if jsonError}
              <p id="json-error-message" class="error" role="alert">{jsonError}</p>
            {/if}
          </div>
          <footer class="modal-actions" role="group">
            <button
              type="button"
              class="ps-btn ps-btn--ghost"
              on:click={closeJsonEditor}
              title="Close without saving (Escape)"
            >
              Cancel
            </button>
            <button
              type="button"
              class="ps-btn ps-btn--accent"
              on:click={saveJsonDraft}
              title="Save changes (Enter or primary action)"
            >
              Save
            </button>
          </footer>
        </div>
      </FocusTrap>
    </div>
  {/if}

  {#if textEditorOpen && textEditorRow && textEditorColumn}
    <div class="modal-backdrop">
      <FocusTrap ariaLabel="Text Editor" on:escapepressed={closeTextEditor}>
        <div
          class="modal dialog text-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="text-editor-heading"
        >
          <header class="modal-header">
            <h3 id="text-editor-heading">Edit {textEditorColumn.name} (Text)</h3>
          </header>
          <div class="modal-body">
            <textarea
              bind:this={textTextarea}
              bind:value={textDraft}
              spellcheck={false}
              aria-label="Text content editor"
            ></textarea>
          </div>
          <footer class="modal-actions" role="group">
            <button
              type="button"
              class="ps-btn ps-btn--ghost"
              on:click={closeTextEditor}
              title="Close without saving (Escape)"
            >
              Cancel
            </button>
            <button
              type="button"
              class="ps-btn ps-btn--accent"
              on:click={saveTextDraft}
              title="Save changes (Enter or primary action)"
            >
              Save
            </button>
          </footer>
        </div>
      </FocusTrap>
    </div>
  {/if}
{/if}

<!-- Styles moved to webview/src/data-editor.css -->
