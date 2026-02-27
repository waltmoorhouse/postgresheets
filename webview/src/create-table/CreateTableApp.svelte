<script lang="ts">
  import { onMount } from 'svelte';
  import { clsx } from 'clsx';
  import type {
    VSCodeApi,
    CreateTableInitialState,
    CreateTablePreviewPayload,
    CreateTableColumnDraft,
    SchemaDesignerConstraint
  } from '$lib/types';

  export let vscode: VSCodeApi | undefined;
  export let initialState: unknown;

  interface DesignerColumn extends CreateTableColumnDraft {
    errors: string[];
  }

  interface DesignerConstraint extends SchemaDesignerConstraint {
    errors: string[];
  }

  let schemaName = '';
  let tableName = '';
  let columns: DesignerColumn[] = [];
  let typeOptions: string[] = [];
  let constraints: DesignerConstraint[] = [];

  let sqlPreview = '/* Define at least one column to preview SQL */';
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

  function initialise(state: CreateTableInitialState): void {
    schemaName = state.schemaName;
    tableName = state.suggestedTableName;
    typeOptions = Array.from(new Set([...COMMON_TYPES, ...state.typeOptions])).sort((a, b) => a.localeCompare(b));
    columns = state.columns.map((column) => ({
      ...column,
      errors: []
    }));
    constraints = state.constraints?.map((c) => ({ ...c, errors: [] })) ?? [];

    sqlPreview = '/* Define at least one column to preview SQL */';
    manualSql = '';
    previewWarnings = [];
    previewLoading = false;
    executionError = '';
    executionMessage = '';
    executing = false;
    dirty = false;
    globalErrors = [];

    validateState();
    requestPreview(true);
  }

  if (initialState && typeof initialState === 'object') {
    initialise(initialState as CreateTableInitialState);
  }

  function ensureVscode(): VSCodeApi {
    if (!vscode) {
      throw new Error('VS Code API unavailable.');
    }
    return vscode;
  }

  function markDirty(): void {
    dirty = true;
    validateState();
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
      command: 'createTablePreview',
      payload: serializePayload()
    });
  }

  function serializePayload(): CreateTablePreviewPayload {
    return {
      tableName,
      columns: columns.map((column) => ({
        id: column.id,
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        defaultValue: column.defaultValue,
        comment: column.comment,
        isPrimaryKey: column.isPrimaryKey
      })),
      constraints: constraints.map((c) => ({
        id: c.id,
        name: c.name,
        originalName: c.originalName ?? null,
        type: c.type,
        columns: [...c.columns],
        referencedSchema: c.referencedSchema,
        referencedTable: c.referencedTable,
        referencedColumns: [...c.referencedColumns],
        onUpdate: c.onUpdate,
        onDelete: c.onDelete,
        method: c.method,
        isNew: c.isNew,
        markedForDrop: c.markedForDrop
      }))
    };
  }

  function addColumn(): void {
    const existing = new Set(
      columns.map((column) => column.name.trim().toLowerCase()).filter((name) => name.length > 0)
    );
    let index = 1;
    let suggestion = `column_${index}`;
    while (existing.has(suggestion)) {
      index += 1;
      suggestion = `column_${index}`;
    }

    const type = typeOptions[0] ?? 'text';
    columns = [
      ...columns,
      {
        id: `col-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: suggestion,
        type,
        nullable: true,
        defaultValue: null,
        comment: null,
        isPrimaryKey: false,
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

  function removeColumn(column: DesignerColumn): void {
    columns = columns.filter((current) => current.id !== column.id);
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

  // ---- constraint helpers ----
  function updateConstraint<K extends keyof DesignerConstraint>(constraint: DesignerConstraint, key: K, value: DesignerConstraint[K]): void {
    constraints = constraints.map((current) => {
      if (current.id !== constraint.id) {
        return current;
      }
      return { ...current, [key]: value } as DesignerConstraint;
    });
    markDirty();
  }

  function addConstraint(type: DesignerConstraint['type']): void {
    const existing = new Set(constraints.map((c) => c.name.trim().toLowerCase()).filter((n) => n.length > 0));
    let index = 1;
    const base =
      type === 'foreignKey'
        ? `${tableName}_fk`
        : type === 'uniqueIndex'
        ? `${tableName}_uniq`
        : `${tableName}_idx`;
    let suggestion = `${base}_${index}`;
    while (existing.has(suggestion.toLowerCase())) {
      index += 1;
      suggestion = `${base}_${index}`;
    }
    const firstColumn = columns[0]?.name ?? '';
    constraints = [
      ...constraints,
      {
        id: `c-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: suggestion,
        originalName: null,
        type,
        columns: firstColumn ? [firstColumn] : [],
        referencedSchema: type === 'foreignKey' ? schemaName : null,
        referencedTable: null,
        referencedColumns: [],
        onUpdate: type === 'foreignKey' ? 'NO ACTION' : null,
        onDelete: type === 'foreignKey' ? 'NO ACTION' : null,
        method: type === 'index' ? typeOptions[0] ?? 'btree' : null,
        isNew: true,
        markedForDrop: false,
        errors: []
      }
    ];
    markDirty();
  }

  function removeConstraint(constraint: DesignerConstraint): void {
    constraints = constraints.filter((c) => c.id !== constraint.id);
    markDirty();
  }

  function handleConstraintNameInput(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    updateConstraint(constraint, 'name', target?.value ?? '');
  }

  function handleConstraintTypeChange(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    updateConstraint(constraint, 'type', (target?.value as DesignerConstraint['type']) ?? constraint.type);
  }

  function handleConstraintColumnsInput(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    updateConstraint(constraint, 'columns', (target?.value ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0));
  }

  function handleConstraintReferencedSchemaInput(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    const val = (target?.value ?? '').trim();
    updateConstraint(constraint, 'referencedSchema', val.length ? val : null);
  }

  function handleConstraintReferencedTableInput(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    const val = (target?.value ?? '').trim();
    updateConstraint(constraint, 'referencedTable', val.length ? val : null);
  }

  function handleConstraintReferencedColumnsInput(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    updateConstraint(constraint, 'referencedColumns', (target?.value ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0));
  }

  function handleConstraintOnUpdateChange(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    updateConstraint(constraint, 'onUpdate', (target?.value ?? null) as string | null);
  }

  function handleConstraintOnDeleteChange(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    updateConstraint(constraint, 'onDelete', (target?.value ?? null) as string | null);
  }

  function handleConstraintMethodChange(constraint: DesignerConstraint, event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    updateConstraint(constraint, 'method', (target?.value ?? null) as string | null);
  }

  function togglePrimary(column: DesignerColumn): void {
    updateColumn(column, 'isPrimaryKey', !column.isPrimaryKey);
  }

  function validateState(): void {
    globalErrors = [];

    if (!tableName || tableName.trim().length === 0) {
      globalErrors.push('Table name is required.');
    }

    if (columns.length === 0) {
      globalErrors.push('Add at least one column definition.');
    }

    const duplicates = new Map<string, number>();
    const nextColumns: DesignerColumn[] = [];

    for (const column of columns) {
      const errors: string[] = [];
      const trimmedName = (column.name ?? '').trim();
      if (!trimmedName) {
        errors.push('Column name is required');
      }
      const type = (column.type ?? '').trim();
      if (!type) {
        errors.push('Column type is required');
      }

      const key = trimmedName.toLowerCase();
      if (trimmedName) {
        duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
      }

      nextColumns.push({
        ...column,
        errors
      });
    }

    columns = nextColumns.map((column) => {
      const trimmedName = (column.name ?? '').trim();
      if (trimmedName) {
        const dupCount = duplicates.get(trimmedName.toLowerCase()) ?? 0;
        if (dupCount > 1 && !column.errors.includes('Duplicate column name')) {
          column.errors = [...column.errors, 'Duplicate column name'];
        }
      }
      return column;
    });

    const primaryCount = columns.filter((column) => column.isPrimaryKey).length;
    if (primaryCount === 0) {
      globalErrors.push('Select at least one primary key column.');
    }

    if (columns.some((column) => column.errors.length > 0)) {
      globalErrors.push('Resolve column validation errors before continuing.');
    }

    // constraints validation
    const nameCounts = new Map<string, number>();
    const nextConstraints: DesignerConstraint[] = [];

    for (const constraint of constraints) {
      const errors: string[] = [];
      const trimmedName = (constraint.name ?? '').trim();
      if (!trimmedName) {
        errors.push('Constraint name is required');
      }
      if (!constraint.columns || constraint.columns.length === 0) {
        errors.push('At least one local column is required');
      }
      if (trimmedName) {
        nameCounts.set(trimmedName.toLowerCase(), (nameCounts.get(trimmedName.toLowerCase()) ?? 0) + 1);
      }
      if (constraint.type === 'foreignKey') {
        if (!(constraint.referencedSchema ?? '').trim()) {
          errors.push('Referenced schema is required for foreign keys');
        }
        if (!(constraint.referencedTable ?? '').trim()) {
          errors.push('Referenced table is required for foreign keys');
        }
        if (!constraint.referencedColumns || constraint.referencedColumns.length === 0) {
          errors.push('Referenced columns are required for foreign keys');
        }
        if (
          constraint.columns &&
          constraint.referencedColumns &&
          constraint.columns.length !== constraint.referencedColumns.length
        ) {
          errors.push('Local and referenced column counts must match');
        }
      }
      if (constraint.type === 'index' && !(constraint.method ?? '').trim()) {
        errors.push('Index method is required');
      }
      nextConstraints.push({ ...constraint, errors });
    }

    constraints = nextConstraints.map((c) => {
      const tn = (c.name ?? '').trim();
      if (tn) {
        const count = nameCounts.get(tn.toLowerCase()) ?? 0;
        if (count > 1 && !c.errors.includes('Duplicate constraint name')) {
          c.errors = [...c.errors, 'Duplicate constraint name'];
        }
      }
      return c;
    });

    if (constraints.some((c) => c.errors.length > 0)) {
      globalErrors.push('Resolve constraint validation errors before continuing.');
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
    validateState();
    if (globalErrors.length > 0) {
      executionError = globalErrors.join('\n');
      executionMessage = '';
      return;
    }

    executionError = '';
    executionMessage = '';
    executing = true;

    ensureVscode().postMessage({
      command: 'createTableExecute',
      payload: {
        ...serializePayload(),
        tableName,
        useManualSql: showManualSql,
        sql: showManualSql ? manualSql : undefined
      }
    });
  }

  function handleTableNameInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    tableName = target?.value ?? '';
    markDirty();
  }

  function handleMessage(event: MessageEvent): void {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.command) {
      case 'createTablePreview': {
        const payload = message.payload as { sql: string; warnings?: string[] };
        sqlPreview = payload.sql || '/* Define at least one column to preview SQL */';
        previewWarnings = payload.warnings ?? [];
        previewLoading = false;
        if (!showManualSql) {
          manualSql = sqlPreview;
        }
        break;
      }
      case 'createTableExecuteComplete':
        executing = false;
        if (message.success) {
          executionMessage = 'Table created successfully.';
          executionError = '';
          dirty = false;
        } else {
          executionError = message.error ? String(message.error) : 'Failed to create table.';
          executionMessage = '';
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
      if (previewTimeout) {
        clearTimeout(previewTimeout);
      }
    };
  });
