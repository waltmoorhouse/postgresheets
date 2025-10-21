// Test utilities for simulating drag & drop in jsdom.
// jsdom has limited built-in DragEvent/DataTransfer support so we provide
// a small, reliable harness that mimics the parts of DataTransfer used by
// our components (setData/getData/effectAllowed/dropEffect/types).

export function createDataTransfer() {
  const store: Record<string, string> = {};
  const types: string[] = [];

  return {
    setData(format: string, data: string) {
      store[format] = data;
      if (!types.includes(format)) types.push(format);
    },
    getData(format: string) {
      return store[format] ?? '';
    },
    clearData() {
      for (const k of Object.keys(store)) delete store[k];
      types.length = 0;
    },
    effectAllowed: 'all' as const,
    dropEffect: 'move' as const,
    files: [],
    types,
  } as unknown as DataTransfer;
}

function makeEvent(type: string, dataTransfer: DataTransfer) {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  // attach the dataTransfer object -- in jsdom this isn't provided by the
  // native DragEvent constructor reliably, so we explicitly attach it.
  try {
    Object.defineProperty(evt, 'dataTransfer', { value: dataTransfer });
  } catch (e) {
    // fallback for environments that disallow defining new properties
    (evt as any).dataTransfer = dataTransfer;
  }
  return evt;
}

export async function simulateDragAndDrop(source: Element, target: Element) {
  const dt = createDataTransfer();

  // dispatch dragstart on the handle/source
  const dragStart = makeEvent('dragstart', dt);
  source.dispatchEvent(dragStart);

  // Some handlers check dragenter before dragover
  const dragEnter = makeEvent('dragenter', dt);
  target.dispatchEvent(dragEnter);

  const dragOver = makeEvent('dragover', dt);
  target.dispatchEvent(dragOver);

  const drop = makeEvent('drop', dt);
  target.dispatchEvent(drop);

  const dragEnd = makeEvent('dragend', dt);
  source.dispatchEvent(dragEnd);

  return dt;
}

export async function simulateDragSteps(source: Element, target: Element) {
  // Expose lower-level steps for tests that want to assert intermediate state
  const dt = createDataTransfer();
  const start = makeEvent('dragstart', dt);
  source.dispatchEvent(start);
  const enter = makeEvent('dragenter', dt);
  target.dispatchEvent(enter);
  const over = makeEvent('dragover', dt);
  target.dispatchEvent(over);
  return { dt, start, enter, over };
}
