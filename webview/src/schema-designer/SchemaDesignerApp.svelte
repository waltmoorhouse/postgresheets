<script lang="ts">
  import { onMount } from 'svelte';
  import { clsx } from 'clsx';
  import type {
    VSCodeApi,
    SchemaDesignerInitialState,
    SchemaDesignerColumn,
    SchemaDesignerPreviewPayload
  } from '$lib/types';

  export let vscode: VSCodeApi | undefined;
  export let initialState: unknown;

  interface DesignerColumn extends SchemaDesignerColumn {
    errors: string[];
  }

  let schemaName = '';
  let tableName = '';
  let columns: DesignerColumn[] = [];
  let typeOptions: string[] = [];
  let sqlPreview = '/* No changes */';
  let previewWarnings: string[] = [];
  let previewLoading = false;
  let previewTimeout: ReturnType<typeof setTimeout> | null = null;

  let showManualSql = false;
  let manualSql = '';

  let executionMessage = '';
  let executionError = '';
  let executing = false;
  let dirty = false;

  let globalErrors: string[] = [];

  const COMMON_TYPES = [
    'bigint',
    'boolean',
    'bytea',
    'date',
    'double precision',
    'integer',
    'jsonb',
    'numeric',
    'serial',
    'text',
    'timestamp without time zone',
    'timestamp with time zone',
    'uuid',
    'varchar(255)'
  ];

  function initialise(state: SchemaDesignerInitialState): void {
    schemaName = state.schemaName;
    tableName = state.tableName;
    typeOptions = Array.from(new Set([...state.typeOptions, ...COMMON_TYPES])).sort((a, b) => a.localeCompare(b));
    columns = state.columns.map((column) => ({
      ...column,
      errors: []
    }));

    sqlPreview = '/* No changes */';
    manualSql = '';
    previewWarnings = [];
    executionError = '';
    executionMessage = '';
    executing = false;
    dirty = false;
    globalErrors = [];

    validateColumns();
    requestPreview(true);
  }

  if (initialState && typeof initialState === 'object') {
    initialise(initialState as SchemaDesignerInitialState);
  }

  function ensureVscode(): VSCodeApi {
    if (!vscode) {
      throw new Error('VS Code API unavailable.');
    }
    return vscode;
  }

  function markDirty(): void {
    dirty = true;
    validateColumns();
    schedulePreview();
  }

  function schedulePreview(): void {
    if (showManualSql) {
      return;
    }
    if (previewTimeout) {
      clearTimeout(previewTimeout);
    }
    previewTimeout = setTimeout(() => {
      requestPreview();
    }, 250);
  }

  function requestPreview(initial = false): void {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
      previewTimeout = null;
    }
    if (showManualSql && !initial) {
      return;
    }
    previewLoading = true;
    ensureVscode().postMessage({
      command: 'requestPreview',
      payload: serializeColumns()
    });
  }

  function serializeColumns(): SchemaDesignerPreviewPayload {
    return {
      columns: columns.map((column) => ({
        id: column.id,
        name: column.name,
        originalName: column.originalName,
        type: column.type,
        nullable: column.nullable,
        defaultValue: column.defaultValue,
        comment: column.comment,
        isPrimaryKey: column.isPrimaryKey,
        isNew: column.isNew,
        markedForDrop: column.markedForDrop
      }))
    };
  }

  function addColumn(): void {
    const existingNames = new Set(
      columns
        .filter((column) => !column.markedForDrop)
        .map((column) => column.name.trim().toLowerCase())
        .filter((name) => name.length > 0)
    );
    let index = 1;
    let suggestedName = `column_${index}`;
    while (existingNames.has(suggestedName)) {
      index += 1;
      suggestedName = `column_${index}`;
    }

    const firstType = typeOptions[0] ?? 'text';
    const now = Date.now();
    columns = [
      ...columns,
      {
        id: `new-${now}-${Math.random().toString(16).slice(2)}`,
        name: suggestedName,
        originalName: null,
        type: firstType,
        nullable: true,
        defaultValue: null,
        comment: null,
        isPrimaryKey: false,
        isNew: true,
        markedForDrop: false,
        errors: []
      }
    ];
    markDirty();
  }

  function updateColumn<K extends keyof DesignerColumn>(column: DesignerColumn, key: K, value: DesignerColumn[K]): void {
    columns = columns.map((current) => {
      if (current.id !== column.id) {
        return current;
      }
      return {
        ...current,
        [key]: value
      } as DesignerColumn;
    });
    markDirty();
  }

  function handleNameInput(column: DesignerColumn, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    updateColumn(column, 'name', target?.value ?? '');
  }

  function handleTypeChange(column: DesignerColumn, event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    updateColumn(column, 'type', target?.value ?? column.type);
  }

  function handleNullableChange(column: DesignerColumn, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    updateColumn(column, 'nullable', Boolean(target?.checked));
  }

  function handleDefaultInput(column: DesignerColumn, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    const value = target?.value ?? '';
    updateColumn(column, 'defaultValue', value.length ? value : null);
  }

  function handleCommentInput(column: DesignerColumn, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    const value = target?.value ?? '';
    updateColumn(column, 'comment', value.length ? value : null);
  }

  function toggleDrop(column: DesignerColumn): void {
    if (column.isNew) {
      columns = columns.filter((current) => current.id !== column.id);
      markDirty();
      return;
    }
    const next = !column.markedForDrop;
    columns = columns.map((current) => {
      if (current.id !== column.id) {
        return current;
      }
      return {
        ...current,
        markedForDrop: next,
        isPrimaryKey: next ? current.isPrimaryKey : false
      };
    });
    markDirty();
  }

  function togglePrimary(column: DesignerColumn): void {
    if (column.markedForDrop) {
      return;
    }
    updateColumn(column, 'isPrimaryKey', !column.isPrimaryKey);
  }

  function duplicateNameCheck(): Map<string, number> {
    const map = new Map<string, number>();
    columns.forEach((column) => {
      if (column.markedForDrop) {
        return;
      }
      const key = (column.name ?? '').trim().toLowerCase();
      if (!key) {
        return;
      }
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }

  function validateColumns(): void {
    globalErrors = [];
    const duplicates = duplicateNameCheck();

    columns = columns.map((column) => {
      const errors: string[] = [];

      const trimmedName = (column.name ?? '').trim();
      if (!column.markedForDrop) {
        if (!trimmedName) {
          errors.push('Column name is required');
        }
        if ((column.type ?? '').trim().length === 0) {
          errors.push('Column type is required');
        }
        const duplicateCount = duplicates.get(trimmedName.toLowerCase()) ?? 0;
        if (duplicateCount > 1) {
          errors.push('Duplicate column name');
        }
      }

      return {
        ...column,
        errors
      };
    });

    const activeColumns = columns.filter((column) => !column.markedForDrop);
    const pkColumns = activeColumns.filter((column) => column.isPrimaryKey);
    if (pkColumns.length === 0 && columns.some((column) => column.isPrimaryKey)) {
      globalErrors.push('Primary key selection invalid: all selected columns are dropped.');
    }

    if (activeColumns.some((column) => column.errors.length > 0)) {
      globalErrors.push('Resolve column validation errors before continuing.');
    }
  }

  function handleManualToggle(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const checked = Boolean(target?.checked);
    showManualSql = checked;
    if (checked) {
      manualSql = sqlPreview;
    } else {
      manualSql = '';
      requestPreview();
    }
  }

  function handleExecute(): void {
    validateColumns();
    if (globalErrors.length > 0) {
      executionError = globalErrors.join('\n');
      executionMessage = '';
      return;
    }

    executionError = '';
    executionMessage = '';
    executing = true;

    ensureVscode().postMessage({
      command: 'executeSchemaChanges',
      payload: {
        ...serializeColumns(),
        useManualSql: showManualSql,
        sql: showManualSql ? manualSql : undefined
      }
    });
  }

  function requestRefresh(): void {
    ensureVscode().postMessage({ command: 'refreshStructure' });
  }

  function handleMessage(event: MessageEvent): void {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.command) {
      case 'loadState':
        initialise(message.payload as SchemaDesignerInitialState);
        break;
      case 'sqlPreview': {
        const payload = message.payload as { sql: string; warnings?: string[] };
        sqlPreview = payload.sql || '/* No changes */';
        previewWarnings = payload.warnings ?? [];
        previewLoading = false;
        if (!showManualSql) {
          manualSql = sqlPreview;
        }
        break;
      }
      case 'executionComplete':
        executing = false;
        if (message.success) {
          executionMessage = 'Schema updated successfully.';
          executionError = '';
          dirty = false;
        } else {
          executionError = message.error ? String(message.error) : 'Schema update failed.';
          executionMessage = '';
        }
        break;
      case 'showMessage':
        executionMessage = message.text ? String(message.text) : '';
        break;
      case 'executionError':
        executing = false;
        executionError = message.error ? String(message.error) : 'Schema update failed.';
        break;
      default:
        break;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (previewTimeout) {
        clearTimeout(previewTimeout);
      }
    };
  });
