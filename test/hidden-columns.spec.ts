import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import HiddenColumnsModal from '../webview/src/HiddenColumnsModal.svelte';
  test('emits show and showAll events', async () => {
  const hidden = ['secret', 'pw'];
  const { getByText, getByLabelText, component } = render(HiddenColumnsModal, { hidden });
    const shows: any[] = [];
    let showAll = false;
    component.$on('show', (e: CustomEvent) => shows.push(e.detail.name));
    component.$on('showAll', () => (showAll = true));
  // Click the first hidden column's 'Show' button using its aria-label
  await fireEvent.click(getByLabelText('Show secret'));
    expect(shows.length).toBeGreaterThan(0);
    await fireEvent.click(getByText('Show all'));
    expect(showAll).toBe(true);
  });

  test('Alt+R triggers showAll keyboard shortcut', async () => {
    const hidden = ['secret'];
    const { getByText, component, container } = render(HiddenColumnsModal, { hidden });
    let showAll = false;
    component.$on('showAll', () => (showAll = true));
  await fireEvent.keyDown(container.querySelector('.modal')!, { key: 'r', altKey: true });
  await tick();
  expect(showAll).toBe(true);
  });

  test('help button toggles keyboard shortcuts and Alt+H toggles help', async () => {
    const hidden = ['secret'];
  const { getByRole, container } = render(HiddenColumnsModal, { hidden });
  const helpButton = getByRole('button', { name: /Keyboard shortcuts/ });
    // Initially hidden
  const shortcuts = container.querySelector('#shortcuts') as HTMLElement | null;
  expect(shortcuts).not.toBeNull();
  // Hidden attribute is more consistent in jsdom than computed visibility
  if (shortcuts) expect(shortcuts.hasAttribute('hidden')).toBe(true);
  await fireEvent.click(helpButton);
  await tick();
  if (shortcuts) expect(shortcuts.hasAttribute('hidden')).toBe(false);
  // Alt+H should toggle
  await fireEvent.keyDown(container.querySelector('.modal')!, { key: 'h', altKey: true });
  await tick();
  if (shortcuts) expect(shortcuts.hasAttribute('hidden')).toBe(true);
  });

// Duplicate unguarded test removed; covered in guarded block above
