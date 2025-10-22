import { render, fireEvent } from '@testing-library/svelte';
import ColumnManager from '../webview/src/ColumnManager.svelte';
import { simulateDragAndDrop, simulateDragSteps } from './utils/dragAndDrop';

  test('toggles visibility and emits change', async () => {
    const items = [{ name: 'id', type: 'int', visible: true }, { name: 'secret', type: 'text', visible: false }];
    
    const { getByLabelText, component } = render(ColumnManager, { items });
    const changes: any[] = [];
    component.$on('change', (e: CustomEvent) => changes.push(e.detail.items));
    const toggle = getByLabelText('Toggle visibility for secret');
    await fireEvent.click(toggle);
    expect(changes.length).toBe(1);
    expect(changes[0][1].visible).toBe(true);
  });

  test('keyboard Alt+ArrowUp moves item up', async () => {
    const items = [{ name: 'a', type: 't', visible: true }, { name: 'b', type: 't', visible: true }];
    const { getAllByRole, component } = render(ColumnManager, { items });
    const changes: any[] = [];
    component.$on('change', (e: CustomEvent) => changes.push(e.detail.items));
    const handles = getAllByRole('button', { name: /Reorder/ });
    handles[1].focus();
    await fireEvent.keyDown(handles[1], { key: 'ArrowUp', altKey: true });
    expect(changes.length).toBe(1);
    expect(changes[0][0].name).toBe('b');
  });

  test('drag and drop reorders items (integration)', async () => {
    const items = [{ name: 'one', type: 't', visible: true }, { name: 'two', type: 't', visible: true }, { name: 'three', type: 't', visible: true }];
    const { container, component } = render(ColumnManager, { items });
    const changes: any[] = [];
    component.$on('change', (e: CustomEvent) => changes.push(e.detail.items));

    const listItems = container.querySelectorAll('.column-manager-item');
    const handle = listItems[0].querySelector('.drag-handle') as HTMLElement;
    const target = listItems[2] as HTMLElement;

    // Use our robust helper which wires DataTransfer onto events for jsdom
    await simulateDragAndDrop(handle, target);

    // The component emits a change with the new ordering after drop
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0][2].name).toBe('one');
  });

  test('drag start/over intermediate events allow visual feedback', async () => {
    const items = [{ name: 'x', type: 't', visible: true }, { name: 'y', type: 't', visible: true }];
    const { container } = render(ColumnManager, { items });
    const listItems = container.querySelectorAll('.column-manager-item');
    const handle = listItems[0].querySelector('.drag-handle') as HTMLElement;
    const target = listItems[1] as HTMLElement;

    const { dt, start, enter, over } = await simulateDragSteps(handle, target);
    // The target should receive dragover and script may set a drag-over class
    expect(over).toBeDefined();
    // clean up by dispatching drop/end
    target.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    handle.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

export {};
