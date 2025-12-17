import QueryHistoryApp from '../QueryHistory.svelte';
import '../app.css';

const target = document.getElementById('app');
if (!target) throw new Error('No root element for QueryHistory');

target.innerHTML = '';

const vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : undefined;

const app = new QueryHistoryApp({
  target,
  props: { vscode, initialState: window.initialState }
});

export default app;