</script>

<div class="designer-container">
  <header class="designer-header">
    <div class="designer-header__title">
      <h2>{schemaName}.<span>{tableName || 'new_table'}</span></h2>
      <p class="designer-header__meta">
        <span>Columns: {columns.length}</span>
        {#if dirty}
          <span class="designer-header__badge" title="Unsaved changes">Draft</span>
        {/if}
      </p>
    </div>
    <div class="designer-header__actions" role="toolbar" aria-label="Create table actions">
      <button type="button" class="ps-btn ps-btn--primary" on:click={addColumn}>
        Add column
      </button>
      <button
        type="button"
        class="ps-btn ps-btn--accent"
        on:click={handleExecute}
        disabled={executing || globalErrors.length > 0}
      >
        {executing ? 'Creating…' : 'Create table'}
      </button>
    </div>
  </header>

  <section class="designer-alert designer-alert--info">
    <div class="info-grid">
      <label>
        <span>Table name</span>
        <input
          type="text"
          value={tableName}
          placeholder="Enter table name"
          on:input={handleTableNameInput}
        >
      </label>
      <div class="info-summary">
        <p>Define columns below. Primary key columns are required for the graphical editors.</p>
      </div>
    </div>
  </section>

  {#if globalErrors.length > 0}
    <section class="designer-alert designer-alert--error">
      <h3>Fix before creating</h3>
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
                <td colspan="7" class="empty">No columns defined yet.</td>
              </tr>
            {:else}
              {#each columns as column (column.id)}
                <tr class={clsx({ error: column.errors.length > 0 })}>
                  <td data-label="Column name">
                    <input
                      type="text"
                      class:has-error={column.errors.some((error) => error.includes('name'))}
                      value={column.name}
                      on:input={(event) => handleNameInput(column, event)}
                    >
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
                      on:change={(event) => handleNullableChange(column, event)}
                    >
                  </td>
                  <td data-label="Default">
                    <input
                      type="text"
                      value={column.defaultValue ?? ''}
                      placeholder="e.g. NOW()"
                      on:input={(event) => handleDefaultInput(column, event)}
                    >
                  </td>
                  <td data-label="Comment">
                    <input
                      type="text"
                      value={column.comment ?? ''}
                      placeholder="Column description"
                      on:input={(event) => handleCommentInput(column, event)}
                    >
                  </td>
                  <td data-label="Primary" class="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={column.isPrimaryKey}
                      on:change={() => togglePrimary(column)}
                    >
                  </td>
                  <td class="actions">
                    <div class="row-actions">
                      <button type="button" class="ps-btn ps-btn--ghost" on:click={() => removeColumn(column)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>

        <!-- constraints UI -->
        <section class="constraint-section" aria-label="Table constraints">
          <header class="constraint-header">
            <h3>
              Constraints
              <span class="help-tip" title="Manage table indexes, unique indexes (including multi-column), and foreign keys.">?</span>
            </h3>
            <div class="constraint-actions" role="toolbar" aria-label="Add constraints">
              <button type="button" class="ps-btn ps-btn--ghost" on:click={() => addConstraint('index')}>Add index</button>
              <button type="button" class="ps-btn ps-btn--ghost" on:click={() => addConstraint('uniqueIndex')}>Add unique index</button>
              <button type="button" class="ps-btn ps-btn--ghost" on:click={() => addConstraint('foreignKey')}>Add foreign key</button>
            </div>
          </header>

          <table class="constraint-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">
                  Type
                  <span class="help-tip" title="Unique index can include multiple columns for composite uniqueness.">?</span>
                </th>
                <th scope="col">Columns</th>
                <th scope="col">Reference</th>
                <th scope="col">Method</th>
                <th scope="col">On Update</th>
                <th scope="col">On Delete</th>
                <th scope="col" class="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#if constraints.length === 0}
                <tr>
                  <td colspan="8" class="empty">No non-primary constraints defined.</td>
                </tr>
              {:else}
                {#each constraints as constraint (constraint.id)}
                  <tr class={clsx({ error: constraint.errors.length > 0 })}>
                    <td>
                      <input
                        type="text"
                        value={constraint.name}
                        class:has-error={constraint.errors.some((e) => e.includes('name'))}
                        on:input={(e) => handleConstraintNameInput(constraint, e)}
                      >
                    </td>
                    <td>
                      <select value={constraint.type} on:change={(e) => handleConstraintTypeChange(constraint, e)}>
                        <option value="index">Index</option>
                        <option value="uniqueIndex">Unique index</option>
                        <option value="foreignKey">Foreign key</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={constraint.columns.join(', ')}
                        class:has-error={constraint.errors.some((e) => e.includes('column'))}
                        placeholder="column_a, column_b"
                        on:input={(e) => handleConstraintColumnsInput(constraint, e)}
                      >
                    </td>
                    <td>
                      {#if constraint.type === 'foreignKey'}
                        <div class="fk-reference-group">
                          <input
                            type="text"
                            value={constraint.referencedSchema ?? ''}
                            placeholder="schema"
                            on:input={(e) => handleConstraintReferencedSchemaInput(constraint, e)}
                          >
                          <input
                            type="text"
                            value={constraint.referencedTable ?? ''}
                            placeholder="table"
                            on:input={(e) => handleConstraintReferencedTableInput(constraint, e)}
                          >
                          <input
                            type="text"
                            value={constraint.referencedColumns.join(', ')}
                            placeholder="col1, col2"
                            on:input={(e) => handleConstraintReferencedColumnsInput(constraint, e)}
                          >
                        </div>
                      {/if}
                    </td>
                    <td>
                      {#if constraint.type !== 'foreignKey'}
                        <select value={constraint.method ?? ''} on:change={(e) => handleConstraintMethodChange(constraint, e)}>
                          <option value="">(default btree)</option>
                          {#each typeOptions as opt}
                            <option value={opt}>{opt}</option>
                          {/each}
                        </select>
                      {/if}
                    </td>
                    <td>
                      {#if constraint.type === 'foreignKey'}
                        <select value={constraint.onUpdate ?? ''} on:change={(e) => handleConstraintOnUpdateChange(constraint, e)}>
                          <option value="NO ACTION">NO ACTION</option>
                          <option value="CASCADE">CASCADE</option>
                          <option value="SET NULL">SET NULL</option>
                          <option value="SET DEFAULT">SET DEFAULT</option>
                        </select>
                      {/if}
                    </td>
                    <td>
                      {#if constraint.type === 'foreignKey'}
                        <select value={constraint.onDelete ?? ''} on:change={(e) => handleConstraintOnDeleteChange(constraint, e)}>
                          <option value="NO ACTION">NO ACTION</option>
                          <option value="CASCADE">CASCADE</option>
                          <option value="SET NULL">SET NULL</option>
                          <option value="SET DEFAULT">SET DEFAULT</option>
                        </select>
                      {/if}
                    </td>
                    <td class="actions">
                      <div class="row-actions">
                        <button type="button" class="ps-btn ps-btn--ghost" on:click={() => removeConstraint(constraint)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </section>
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

  .designer-alert--info {
    background: color-mix(in srgb, var(--ps-accent-muted) 18%, transparent);
    border-color: var(--ps-accent-border);
  }

  .info-grid {
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    gap: var(--ps-spacing-lg);
    align-items: end;
  }

  .info-grid label span {
    display: block;
    margin-bottom: var(--ps-spacing-2xs);
    color: var(--ps-text-secondary);
  }

  .info-summary {
    color: var(--ps-text-secondary);
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

  tr.error td {
    background: color-mix(in srgb, var(--ps-danger-bg) 35%, transparent);
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

  @media (max-width: 1024px) {
    .designer-grid {
      grid-template-columns: 1fr;
    }

    .designer-sidebar {
      order: -1;
    }
  }
</style>
