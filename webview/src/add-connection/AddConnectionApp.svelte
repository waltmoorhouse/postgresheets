<script lang="ts">
  import { onMount } from 'svelte';
  import type { VSCodeApi } from '$lib/types';

  export let vscode: VSCodeApi | undefined;
  export let initialState: any = {};

  import PsButton from '$lib/components/PsButton.svelte';
  import Field from '$lib/components/Field.svelte';

  let name = initialState.name || '';
  let mode: 'connectionString' | 'manual' = initialState.mode || 'connectionString';
  let connStr = '';
  let password = initialState.password || '';

  let host = initialState.host || '';
  let port = initialState.port ? String(initialState.port) : '5432';
  let database = initialState.database || '';
  let username = initialState.username || '';
  let passwordManual = initialState.password || '';
  let ssl = initialState.ssl || false;

  let status = '';
  let statusKind: 'info' | 'error' | 'success' | '' = '';
  let pending = false;
  let previousMode: 'connectionString' | 'manual' = mode;
  
  let editMode = initialState.editMode || false;
  let connectionId = initialState.id || undefined;

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

  $: canTest = !pending && ((mode === 'connectionString' && connStrError === '') || (mode === 'manual' && Object.values(manualErrors).every(v => !v)));
  $: canSave = canTest && name.trim().length > 0;

  function ensureVscode() {
    if (!vscode) throw new Error('VS Code API unavailable');
    return vscode;
  }

  function parseConnectionString(value: string) {
    const input = value.trim();
    if (!input) return null;
    try {
      const url = new URL(input);
      const databaseName = url.pathname.replace(/^\//, '');
      return {
        host: url.hostname,
        port: url.port || '5432',
        database: decodeURIComponent(databaseName),
        username: decodeURIComponent(url.username || ''),
        password: decodeURIComponent(url.password || ''),
        ssl: url.searchParams.get('sslmode') === 'require'
      };
    } catch {
      return null;
    }
  }

  function buildConnectionStringFromManual() {
    const trimmedHost = host.trim();
    const trimmedPort = port.trim();
    const trimmedDatabase = database.trim();
    const trimmedUser = username.trim();

    if (!trimmedHost) {
      return null;
    }

    const scheme = /^postgresql?:\/\//i.test(connStr) ? connStr.match(/^postgresql?:\/\//i)?.[0]?.toLowerCase() ?? 'postgresql://' : 'postgresql://';
    const userPart = trimmedUser ? encodeURIComponent(trimmedUser) : '';
    const passwordPart = passwordManual ? `:${encodeURIComponent(passwordManual)}` : '';
    const auth = userPart ? `${userPart}${passwordPart}@` : '';
    const portValue = Number(trimmedPort);
    const portPart = !Number.isNaN(portValue) && portValue > 0 ? `:${portValue}` : '';
    const hostPart = trimmedHost.includes(':') && !trimmedHost.startsWith('[') && !trimmedHost.endsWith(']') ? `[${trimmedHost}]` : trimmedHost;
    const dbPart = trimmedDatabase ? `/${encodeURIComponent(trimmedDatabase)}` : '';
    const sslPart = ssl ? '?sslmode=require' : '';

    return `${scheme.replace(/\/\/$/, '')}//${auth}${hostPart}${portPart}${dbPart}${sslPart}`;
  }

  $: if (mode !== previousMode) {
    if (mode === 'manual') {
      const parsed = parseConnectionString(connStr);
      if (parsed) {
        host = parsed.host || '';
        port = parsed.port || '5432';
        database = parsed.database || '';
        username = parsed.username || '';
        passwordManual = parsed.password || '';
        ssl = parsed.ssl;
        password = parsed.password || password;
      }
    } else {
      const built = buildConnectionStringFromManual();
      if (built) {
        connStr = built;
      }
      password = passwordManual;
    }
    previousMode = mode;
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
      const api = ensureVscode();
      api.postMessage({ command: 'testConnection', payload: collectPayload() });
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
    try {
      const payload = collectPayload();
      const trimmedName = name.trim();
      if (!trimmedName) {
        status = 'Name is required to save';
        statusKind = 'error';
        pending = false;
        return;
      }
      payload.name = trimmedName;
      payload.editMode = editMode;
      payload.id = connectionId;
      const api = ensureVscode();
      api.postMessage({ command: 'saveConnection', payload });
    } catch (err) {
      status = String(err);
      statusKind = 'error';
    }
  }

  function cancel() {
    try {
      ensureVscode().postMessage({ command: 'cancel' });
    } catch (err) {
    }
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
  <h2>{editMode ? 'Edit Connection' : 'Add Connection'}</h2>
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
