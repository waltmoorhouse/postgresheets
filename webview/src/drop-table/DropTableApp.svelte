<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    VSCodeApi,
    DropTableInitialState,
    DropTablePreviewPayload
  } from '$lib/types';

  export let vscode: VSCodeApi | undefined;
  export let initialState: unknown;

  let schemaName = '';
  let tableName = '';
  let cascade = false;
  let manualSql = '';
  let sqlPreview = '';
  let warnings: string[] = [];
  let previewLoading = false;
  let executing = false;
  let executionMessage = '';
  let executionError = '';

  function ensureVscode(): VSCodeApi {
    if (!vscode) {
      throw new Error('VS Code API unavailable.');
    }
    return vscode;
  }

  function initialize(state: DropTableInitialState): void {
    schemaName = state.schemaName;
    tableName = state.tableName;
    cascade = state.defaultCascade ?? false;
    manualSql = state.sql ?? '';
    sqlPreview = state.sql ?? '';
    warnings = state.warnings ?? [];
    executing = false;
    executionMessage = '';
    executionError = '';
  }

  if (initialState && typeof initialState === 'object') {
    initialize(initialState as DropTableInitialState);
  }

  function serializePayload(): DropTablePreviewPayload {
    return {
      schemaName,
      tableName,
      cascade
    };
  }

  function requestPreview(): void {
    previewLoading = true;
    warnings = [];
    ensureVscode().postMessage({
      command: 'dropTablePreview',
      payload: serializePayload()
    });
  }

  function handleCascadeToggle(event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    cascade = Boolean(target?.checked);
    requestPreview();
  }

  function handleExecute(): void {
    executing = true;
    executionMessage = '';
    executionError = '';

    ensureVscode().postMessage({
      command: 'dropTableExecute',
      payload: {
        ...serializePayload(),
        sql: manualSql
      }
    });
  }

  function handleMessage(event: MessageEvent): void {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.command) {
      case 'dropTablePreview': {
        const payload = message.payload as { sql: string; warnings?: string[] };
        sqlPreview = payload.sql;
        manualSql = payload.sql;
        warnings = payload.warnings ?? [];
        previewLoading = false;
        break;
      }
      case 'dropTableExecuteComplete':
        executing = false;
        if (message.success) {
          executionMessage = 'Table dropped successfully.';
          executionError = '';
        } else {
          executionError = message.error ? String(message.error) : 'Failed to drop table.';
          executionMessage = '';
        }
        break;
      default:
        break;
    }
  }

  onMount(() => {
    requestPreview();
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<div class="drop-container">
  <header>
    <h2>Drop table</h2>
    <p>{schemaName}.<span>{tableName}</span></p>
  </header>

  <section class="drop-body">
    <label class="cascade-toggle">
      <input type="checkbox" checked={cascade} on:change={handleCascadeToggle}>
      <span>Include CASCADE to drop dependent objects</span>
    </label>

    {#if warnings.length > 0}
      <div class="warning">
        <ul>
          {#each warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="sql-preview">
      <header>
        <h3>SQL Preview</h3>
      </header>
      {#if previewLoading}
        <p class="preview-status">Generating preview…</p>
      {/if}
      <textarea bind:value={manualSql} spellcheck={false} rows="10"></textarea>
    </div>
  </section>

  <footer class="drop-actions">
    <button type="button" class="ps-btn ps-btn--ghost" on:click={requestPreview} disabled={previewLoading}>
      Refresh preview
    </button>
    <button type="button" class="ps-btn ps-btn--danger" on:click={handleExecute} disabled={executing}>
      {executing ? 'Dropping…' : 'Drop table'}
    </button>
  </footer>

  <div class="execution-feedback">
    {#if executionMessage}
      <div class="message success">{executionMessage}</div>
    {/if}
    {#if executionError}
      <div class="message error">{executionError}</div>
    {/if}
  </div>
</div>

<style>
  .drop-container {
    padding: var(--ps-spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-lg);
  }

  header h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  header p {
    margin: var(--ps-spacing-2xs) 0 0;
    color: var(--ps-text-secondary);
  }

  header span {
    color: var(--ps-accent-foreground);
    background: var(--ps-accent-muted);
    padding: 0 var(--ps-spacing-xs);
    border-radius: var(--ps-radius-sm);
  }

  .drop-body {
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-lg);
  }

  .cascade-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--ps-spacing-sm);
  }

  .warning {
    border: 1px solid var(--ps-danger-border);
    background: var(--ps-danger-bg);
    border-radius: var(--ps-radius-md);
    padding: var(--ps-spacing-md);
  }

  .sql-preview {
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-lg);
    background: var(--ps-surface);
    padding: var(--ps-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-md);
  }

  .sql-preview textarea {
    width: 100%;
    border-radius: var(--ps-radius-md);
    border: 1px solid var(--ps-border);
    background: var(--vscode-terminal-background, #1e1e1e);
    color: var(--vscode-terminal-foreground, inherit);
    padding: var(--ps-spacing-md);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85rem;
    min-height: 220px;
  }

  .drop-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
</style>
