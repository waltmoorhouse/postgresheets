// Minimal stub for `svelte/internal/client` used by compiled Svelte output in tests.
// Re-export commonly-used generic internals
export { noop, run, assign, safe_not_equal, blank_object, insert, append, detach, element, text, space, attr, set_attributes, child, sibling, from_html, set_text, set_checked, set_class, set_attribute, get, set, mutate, push, pop, index, init, deep_read_state, remove_input_defaults, reset, template_effect, render_effect, legacy_pre_effect, legacy_pre_effect_reset, mutable_source, untrack, each, prop, event, add_locations, check_target, validate_void_dynamic_element, validate_dynamic_element_tag, validate_store, append_styles } from './svelte-internal-generic.mjs';

// lifecycle helpers (no-op implementations are fine for tests)
export const createEventDispatcher = () => () => {};
export const onMount = () => {};
export const afterUpdate = () => {};
export const beforeUpdate = () => {};
export const onDestroy = () => {};
export const legacy_api = () => {};

export default {};
