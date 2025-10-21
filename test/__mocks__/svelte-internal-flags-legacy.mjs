// Minimal shim for the legacy flags import used by some compiled Svelte output
// during tests. Keep this tiny and stable so module resolution succeeds.
export const legacy = true;
export default { legacy };
