<script lang="ts">
  import { onMount } from 'svelte';

  /**
   * FocusTrap component: implements focus trapping for modals and dialogs.
   * - Sets focus to the first focusable element when mounted
   * - Traps focus within the modal (Tab cycles through focusable elements)
   * - Restores focus to the previously focused element when unmounted (via event listener on parent)
   * - Handles Escape key to close modal (emits 'escapepressed' event)
   */
  export let ariaLabel: string | undefined;
  
  let containerRef: HTMLDivElement | null = null;
  let previouslyFocused: HTMLElement | null = null;

  // Selectors for focusable elements
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function getFocusableElements(): HTMLElement[] {
    if (!containerRef) return [];
    return Array.from(containerRef.querySelectorAll(focusableSelectors)) as HTMLElement[];
  }

  function focusFirstElement(): void {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      containerRef?.dispatchEvent(new CustomEvent('escapepressed'));
      return;
    }

    if (event.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      let nextIndex = currentIndex + (event.shiftKey ? -1 : 1);

      if (nextIndex >= focusable.length) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
        nextIndex = focusable.length - 1;
      }

      event.preventDefault();
      focusable[nextIndex].focus();
    }
  }

  onMount(() => {
    // Store the previously focused element so we can restore it when the modal closes
    previouslyFocused = document.activeElement as HTMLElement;

    // Focus the first focusable element
    focusFirstElement();

    // Attach keydown listener to handle Tab and Escape
    if (containerRef) {
      containerRef.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      // Cleanup: remove listener and restore focus
      if (containerRef) {
        containerRef.removeEventListener('keydown', handleKeyDown);
      }
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus();
        } catch {
          // ignore if element no longer exists or cannot be focused
        }
      }
    };
  });
</script>

<div
  bind:this={containerRef}
  aria-label={ariaLabel}
  tabindex="-1"
  role="presentation"
>
  <slot />
</div>
