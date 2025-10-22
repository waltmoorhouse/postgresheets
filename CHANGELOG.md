# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Code Quality Improvements
- **Type Safety Enhancements**: Replaced `any` types in webview communication with discriminated union types (`WebviewToExtensionMessage`, `ExtensionToWebviewMessage`) for compile-time type safety. All message passing between extension and webview is now fully typed.
- **Error Boundaries**: Implemented `ErrorBoundary.svelte` component to gracefully handle uncaught JavaScript errors and unhandled promise rejections. Users can now recover from errors without restarting the extension.
- **Improved Type Safety**: 
  - Updated `sqlGenerator.ts` to use strongly typed `GridChange` union types instead of `any`
  - Updated `pgUtils.ts` to properly type query result rows as `QueryResultRow`
  - Updated `csvExporter.ts` to use `unknown` instead of `any` for row data
  - Added comprehensive types file (`src/types.ts`) for all webview message types and data structures

### Added
- **CSV Import Wizard (GUI)**: Replaced command-line CSV import with a user-friendly multi-step wizard. Features:
  - Visual column mapping interface with side-by-side CSV and database columns
  - Automatic header detection with toggle option
  - Real-time preview of first 5 rows with type conversion results
  - Built-in validation using existing validation rules (detects NULL violations, type mismatches, etc.)
  - Retry capability - users can adjust mappings and try again without restarting
  - Color-coded preview showing validation errors
  - Step-by-step wizard UI: Headers → Mapping → Preview → Validation → Import
  - Automatic tree refresh on successful import
- **DateTime/Date/Time Picker Modal**: Professional date/time editor for temporal types. Features:
  - Dedicated modal for editing `timestamp`, `timestamp with time zone`, `date`, and `time` columns
  - Native date input for date selection
  - Native time input with seconds precision
  - Timezone selector for `timestamp with time zone` columns (includes 13 common timezones)
  - "Now" button to populate current date/time
  - Clear button to set value to NULL
  - Preview of current value in code format
  - Available via 📅 calendar button on temporal column cells
  - Keyboard support: Enter to save, Escape to close
- **CSV Export with Headers**: Users can now export table data to CSV format with optional column headers. Includes accessible file picker dialog and keyboard navigation. Features:
  - Toggle header inclusion via quick pick
  - Proper RFC 4180 CSV formatting with quote escaping
  - Accessible file save dialog
  - Keyboard shortcuts for all interactions
- **CSV Import from Files**: Complete CSV import functionality with intelligent column mapping. Features:
  - File picker dialog to select CSV files for import
  - Auto-detection of header row
  - Intelligent column header mapping to table columns
  - Type conversion for all PostgreSQL types (boolean, integer, float, JSON, date, timestamp, UUID, etc.)
  - Automatic NULL handling for empty cells
  - Transaction-based import (all-or-nothing)
  - Preview of column mapping before import
  - Keyboard accessible dialogs and confirmations
  - 32 comprehensive import tests covering edge cases
- **Query History**: Complete query history tracking with search and management. Features:
  - Automatic query storage on execution (default: 100 most recent)
  - Quick pick interface to browse history (keyboard accessible)
  - Copy query to clipboard or re-run functionality
  - Search history by query text or connection name
  - Clear all history or per-connection
  - Persistent storage in VS Code global state
- **Accessibility enhancements for new features**:
  - All dialogs and quick picks fully keyboard accessible
  - Proper ARIA attributes on all UI elements (implicit through VS Code APIs)
  - Quick pick descriptions for better screen reader support
  - Confirmation dialogs prevent accidental actions
- **Test coverage**: 73 new tests for CSV export, import, and query history (csvExporter.test.ts, csvImport.test.ts, queryHistory.test.ts)
- **Validation bypass toggle**: Users can now bypass client-side and server-side validation by enabling the "Bypass validation" checkbox in the data editor toolbar. This allows the database to enforce constraints directly, useful for edge cases where client validation is too strict.
- **Comprehensive accessibility documentation**: New `ACCESSIBILITY.md` and `ACCESSIBILITY_IMPLEMENTATION.md` guides covering WCAG 2.1 compliance, testing, and contributor guidelines
- **Column resize keyboard support**: Resize handles are now keyboard-accessible buttons supporting arrow keys and shift modifiers for width adjustment
- **ARIA live region announcements**: Dynamic status updates (page changes, row selections, data updates) now announced to screen reader users
- **Enhanced row selection**: Multi-row Shift+Click selection now includes keyboard hints and full keyboard support
- **Pagination navigation landmarks**: Pagination controls now marked as navigation regions with proper ARIA attributes
- **Search and filter accessibility**: Search inputs include proper labels, ARIA attributes, and help text

- **Data table semantics**: Tables now use proper ARIA roles (grid) with column headers and cell relationships
- **Focus management improvements**: All interactive elements have clear, visible focus indicators with proper tab order
- **Input validation accessibility**: Form validation errors properly associated with inputs via aria-describedby with immediate announcements
- Phase 6: Comprehensive testing and QA (175 passing tests including new CSV/history tests)
- Server-side validation for data changes: validates integers, numerics, booleans, enum values, array-of-enum elements, dates/timestamps, and UUIDs before execution
- Per-cell inline validation error indicators with accessible aria attributes and tooltips
- Schema/enum metadata caching per panel to reduce database queries during large batch operations
- Integration test infrastructure (VS Code test runner + example suites)
- Extensive documentation: TESTING.md, MANUAL_TESTING_CHECKLIST.md, KNOWN_ISSUES.md

### Fixed - Accessibility
- **Removed all build-time accessibility warnings**: Fixed all Svelte a11y linter warnings
  - Removed incorrect `aria-invalid` attribute from button elements
  - Fixed keyboard event handling on dialog elements using proper event modifiers
  - Ensured all form controls (input, select, checkbox) have proper aria attributes
- **Enhanced form validation accessibility**: All validation errors now properly linked to form controls with `aria-describedby`
- **Improved modal keyboard interaction**: Dialog keyboard shortcuts (Alt+R, Alt+H, Esc) properly handled with accessible event flow
- **JSON editor button state**: Error state now conveyed through adjacent icon and aria attributes instead of button role


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
