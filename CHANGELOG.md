# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Phase 6: Comprehensive testing and QA (74 passing tests)
- Integration test infrastructure (VS Code test runner + example suites)
- Extensive documentation: TESTING.md, MANUAL_TESTING_CHECKLIST.md, KNOWN_ISSUES.md

### Testing / CI
- Aligned Svelte runtime used by the Jest transform and test runtime with the webview Svelte installation (Svelte v4) so compiled webview components run reliably under Jest.
	- Configured `svelte-jester` to use the webview's `svelte.config.js` and `tsconfig.json` during transforms.
	- Added `moduleDirectories` and `moduleNameMapper` entries in `jest.config.cjs` so tests resolve `svelte` and `svelte/internal` to the webview runtime.
	- Removed brittle, exhaustive stubs of `svelte/internal` helpers and instead rely on the real runtime; added a tiny shim only for the legacy flags import used by some compiler output.
	- Small component source fixes so the components compile under the test transform (removed inline `as` TypeScript casts in event attributes which confused the Svelte parser in tests).
	- Added `test:prepare-webview` and `test:components:ci` npm scripts and updated CI workflow to install webview dev dependencies before running component tests.
	- Added `tsconfig.test.json` and ambient test types so jest-dom matchers are available to TypeScript in tests; re-enabled unguarded jest-dom assertions.

Files changed (high level): `jest.config.cjs`, `test/jest.setup.js`, `tsconfig.test.json`, `test/test-ambient.d.ts`, `package.json` (scripts + devDeps), `.github/workflows/component-tests.yml`, `webview/svelte.config.js`, `webview/tsconfig.json`, and small Svelte source edits for component tests.

### Fixed
- SqlGenerator identifier escaping: now uses `quoteIdentifier` to properly escape double-quotes in identifiers
 - Data editor: normalize PostgreSQL array values into JS arrays and provide JSON editor support for arrays
 - Data editor: detect enum column types and send valid labels to the webview; webview now renders a select for enum columns
 - Accessibility: tree status indicators updated to use glyph + text (check/X/hourglass) so status does not rely on color alone

### Changed
- Updated tests and documentation to reflect improved quoting and test coverage
 - Documentation: KNOWN_ISSUES updated to reflect fixes for arrays and enums

## [1.0.27] - 2025-10-12
- Phase 6 testing completion

## [1.0.26] - previous
- Phase 5 completion (graphical workflows)
