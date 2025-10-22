declare module '*.svelte' {
  import type { SvelteComponentTyped } from 'svelte';
  export default class Component extends SvelteComponentTyped<any, any, any> {}
}

declare module '@testing-library/svelte' {
  // Minimal type stubs for the Svelte Testing Library to allow test files
  // to import these functions even when devDependencies are not present.
  export function render(component: any, options?: any): any;
  export const fireEvent: any;
}
declare module 'svelte-focus-trap';

// Add type reference for jest-dom so matcher augmentations like toBeVisible
// are available during test type-checking.
/// <reference types="@testing-library/jest-dom" />

// Provide minimal augmentation for common jest-dom matchers so editors and the
// TypeScript language service recognize them even if test-specific configs are
// not applied during quick checks.
declare namespace jest {
  interface Matchers<R> {
    toBeVisible(): R;
    toBeInTheDocument(): R;
    toHaveAttribute(name: string, value?: any): R;
    toHaveTextContent(text: string | RegExp): R;
  }

  interface Matchers<R, T> {
    toBeVisible(): R;
    toBeInTheDocument(): R;
    toHaveAttribute(name: string, value?: any): R;
    toHaveTextContent(text: string | RegExp): R;
  }
}
