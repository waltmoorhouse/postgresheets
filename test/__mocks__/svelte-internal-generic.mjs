// Generic stub to satisfy imports from `svelte/internal/*` during tests.
// Export a variety of no-op utilities commonly referenced by compiled output.
// Provide a wide set of no-op utilities commonly referenced by compiled Svelte output
export const noop = () => {};
export const run = (f) => { if (typeof f === 'function') return f(); };
export const assign = (a, b) => Object.assign(a || {}, b || {});
export const is_client = true;
export const safe_not_equal = (a, b) => a != a ? b == b : a !== b;
export const blank_object = () => Object.create(null);
// DOM helpers (use real DOM APIs when available so compiled components work in jsdom)
export const insert = (parent, node, anchor = null) => {
	if (parent && node) {
		parent.insertBefore(node, anchor || null);
	}
};
export const append = (parent, node) => { if (parent && node) parent.appendChild(node); };
export const detach = (node) => { if (node && node.parentNode) node.parentNode.removeChild(node); };
export const element = (tag) => (typeof document !== 'undefined' ? document.createElement(tag) : {});
export const text = (data = '') => (typeof document !== 'undefined' ? document.createTextNode(String(data)) : { nodeValue: String(data) });
export const space = () => text(' ');
export const attr = (node, attribute, value) => { if (node && node.setAttribute) node.setAttribute(attribute, String(value)); };
export const set_attributes = (node, attributes) => { if (!node) return; for (const k in attributes) node.setAttribute(k, attributes[k]); };
export const getContext = () => undefined;
export const setContext = () => {};
export const createEventDispatcher = () => () => {};
export default {};

// Additional no-op/helpers to satisfy private Svelte runtime helpers used by compiled output
export const child = (parent, idx = 0) => parent && parent.childNodes ? parent.childNodes[idx] : null;
export const sibling = (node, offset = 1) => {
	if (!node) return null;
	let n = node;
	if (offset > 0) {
		for (let i = 0; i < offset; i++) { n = n.nextSibling; if (!n) break; }
	} else {
		for (let i = 0; i < -offset; i++) { n = n.previousSibling; if (!n) break; }
	}
	return n;
};

export const from_html = (html) => {
	// Return a factory function that produces a fresh cloned node/fragment
	// each time it is invoked. Compiled Svelte code calls the returned
	// factory to instantiate component markup multiple times.
	if (typeof document !== 'undefined') {
			try {
				const tpl = document.createElement('template');
				tpl.innerHTML = String(html);
				const fragment = tpl.content;
				// Debug: show that from_html created a factory for this template
				if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
					try { console.log('[DEBUG from_html] created fragment factory for html snippet length', String(html).length); } catch (e) {}
				}
				const factory = () => {
					try { if (typeof console !== 'undefined' && typeof console.log === 'function') console.log('[DEBUG from_html factory] invoked', factory.__svelteFactoryId); } catch (e) {}
					return fragment.cloneNode(true);
				};
				try {
					if (typeof globalThis !== 'undefined') {
						if (!globalThis.__SVELTE_FROM_HTML_FACTORIES__) globalThis.__SVELTE_FROM_HTML_FACTORIES__ = [];
						const id = globalThis.__SVELTE_FROM_HTML_FACTORIES__.push(factory) - 1;
						try { factory.__svelteFactoryId = id; } catch (e) {}
					}
				} catch (e) {}
				return factory;
			} catch (err) {
			// Fall back to Range-based contextual fragment creation
			try {
				const range = document.createRange();
				const frag = range.createContextualFragment(String(html));
					if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
						try { console.log('[DEBUG from_html] created fragment factory via range for html snippet length', String(html).length); } catch (e) {}
					}
					return () => frag.cloneNode(true);
			} catch (err2) {
					if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
						try { console.log('[DEBUG from_html] fallback returning empty div factory'); } catch (e) {}
					}
					return () => document.createElement('div');
			}
		}
	}
	return () => ({});
};

