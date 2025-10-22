// Jest setup: enable @testing-library/jest-dom matchers for all tests.
// Try to require (CommonJS) first, fall back to dynamic import for ESM runtimes.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@testing-library/jest-dom/extend-expect');
} catch (err) {
  // In some ESM-based Jest setups, require may not be available. Use dynamic import.
  (async () => {
    await import('@testing-library/jest-dom/extend-expect');
  })();
}

// Provide a minimal `$state` rune shim so tests that use Svelte's modern testing helpers
// (which call $state outside of a component) do not throw `rune_outside_svelte`.
// The testing helpers expect an assignable object, so return the value directly.
if (typeof globalThis.$state === 'undefined') {
  globalThis.$state = (v) => v ?? {};
}
// Use CommonJS require so Jest can load this without ESM transpilation
require('@testing-library/jest-dom/extend-expect');

// Provide a minimal DOM API for focus management tests if needed
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
}
