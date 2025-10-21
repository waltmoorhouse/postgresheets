// Minimal Svelte runtime stub for tests. Provide a createEventDispatcher that
// integrates with the very small init() stub in our svelte-internal mock by
// reading and calling globalThis.__SVELTE_CURRENT_COMPONENT__.__emit when a
// dispatched event occurs.
export function createEventDispatcher() {
  return (type, detail) => {
    const current = globalThis.__SVELTE_CURRENT_COMPONENT__;
    if (current && typeof current.__emit === 'function') {
      try {
        current.__emit(type, detail);
      } catch (e) {
        // swallow in tests
      }
    }
  };
}

export const onMount = (fn) => { if (typeof fn === 'function') { try { fn(); } catch {} } };
export const afterUpdate = (fn) => { /* no-op for tests */ };
export const beforeUpdate = (fn) => { /* no-op for tests */ };
export const onDestroy = (fn) => { /* no-op for tests */ };
export const tick = async () => Promise.resolve();

// provide re-exports commonly imported from 'svelte'
export { getContext, setContext } from './__svelte_context_stub.mjs';
