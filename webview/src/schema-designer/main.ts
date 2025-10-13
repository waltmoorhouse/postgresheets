import '../app.css';
import SchemaDesignerApp from './SchemaDesignerApp.svelte';

declare global {
  interface Window {
    acquireVsCodeApi?: () => {
      postMessage: (message: unknown) => void;
      getState<T>(): T | undefined;
      setState<T>(state: T): void;
    };
    initialState?: Record<string, unknown>;
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Failed to locate schema designer root element.');
}

const vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : undefined;

const app = new SchemaDesignerApp({
  target,
  hydrate: true,
  props: {
    vscode,
    initialState: window.initialState
  }
});

export default app;
