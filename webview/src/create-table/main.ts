import '../app.css';
import CreateTableApp from './CreateTableApp.svelte';
import type { VSCodeApi, CreateTableInitialState } from '$lib/types';

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeApi;
    initialState?: Record<string, unknown>;
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Failed to locate webview root element.');
}

const vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : undefined;
const initialState = (window.initialState ?? {}) as unknown as CreateTableInitialState;

if (initialState.view !== 'createTable') {
  console.warn('Unexpected initial state payload for create table flow.', window.initialState);
}

const app = new CreateTableApp({
  target,
  hydrate: true,
  props: {
    vscode,
    initialState
  }
});

export default app;