export const set_text = (node, text) => {
	if (!node) return;
	if (typeof Node !== 'undefined' && node.nodeType === Node.TEXT_NODE) node.nodeValue = text == null ? '' : String(text);
	else node.textContent = text == null ? '' : String(text);
};

export const set_checked = (node, checked) => { if (node) node.checked = !!checked; };
export const set_class = (node, cls) => { if (!node) return; if (typeof cls === 'string') node.className = cls; else node.className = cls ? 'true' : ''; };
export const set_attribute = (node, name, value) => { if (node && node.setAttribute) node.setAttribute(name, value == null ? '' : String(value)); };

// simple store/get helpers used by compiled output in tests: work with plain values or
// lightweight wrapper objects that expose .get/.set methods
export const get = (maybeStore) => {
	if (maybeStore && typeof maybeStore.get === 'function') {
		try { return maybeStore.get(); } catch (_) { return undefined; }
	}
	return maybeStore;
};

export const set = (maybeStore, value) => {
	if (maybeStore && typeof maybeStore.set === 'function') return maybeStore.set(value);
	if (Array.isArray(maybeStore)) { maybeStore.length = 0; maybeStore.push(...(Array.isArray(value) ? value : [value])); return maybeStore; }
	return value;
};

export const mutate = (_maybeStore, mutationResult) => mutationResult;

export const push = (arr, value) => Array.isArray(arr) ? arr.push(value) : undefined;
export const pop = (arr) => Array.isArray(arr) ? arr.pop() : undefined;

export const index = (v) => v;
export const init = () => {};

export const deep_read_state = (v) => v;

export const remove_input_defaults = () => {};
export const reset = () => {};

export const template_effect = (cb) => { if (typeof cb === 'function') { try { cb(); } catch (e) {} return () => {}; } return () => {}; };
export const render_effect = template_effect; // alias commonly referenced by compiled code
export const legacy_pre_effect = template_effect;
export const legacy_pre_effect_reset = () => {};
// Provide a legacy_api hook used by some compiled outputs when the legacy
// flag is set during compilation; tests can treat it as a harmless no-op.
export const legacy_api = () => {};

export const mutable_source = (initial) => {
	let v = initial;
	return {
		get: () => v,
		set: (x) => { v = x; },
		subscribe: (cb) => { if (typeof cb === 'function') { cb(v); return () => {}; } return () => {}; }
	};
};

export const untrack = (fn) => (typeof fn === 'function' ? fn() : undefined);

// Runtime helpers used by Svelte compiled output that are safe no-ops in tests
export const add_locations = () => {};
export const check_target = () => {};
export const validate_void_dynamic_element = () => {};
export const validate_dynamic_element_tag = () => {};
export const validate_store = () => {};
export const append_styles = (anchor, css) => {
	if (typeof document === 'undefined') return null;
	try {
		const el = document.createElement('style');
		el.type = 'text/css';
		el.textContent = css && css.code ? css.code : String(css || '');
		(document.head || document.body || document.documentElement).appendChild(el);
		return el;
	} catch (e) {
		return null;
	}
};

export const each = (iterable, fn) => {
	if (!iterable) return [];
	if (Array.isArray(iterable)) return iterable.map((v, i) => fn(v, i));
	if (typeof iterable[Symbol.iterator] === 'function') return Array.from(iterable).map(fn);
	return [];
};

export const prop = (obj, key, idx, defaultFn) => {
	// Svelte compiled output expects prop(...) to return a getter function
	// that when invoked returns the current prop value (or a default).
	if (!obj) {
		return () => (typeof defaultFn === 'function' ? defaultFn() : undefined);
	}
	// If the props object itself is a getter function, return it directly.
	if (typeof obj === 'function') return obj;
	return () => {
		// Prefer the explicit property if present; otherwise call default factory.
		if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
		return typeof defaultFn === 'function' ? defaultFn() : undefined;
	};
};
export const event = (name, opts) => (typeof Event !== 'undefined' ? new Event(name, opts) : { type: name });
