// Ambient declarations used by tests so TypeScript can resolve test helpers
declare module '@testing-library/svelte' {
  export function render(component: any, options?: any): any;
  export const fireEvent: any;
}

// Provide ambient declaration for Svelte private internal client used by compiled
// components so tests can dynamically import it for debugging without TypeScript
// complaining about missing module declarations.
declare module 'svelte/internal/client';

/// <reference types="@testing-library/jest-dom" />

// Minimal matcher augmentations for jest-dom so matchers like toBeVisible are
// available to TypeScript in test files that may be checked outside of the
// test-specific tsconfig.
declare namespace jest {
  interface Matchers<R> {
    toBeVisible(): R;
    toBeInTheDocument(): R;
    toHaveAttribute(name: string, value?: any): R;
    toHaveTextContent(text: string | RegExp): R;
  }

  // Some versions of @types/jest include a two-generic Matchers interface,
  // provide an augmentation for that shape as well so merge succeeds.
  interface Matchers<R, T> {
    toBeVisible(): R;
    toBeInTheDocument(): R;
    toHaveAttribute(name: string, value?: any): R;
    toHaveTextContent(text: string | RegExp): R;
  }
}
