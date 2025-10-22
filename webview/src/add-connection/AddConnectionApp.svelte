<script lang="ts">
  import { onMount } from 'svelte';
  import type { VSCodeApi } from '$lib/types';

  export let vscode: VSCodeApi | undefined;

  import PsButton from '$lib/components/PsButton.svelte';
  import Field from '$lib/components/Field.svelte';

  let name = '';
  let mode: 'connectionString' | 'manual' = 'connectionString';
  let connStr = '';
  let password = '';

  let host = '';
  let port = '5432';
  let database = '';
  let username = '';
  let passwordManual = '';
  let ssl = false;

  let status = '';
  let statusKind: 'info' | 'error' | 'success' | '' = '';
  let pending = false;

  $: nameError = name.trim().length === 0 ? 'Name is required' : '';

  $: connStrError = '';
  $: if (mode === 'connectionString') {
    if (!connStr || connStr.trim().length === 0) connStrError = 'Connection string is required';
    else if (!/^(postgres|postgresql):\/\//i.test(connStr.trim())) connStrError = 'Connection string should start with postgres:// or postgresql://';
    else connStrError = '';
  }

  $: manualErrors = { host: '', port: '', database: '', username: '' };
  $: if (mode === 'manual') {
    manualErrors.host = !host.trim() ? 'Host is required' : '';
    manualErrors.database = !database.trim() ? 'Database is required' : '';
    manualErrors.username = !username.trim() ? 'Username is required' : '';
    const p = Number(port);
    manualErrors.port = !port || Number.isNaN(p) || p <= 0 || p > 65535 ? 'Port must be a number between 1 and 65535' : '';
  }

  $: canTest = !pending && name.trim().length > 0 && ((mode === 'connectionString' && connStrError === '') || (mode === 'manual' && Object.values(manualErrors).every(v => !v)));
  $: canSave = canTest;

  function ensureVscode() {
    if (!vscode) throw new Error('VS Code API unavailable');
    return vscode;
  }

  function collectPayload() {
    if (mode === 'connectionString') {
      return { mode: 'connectionString', connStr, password };
    }
    return { mode: 'manual', host, port, database, username, password: passwordManual, ssl };
  }

  async function testConnection() {
    status = 'Testing...';
    statusKind = 'info';
    pending = true;
    try {
      ensureVscode().postMessage({ command: 'testConnection', payload: collectPayload() });
      // The extension will post back with testResult via window.postMessage, handled below.
    } catch (err) {
      status = String(err);
      statusKind = 'error';
    }
  }

  async function saveConnection() {
    status = 'Saving...';
    statusKind = 'info';
    pending = true;
    const payload = collectPayload();
    payload.name = name;
    ensureVscode().postMessage({ command: 'saveConnection', payload });
  }

  function cancel() {
    ensureVscode().postMessage({ command: 'cancel' });
  }

  function handleMessage(e: MessageEvent) {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.command === 'testResult') {
      const p = msg.payload;
      if (p.success) {
        status = 'Connection OK';
        statusKind = 'success';
      } else {
        status = 'Failed: ' + (p.error || 'Unknown error');
        statusKind = 'error';
      }
      pending = false;
    } else if (msg.command === 'saveResult') {
      const p = msg.payload;
      if (p.success) {
        status = 'Saved';
        statusKind = 'success';
      } else {
        status = 'Save failed: ' + (p.error || 'Unknown error');
        statusKind = 'error';
      }
      pending = false;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<style>
  .row { display:flex; gap:8px; }
  .muted { color: var(--vscode-disabledForeground); }
  .status { margin-top:8px; }
</style>

<div>
  <h2>Add Connection</h2>
  <Field label="Name" hint="A friendly name for this connection">
    <input id="name" bind:value={name} placeholder="My Database" />
  </Field>

  <fieldset>
    <legend>Entry Mode</legend>
    <div class="row">
      <label for="mode-connection"><input id="mode-connection" type="radio" bind:group={mode} value="connectionString" /> Connection string</label>
      <label for="mode-manual"><input id="mode-manual" type="radio" bind:group={mode} value="manual" /> Manual fields</label>
    </div>
  </fieldset>

  {#if mode === 'connectionString'}
  <label for="connStr">Connection string</label>
  <textarea id="connStr" bind:value={connStr} rows={3} placeholder="postgres://user:password@host:5432/db?sslmode=require"></textarea>
  <label for="password">Password (connection string mode)</label>
  <input id="password" type="password" bind:value={password} />
  {:else}
  <label for="host">Host</label>
  <input id="host" bind:value={host} placeholder="localhost" />
    <div class="row">
      <div style="flex:1">
  <label for="port">Port</label>
  <input id="port" bind:value={port} />
      </div>
      <div style="flex:1">
  <label for="database">Database</label>
  <input id="database" bind:value={database} placeholder="postgres" />
      </div>
    </div>
    <div class="row">
      <div style="flex:1">
  <label for="username">Username</label>
  <input id="username" bind:value={username} />
      </div>
      <div style="flex:1">
  <label for="passwordManual">Password</label>
  <input id="passwordManual" type="password" bind:value={passwordManual} />
      </div>
    </div>
    <label><input type="checkbox" bind:checked={ssl} /> SSL</label>
  {/if}

  <div class="status">
    <span class={statusKind === 'error' ? 'error' : statusKind === 'success' ? 'success' : 'muted'}>{status}</span>
  </div>

  <div style="margin-top:12px; display:flex; gap:8px">
    <PsButton on:click={testConnection} variant="ghost" disabled={!canTest}>Test Connection</PsButton>
    <PsButton on:click={saveConnection} variant="primary" disabled={!canSave}>Save</PsButton>
    <PsButton on:click={cancel} variant="link">Cancel</PsButton>
  </div>
</div>