</script>

<div class="designer-container">
  <header class="designer-header">
    <div class="designer-header__title">
      <h2>{schemaName}.<span>{tableName}</span></h2>
      <p class="designer-header__meta">
        <span>Columns: {columns.length}</span>
        {#if dirty}
          <span class="designer-header__badge" title="Unsaved changes">Unsaved</span>
        {/if}
      </p>
    </div>
    <div class="designer-header__actions" role="toolbar" aria-label="Schema actions">
      <button type="button" class="ps-btn" on:click={requestRefresh}>
        Reload structure
      </button>
      <button type="button" class="ps-btn ps-btn--primary" on:click={addColumn}>
        Add column
      </button>
      <button
        type="button"
        class="ps-btn ps-btn--accent"
        on:click={handleExecute}
        disabled={executing || globalErrors.length > 0}
      >
        {executing ? 'Applying…' : 'Apply changes'}
      </button>
    </div>
  </header>

  {#if globalErrors.length > 0}
    <section class="designer-alert designer-alert--error">
      <h3>Fix before applying</h3>
      <ul>
        {#each globalErrors as error}
          <li>{error}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="designer-body">
    <div class="designer-grid">
      <div class="designer-columns">
        <table>
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Type</th>
              <th scope="col">Nullable</th>
              <th scope="col">Default</th>
              <th scope="col">Comment</th>
              <th scope="col">Primary</th>
              <th scope="col" class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#if columns.length === 0}
              <tr>
                <td colspan="7" class="empty">No columns defined.</td>
              </tr>
            {:else}
              {#each columns as column (column.id)}
                <tr class={clsx({ dropped: column.markedForDrop })}>
                  <td data-label="Column name">
                    <input
                      type="text"
                      class:has-error={column.errors.some((error) => error.includes('name'))}
                      value={column.name}
                      disabled={column.markedForDrop}
                      on:input={(event) => handleNameInput(column, event)}
                    >
                    {#if column.originalName && column.originalName !== column.name}
                      <p class="hint">Renamed from {column.originalName}</p>
                    {/if}
                    {#if column.errors.length > 0}
                      <ul class="cell-errors">
                        {#each column.errors as error}
                          <li>{error}</li>
                        {/each}
                      </ul>
                    {/if}
                  </td>
                  <td data-label="Type">
                    <select
                      value={column.type}
                      disabled={column.markedForDrop}
                      on:change={(event) => handleTypeChange(column, event)}
                    >
                      {#each typeOptions as option}
                        <option value={option}>{option}</option>
                      {/each}
                    </select>
                  </td>
                  <td data-label="Nullable" class="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={column.nullable}
                      disabled={column.markedForDrop}
                      on:change={(event) => handleNullableChange(column, event)}
                    >
                  </td>
                  <td data-label="Default">
                    <input
                      type="text"
                      value={column.defaultValue ?? ''}
                      placeholder="e.g. NOW()"
                      disabled={column.markedForDrop}
                      on:input={(event) => handleDefaultInput(column, event)}
                    >
                  </td>
                  <td data-label="Comment">
                    <input
                      type="text"
                      value={column.comment ?? ''}
                      placeholder="Column description"
                      disabled={column.markedForDrop}
                      on:input={(event) => handleCommentInput(column, event)}
                    >
                  </td>
                  <td data-label="Primary" class="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={column.isPrimaryKey}
                      disabled={column.markedForDrop}
                      on:change={() => togglePrimary(column)}
                    >
                  </td>
                  <td class="actions">
                    <div class="row-actions">
                      {#if column.markedForDrop}
                        <button
                          type="button"
                          class="ps-btn ps-btn--ghost"
                          on:click={() => updateColumn(column, 'markedForDrop', false)}
                        >
                          Restore
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="ps-btn ps-btn--ghost"
                          on:click={() => toggleDrop(column)}
                        >
                          {column.isNew ? 'Remove' : 'Drop'}
                        </button>
                      {/if}
                    </div>
                    {#if column.isNew}
                      <span class="hint">New</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      <aside class="designer-sidebar">
        <div class="preview-card">
          <header>
            <h3>SQL Preview</h3>
            <label class="manual-toggle">
              <input type="checkbox" checked={showManualSql} on:change={handleManualToggle}>
              <span>Edit SQL manually</span>
            </label>
          </header>
          {#if previewLoading}
            <p class="preview-status">Generating preview…</p>
          {/if}
          {#if previewWarnings.length > 0}
            <ul class="designer-alert designer-alert--warning">
              {#each previewWarnings as warning}
                <li>{warning}</li>
              {/each}
            </ul>
          {/if}
          {#if showManualSql}
            <textarea
              bind:value={manualSql}
              spellcheck={false}
              rows="12"
              class="manual-editor"
            ></textarea>
          {:else}
            <pre>{sqlPreview}</pre>
          {/if}
        </div>
        <div class="execution-feedback">
          {#if executionMessage}
            <div class="message success">{executionMessage}</div>
          {/if}
          {#if executionError}
            <div class="message error">{executionError}</div>
          {/if}
        </div>
      </aside>
    </div>
  </section>
</div>

<style>
  .designer-container {
    padding: var(--ps-spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-lg);
  }

  .designer-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ps-spacing-lg);
    padding: var(--ps-spacing-md) var(--ps-spacing-lg);
    background: var(--ps-surface-subtle);
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-lg);
  }

  .designer-header__title h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    display: flex;
    align-items: baseline;
    gap: var(--ps-spacing-xs);
  }

  .designer-header__title h2 span {
    color: var(--ps-accent-foreground);
    background: var(--ps-accent-muted);
    padding: 0 var(--ps-spacing-xs);
    border-radius: var(--ps-radius-sm);
  }

  .designer-header__meta {
    margin: var(--ps-spacing-2xs) 0 0;
    color: var(--ps-text-secondary);
    display: flex;
    gap: var(--ps-spacing-sm);
    align-items: center;
    flex-wrap: wrap;
  }

  .designer-header__badge {
    background: var(--ps-accent-muted);
    color: var(--ps-accent-foreground);
    border-radius: 999px;
    padding: 0 var(--ps-spacing-sm);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .designer-header__actions {
    display: flex;
    align-items: center;
    gap: var(--ps-spacing-sm);
    flex-wrap: wrap;
  }

  .designer-alert {
    border-radius: var(--ps-radius-md);
    padding: var(--ps-spacing-md);
    border: 1px solid transparent;
    list-style: none;
    margin: 0;
  }

  .designer-alert ul {
    margin: var(--ps-spacing-xs) 0 0;
    padding-left: var(--ps-spacing-lg);
  }

  .designer-alert--error {
    background: color-mix(in srgb, var(--ps-danger-bg) 70%, transparent);
    border-color: var(--ps-danger-border);
  }

  .designer-alert--warning {
    background: color-mix(in srgb, var(--ps-accent-muted) 35%, transparent);
    border-color: var(--ps-accent-border);
    padding: var(--ps-spacing-sm) var(--ps-spacing-md);
  }

  .designer-body {
    background: var(--ps-surface-subtle);
    border-radius: var(--ps-radius-lg);
    border: 1px solid var(--ps-border);
    padding: var(--ps-spacing-lg);
  }

  .designer-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: var(--ps-spacing-lg);
  }

  .designer-columns {
    overflow: auto;
    border-radius: var(--ps-radius-lg);
    border: 1px solid var(--ps-border);
    background: var(--ps-surface);
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 13px;
  }

  thead {
    background: var(--ps-surface-elevated);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th,
  td {
    padding: var(--ps-spacing-sm) var(--ps-spacing-md);
    border-bottom: 1px solid var(--ps-border);
    text-align: left;
    vertical-align: top;
  }

  th.actions,
  td.actions {
    text-align: right;
    white-space: nowrap;
    width: 120px;
  }

  tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--ps-surface-subtle) 80%, transparent);
  }

  tbody tr.dropped td {
    opacity: 0.6;
    text-decoration: line-through;
  }

  input[type='text'],
  select,
  textarea {
    width: 100%;
    border-radius: var(--ps-radius-sm);
    border: 1px solid var(--ps-border);
    background: var(--ps-surface-elevated);
    color: var(--ps-text-primary);
    padding: var(--ps-spacing-xs) var(--ps-spacing-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }

  input[type='text']:focus,
  select:focus,
  textarea:focus {
    border-color: var(--ps-focus-ring);
    box-shadow: 0 0 0 1px var(--ps-focus-ring);
    outline: none;
  }

  input.has-error {
    border-color: var(--ps-danger-border);
  }

  .cell-errors {
    color: var(--ps-danger-border);
    margin: var(--ps-spacing-2xs) 0 0;
    padding-left: var(--ps-spacing-md);
    font-size: 0.8rem;
  }

  .hint {
    margin: var(--ps-spacing-2xs) 0 0;
    opacity: 0.7;
    font-size: 0.75rem;
  }

  .checkbox-cell {
    text-align: center;
  }

  .checkbox-cell input[type='checkbox'] {
    width: 16px;
    height: 16px;
  }

  .row-actions {
    display: flex;
    gap: var(--ps-spacing-2xs);
    justify-content: flex-end;
  }

  .empty {
    text-align: center;
    padding: var(--ps-spacing-lg);
    color: var(--ps-text-secondary);
  }

  .designer-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-lg);
  }

  .preview-card {
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-lg);
    background: var(--ps-surface);
    padding: var(--ps-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-md);
    min-height: 260px;
  }

  .preview-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ps-spacing-sm);
  }

  .preview-card h3 {
    margin: 0;
    font-size: 1rem;
  }

  .manual-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--ps-spacing-xs);
    color: var(--ps-text-secondary);
  }

  pre,
  .manual-editor {
    background: var(--vscode-terminal-background, #1e1e1e);
    border-radius: var(--ps-radius-md);
    border: 1px solid var(--ps-border);
    padding: var(--ps-spacing-md);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85rem;
    max-height: 340px;
    overflow: auto;
  }

  .manual-editor {
    min-height: 220px;
    resize: vertical;
  }

  .preview-status {
    margin: 0;
    color: var(--ps-text-secondary);
  }

  .execution-feedback .message {
    padding: var(--ps-spacing-sm) var(--ps-spacing-md);
    border-radius: var(--ps-radius-md);
    border: 1px solid transparent;
  }

  .execution-feedback .success {
    background: var(--ps-success-bg);
    border-color: var(--ps-success-border);
  }

  .execution-feedback .error {
    background: var(--ps-danger-bg);
    border-color: var(--ps-danger-border);
  }

  @media (max-width: 1120px) {
    .designer-grid {
      grid-template-columns: 1fr;
    }

    .designer-sidebar {
      order: -1;
    }
  }
</style>
