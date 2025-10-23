import AddConnectionApp from './AddConnectionApp.svelte';
import '../app.css';

const target = document.getElementById('app');
if (!target) throw new Error('No root');
target.innerHTML = '';

const vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : undefined;

const app = new AddConnectionApp({
  target,
  props: { vscode, initialState: window.initialState }
});

export default app;
