<script lang="ts">
  import { onMount } from 'svelte';
  export let vscode: any;
  export let initialState: any;

  interface Entry {
    id: string;
    query: string;
    timestamp: number;
    connectionId: string;
    connectionName: string;
    databaseName?: string;
    executionTime?: number;
  }

  let entries: Entry[] = [];
  let activeConnectionIds: string[] = [];

  function formatDate(ts: number) {
    const date = new Date(ts);
    const now = Date.now();
    const diff = Math.floor((now - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function canOpenInEditor(query: string) {
    const trimmed = query.trim();
    if (!/^SELECT\s+/i.test(trimmed)) return false;
    if (/\bJOIN\b|\bUNION\b|\bWITH\b|\(SELECT\b/i.test(trimmed)) return false;
    if (!/\bFROM\s+/i.test(trimmed)) return false;
    return true;
  }

  function refresh() {
    vscode?.postMessage({ command: 'refresh' });
  }

  function clearAll() {
    vscode?.postMessage({ command: 'clear' });
  }

  function copyQuery(q: string) {
    vscode?.postMessage({ command: 'copy', query: q });
  }

  function deleteEntry(id: string) {
    vscode?.postMessage({ command: 'delete', id });
  }

  function openInEditor(entry: Entry) {
    vscode?.postMessage({ command: 'openInEditor', entry });
  }

  onMount(() => {
    // Signal ready
    console.log('[QueryHistory webview] mounted');
    vscode?.postMessage({ command: 'ready' });

    window.addEventListener('message', (ev: MessageEvent) => {
      const message = ev.data;
      if (!message || typeof message.command !== 'string') return;
      switch (message.command) {
        case 'loadHistory':
          activeConnectionIds = message.activeConnectionIds || [];
          entries = message.entries || [];
          // Ack
          try {
            vscode?.postMessage({ command: 'historyLoaded', pingId: message.pingId, count: entries.length });
          } catch (e) {
            // ignore
          }
          break;
      }
    });
  });
</script>

<style>
  .toolbar { display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--vscode-panel-border); }
  .toolbar .buttons { display:flex; gap:8px; }
  .entry { padding:8px; border-bottom:1px solid var(--vscode-panel-border); }
  .query { font-family: var(--vscode-editor-font-family); white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding:6px; border-radius:4px; }
  .meta { font-size:11px; color:var(--vscode-descriptionForeground); }
  button { font-size:12px; }
</style>

<div class="toolbar">
  <div>Query History</div>
  <div class="buttons">
    <button on:click={refresh}>🔄 Refresh</button>
    <button on:click={clearAll}>🗑️ Clear</button>
  </div>
</div>

{#if entries.length === 0}
  <div class="empty-state" style="padding:24px; text-align:center; color:var(--vscode-descriptionForeground);">No query history yet</div>
{:else}
  <div>
    {#each entries as entry (entry.id)}
      <div class="entry" data-entry-id={entry.id}>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="meta"><strong>{entry.connectionName}</strong>{entry.databaseName ? ` @ ${entry.databaseName}` : ''}</div>
          <div class="meta">{formatDate(entry.timestamp)}{entry.executionTime ? ` • ${entry.executionTime}ms` : ''}</div>
        </div>
        <div class="query">{entry.query}</div>
        <div style="margin-top:6px; display:flex; gap:8px;">
          {#if canOpenInEditor(entry.query)}<button on:click={() => openInEditor(entry)}>📊 Open</button>{/if}
          <button on:click={() => copyQuery(entry.query)}>📋 Copy</button>
          <button on:click={() => deleteEntry(entry.id)}>🗑️ Delete</button>
        </div>
      </div>
    {/each}
  </div>
{/if}
