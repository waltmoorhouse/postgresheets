<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let hidden: string[] = [];

  const dispatch = createEventDispatcher();

  import FocusTrap from '$lib/components/FocusTrap.svelte';

  function handleFocusTrapEscape(): void {
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    // Only handle keydown if it originated from within the dialog
    if (!dialogElement || !dialogElement.contains(e.target as Node)) {
      return;
    }
    // Alt+R to restore all
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      if ((hidden ?? []).length > 0) {
        showAll();
        e.preventDefault();
      }
    }
    // Alt+H to toggle help
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
      showHelp = !showHelp;
      e.preventDefault();
    }
  }

  function show(name: string) {
    dispatch('show', { name });
  }

  function showAll() {
    dispatch('showAll');
  }

  function close() {
    dispatch('close');
  }

  let showHelp = false;
  let shortcutsHeading: HTMLElement | null = null;
  let dialogElement: HTMLElement | null = null;

  function toggleHelp() {
    showHelp = !showHelp;
    if (showHelp) {
      // Move focus to the shortcuts heading for screen reader users
      setTimeout(() => shortcutsHeading?.focus(), 0);
    }
  }
</script>

<div class="modal-backdrop">
  <FocusTrap ariaLabel="Hidden columns" on:escapepressed={handleFocusTrapEscape}>
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="modal dialog hidden-columns"
    role="dialog"
    aria-modal="true"
    aria-labelledby="hidden-columns-heading"
    aria-describedby="hidden-columns-description"
    bind:this={dialogElement}
    on:keydown|capture={handleKeydown}
  >
    <div class="modal-header">
      <h3 id="hidden-columns-heading">Hidden columns</h3>
  <button
        type="button"
        class="help-btn ps-btn ps-btn--icon"
        aria-expanded={showHelp}
        aria-controls="shortcuts"
        aria-label="Keyboard shortcuts"
        on:click={toggleHelp}
        title="Keyboard shortcuts (Alt+H)"
      >
        ?
      </button>
    </div>
    <p id="hidden-columns-description">These columns are currently hidden. You can restore them individually or show all.</p>
  <section id="shortcuts" class="shortcut-help" hidden={!showHelp} aria-hidden={!showHelp} aria-labelledby="shortcuts-heading">
    <h4 id="shortcuts-heading" bind:this={shortcutsHeading} tabindex="-1">Keyboard shortcuts</h4>
      <ul>
        <li><strong>Alt + R</strong>: Show all hidden columns</li>
        <li><strong>Alt + H</strong>: Toggle this help</li>
        <li><strong>Esc</strong>: Close modal</li>
        <li><strong>Alt + ↑ / Alt + ↓</strong>: Move column when the drag handle is focused</li>
      </ul>
  </section>
    {#if hidden && hidden.length > 0}
      <ul class="hidden-list">
        {#each hidden as name}
          <li>
            <span>{name}</span>
            <button type="button" class="ps-btn" aria-label={`Show ${name}`} on:click={() => show(name)}>Show</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">No hidden columns for this table.</p>
    {/if}
  <div class="modal-actions" role="group">
      <button type="button" class="ps-btn ps-btn--primary" on:click={showAll} disabled={!(hidden && hidden.length > 0)} title="Alt+R to show all">Show all</button>
      <button type="button" class="ps-btn ps-btn--ghost" on:click={close}>Close</button>
    </div>
    </div>
    </FocusTrap>
  </div>

<style>
  .hidden-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--ps-spacing-xs);
  }

  .hidden-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ps-spacing-xs) var(--ps-spacing-sm);
    border-radius: var(--ps-radius-sm);
    background: var(--ps-surface-muted);
    border: 1px solid transparent;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: var(--ps-spacing-sm);
    justify-content: space-between;
  }

  .help-btn {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: transparent;
    font-weight: 700;
  }

  .help-btn:hover {
    background: color-mix(in srgb, var(--ps-accent) 6%, var(--ps-surface-muted));
  }

  .shortcut-help {
    margin-top: var(--ps-spacing-sm);
    padding: var(--ps-spacing-sm);
    background: var(--ps-surface-subtle);
    border: 1px solid var(--ps-border);
    border-radius: var(--ps-radius-sm);
  }
</style>
