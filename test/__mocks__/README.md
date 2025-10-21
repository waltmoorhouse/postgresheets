Mock strategy for tests
-----------------------

This folder contains several shapes of manual mocks for historic reasons:

- `vscode.ts` — the canonical mock used by tests; provides named exports
  and is transformed by `ts-jest` (preferred for ESM/TypeScript test runs).
- Legacy CommonJS mocks were previously present here (e.g. `vscode.cjs`).
  They have been removed to simplify the mock surface — `vscode.ts` is
  now the canonical mock used by the test suite and `jest.config.cjs`
  maps `vscode` to that file.

Current guidance:

1. Prefer importing `vscode` in tests and let `jest.config.cjs` map that
   specifier to `vscode.ts` so tests run consistently in ESM-mode.
2. Only use the CJS mocks when running in legacy environments that cannot
   load the TypeScript mock; prefer migrating those environments instead.
