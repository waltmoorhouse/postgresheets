import '../app.css';
import DropTableApp from './DropTableApp.svelte';
import type { VSCodeApi, DropTableInitialState } from '$lib/types';

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
const initialState = (window.initialState ?? {}) as unknown as DropTableInitialState;

if (initialState.view !== 'dropTable') {
  console.warn('Unexpected initial state payload for drop table flow.', window.initialState);
}

const app = new DropTableApp({
  target,
  hydrate: true,
  props: {
    vscode,
    initialState
  }
});

export default app;
