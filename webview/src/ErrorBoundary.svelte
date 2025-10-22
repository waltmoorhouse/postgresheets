<script lang="ts">
  /**
   * ErrorBoundary.svelte - Error boundary component for graceful error handling
   *
   * Catches JavaScript errors in child components and displays a user-friendly
   * error message with recovery options, preventing the entire webview from crashing.
   */

  import { onMount } from 'svelte';

  export let children: any;

  let error: Error | null = null;
  let hasError = false;

  interface VsCodeApi {
    postMessage(message: Record<string, unknown>): void;
  }

  let vsCodeApi: VsCodeApi | undefined;

  onMount(() => {
    // Acquire VS Code API if available
    if (typeof acquireVsCodeApi !== 'undefined') {
      vsCodeApi = acquireVsCodeApi();
    }

    // Set up global error handler for uncaught errors
    const handleError = (event: ErrorEvent) => {
      error = event.error || new Error('Unknown error occurred');
      hasError = true;

      // Notify extension of error
      if (vsCodeApi) {
        vsCodeApi.postMessage({
          command: 'webviewError',
          error: {
            message: error.message,
            stack: error.stack,
            code: 'UNCAUGHT'
          }
        });
      }

      // Prevent default error handling to avoid showing browser error UI
      event.preventDefault();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      error =
        reason instanceof Error ? reason : new Error(String(reason));
      hasError = true;

      // Notify extension of error
      if (vsCodeApi) {
        vsCodeApi.postMessage({
          command: 'webviewError',
          error: {
            message: error.message,
            stack: error.stack,
            code: 'UNHANDLED_REJECTION'
          }
        });
      }

      // Prevent default handling
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  });

  function resetError() {
    error = null;
    hasError = false;
  }

  function reloadPage() {
    window.location.reload();
  }
</script>

{#if hasError && error}
  <div class="error-boundary" role="alert" aria-live="assertive">
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <div class="error-content">
        <h2>Something went wrong</h2>
        <p class="error-message">{error.message}</p>
        {#if error.stack}
          <details class="error-stack">
            <summary>Error details</summary>
            <pre>{error.stack}</pre>
          </details>
        {/if}
        <div class="error-actions">
          <button
            type="button"
            class="btn btn-primary"
            on:click={resetError}
            aria-label="Try again by clearing the error"
          >
            Try Again
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            on:click={reloadPage}
            aria-label="Reload the page to reset state"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  </div>
{:else}
  <slot />
{/if}

<style>
  :global {
    .error-boundary {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100vh;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }

    .error-container {
      display: flex;
      align-items: flex-start;
      gap: 1.5rem;
      padding: 2rem;
      background-color: var(--vscode-editorError-background);
      border: 1px solid var(--vscode-editorError-foreground);
      border-radius: 4px;
      max-width: 600px;
      width: 90%;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .error-icon {
      font-size: 2rem;
      flex-shrink: 0;
    }

    .error-content {
      flex: 1;
    }

    .error-content h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      color: var(--vscode-editorError-foreground);
    }

    .error-message {
      margin: 0.5rem 0;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .error-stack {
      margin-top: 1rem;
      padding: 0.5rem;
      background-color: var(--vscode-editor-background);
      border-radius: 3px;
      border: 1px solid var(--vscode-editorError-foreground);
      opacity: 0.7;
    }

    .error-stack summary {
      cursor: pointer;
      font-weight: 500;
      user-select: none;
      padding: 0.25rem 0;
    }

    .error-stack summary:hover {
      text-decoration: underline;
    }

    .error-stack pre {
      margin: 0.5rem 0 0 0;
      padding: 0.5rem;
      font-size: 0.85rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .error-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      font-size: 0.95rem;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      transition: opacity 0.2s;
      font-family: var(--vscode-font-family);
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .btn-primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
  }
</style>
