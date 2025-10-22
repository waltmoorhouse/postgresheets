<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ColumnInfo } from '$lib/types';

  export let items: { name: string; type: string; visible: boolean }[] = [];

  const dispatch = createEventDispatcher();
  let dragIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let saveButtonRef: HTMLButtonElement | null = null;

  // Use a local copy of items for UI interactions; emit changes to parent
  let localItems = items.map(i => ({ ...i }));
  $: if (Array.isArray(items)) {
    // update local copy when parent provides a different items array
    const same = items.length === localItems.length && items.every((it, idx) => it.name === localItems[idx]?.name && it.visible === localItems[idx]?.visible);
    if (!same) {
      localItems = items.map(i => ({ ...i }));
    }
  }

  function emitChange() {
    // Changes are only committed when Save is clicked, not during preview
    // This ensures Cancel reverts all changes (both visibility and reordering)
  }

  function toggle(name: string) {
    const idx = localItems.findIndex(i => i.name === name);
    if (idx >= 0) {
      localItems[idx].visible = !localItems[idx].visible;
      // Don't emit - wait for Save
    }
  }

  function moveUp(idx: number) {
    if (idx <= 0) return;
    const copy = localItems.slice();
    const tmp = copy[idx - 1];
    copy[idx - 1] = copy[idx];
    copy[idx] = tmp;
    localItems = copy;
    announcement = `${localItems[idx - 1].name} moved up`;
  }

  function moveDown(idx: number) {
    if (idx >= localItems.length - 1) return;
    const copy = localItems.slice();
    const tmp = copy[idx + 1];
    copy[idx + 1] = copy[idx];
    copy[idx] = tmp;
    localItems = copy;
    announcement = `${localItems[idx + 1].name} moved down`;
  }

  function save() {
    // Provide the parent component with the final items array so it can
    // persist the user's preferences without relying on separate 'change'
    // events having been emitted.
    dispatch('save', { items: localItems.slice() });
  }

  function reset() {
    dispatch('reset');
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch('cancel');
    }
  }

  function onDragStart(event: DragEvent, idx: number) {
    dragIndex = idx;
    try {
      event.dataTransfer?.setData('text/plain', String(idx));
      event.dataTransfer!.effectAllowed = 'move';
      // mark the handle as grabbed for assistive tech
      try {
        const el = event.currentTarget as HTMLElement | null;
        if (el) el.setAttribute('aria-grabbed', 'true');
      } catch {}
    } catch {}
  }

  function onDragOver(event: DragEvent, idx: number) {
    event.preventDefault();
    dragOverIndex = idx;
  }

  function onDrop(event: DragEvent, idx: number) {
    event.preventDefault();
    const from = dragIndex ?? Number(event.dataTransfer?.getData('text/plain'));
    const to = idx;
    if (from === to || from < 0 || to < 0) {
      dragIndex = null;
      dragOverIndex = null;
      return;
    }
    const copy = localItems.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    localItems = copy;
    // announce the move
    announcement = `${moved.name} moved to position ${to + 1}`;
    dragIndex = null;
    dragOverIndex = null;
  }

  function onDragEnd(event?: DragEvent) {
    // if we have an event from the handle, clear aria-grabbed
    try {
      if (event && event.currentTarget) {
        const el = event.currentTarget as HTMLElement | null;
        if (el) el.removeAttribute('aria-grabbed');
      }
    } catch {}
    dragIndex = null;
    dragOverIndex = null;
  }

  let announcement = '';

  // Focus the Save button on mount so keyboard users have a clear action
  onMount(() => {
    if (saveButtonRef) {
      saveButtonRef.focus();
    }
  });
</script>

<div class="column-manager" on:keydown={handleEscape} role="presentation">
  <ul class="column-manager-list" role="list">
    {#each localItems as item, idx}
      <li
        class="column-manager-item"
        class:drag-over={dragOverIndex === idx}
        role="listitem"
  on:dragover={(e) => onDragOver(e, idx)}
  on:drop={(e) => onDrop(e, idx)}
      >
        <label>
          <input type="checkbox" checked={item.visible} on:change={() => toggle(item.name)} aria-label={`Toggle visibility for ${item.name}`}>
          {item.name}
        </label>
        <div class="column-manager-controls">
          <!-- Drag handle replaces up/down controls; handle is draggable and keyboard focusable -->
          <button
            type="button"
            class="drag-handle ps-btn ps-btn--icon"
            draggable="true"
            aria-label={`Reorder ${item.name}. Press Alt+ArrowUp or Alt+ArrowDown to move.`}
            on:dragstart={(e) => onDragStart(e, idx)}
            on:dragend={(e) => onDragEnd(e)}
            on:keydown={(e) => {
              if (e.key === 'ArrowUp' && (e.altKey)) { moveUp(idx); e.preventDefault(); }
              else if (e.key === 'ArrowDown' && (e.altKey)) { moveDown(idx); e.preventDefault(); }
            }}
            title="Drag to reorder — Alt+Up / Alt+Down to move via keyboard"
          >
            ☰
          </button>
        </div>
      </li>
    {/each}
  </ul>

  <!-- Live region for screen reader announcements when reordering -->
  <div aria-live="polite" class="sr-only">{announcement}</div>
  <div class="modal-actions" role="group">
    <button
      type="button"
      class="ps-btn ps-btn--primary"
      bind:this={saveButtonRef}
      on:click={save}
      title="Save column preferences (Enter or Alt+S)"
    >
      Save
    </button>
    <button
      type="button"
      class="ps-btn ps-btn--ghost"
      on:click={() => dispatch('cancel')}
      title="Close without saving (Escape)"
    >
      Cancel
    </button>
    <button type="button" class="ps-btn ps-btn--link" on:click={reset}>Reset to defaults</button>
  </div>
</div>

<style>
  .column-manager-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ps-spacing-sm);
    max-height: 40vh;
    overflow: auto;
  }

  .column-manager-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ps-spacing-sm);
    padding: var(--ps-spacing-xs) var(--ps-spacing-sm);
    border-radius: var(--ps-radius-sm);
    background: var(--ps-surface-muted);
    border: 1px solid transparent;
  }

  .column-manager-item.drag-over {
    border-color: var(--ps-focus-ring);
    box-shadow: 0 1px 0 rgba(0,0,0,0.08) inset;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--ps-spacing-sm);
  }

  /* Drag handle styling */
  .drag-handle {
    cursor: grab;
    user-select: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 16px;
  }

  .drag-handle:focus {
    outline: 2px solid var(--ps-focus-ring);
    outline-offset: 2px;
  }

  /* Visual polish for drag handle */
  .drag-handle:hover {
    background: color-mix(in srgb, var(--ps-accent) 6%, transparent);
    border-color: var(--ps-border);
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0,0,0,0.06);
  }

  .drag-handle:active {
    cursor: grabbing;
    transform: translateY(0);
    box-shadow: none;
  }

  .sr-only {
    position: absolute !important;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
