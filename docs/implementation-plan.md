# Postgre-Sheets Modernization Implementation Plan

## Phase 0 · Foundations & Analysis

- [x] Inventory current webview behavior and identify all HTML string concatenation points (primarily in `src/dataEditor.ts` and related helpers).
- [x] Document existing command flows that require manual SQL input (alter table, create table, drop table, ad-hoc DDL prompts).
- [x] Capture regression issues: escaping for arbitrary text (all quote types) and broken CRUD buttons in the grid.
- [x] Align on Svelte + webview build pipeline approach (bundler choice, dev workflow, test strategy).

## Phase 1 · Svelte Migration Scaffold

- [x] Introduce build tooling (e.g., Vite or SvelteKit in library mode) to compile Svelte components into the extension `media/` assets.
- [x] Create a base Svelte application shell for the data editor webview, including message passing hooks to the extension host.
- [x] Replace inline HTML string generation with Svelte components for layout, while keeping existing functionality (display data, pagination, change tracking) intact.
- [x] Ensure all string-valued cell content is safely escaped via Svelte bindings to eliminate injection and layout breakage.
- [x] Restore full CRUD controls (add/delete rows, save/cancel, copy/paste) in the Svelte UI.

## Phase 2 · Enhanced Grid Experience

- [x] Adopt or implement a Svelte data grid supporting column resizing, sorting, and filtering (evaluate community components vs. custom solution).
- [x] Wire column resizing state to persist per-session (or per-table) where feasible.
- [x] Implement sortable headers with multi-way sort (asc/desc/reset) integrated with backend queries.
- [x] Add column-level filtering UI that pushes filter clauses to the extension SQL generator with parameterization.
- [x] Update change tracking logic to accommodate re-ordered/filtered views without losing edits.
- [x] Refresh removes any pending edits and downloads the latest data from the server.

## Phase 3 · Visual Refinement

- [x] Establish a shared design system (colors, typography, spacing) inspired by modern GitLens aesthetics while respecting VS Code theming.
- [x] Refine layout: adjust toolbars, status indicators, pagination controls, and dialogs for consistent spacing and alignment.
- [x] Introduce subtle animations/transitions where appropriate (panel transitions, hover states) without impacting performance.
- [x] Ensure dark/light theme support and high-contrast accessibility compliance.

## Phase 4 · Graphical Schema Designer

- [x] Build a dedicated Svelte modal/workbench for Alter Table operations with column list, type selectors, constraints, and attribute editors.
- [x] Provide live SQL preview that updates as users modify schema settings, with ability to toggle raw SQL editing for power users.
- [x] Integrate validation (duplicate column names, incompatible changes) with inline messaging.
- [x] Hook execution flow to existing extension commands; confirm transactional safety and rollback messaging.

## Phase 5 · Broader No-SQL Workflows

- [x] Audit all remaining commands requiring raw SQL input (create table, drop table, index management, custom queries).
- [x] For each, design graphical flows paralleling the schema designer (forms, wizards, previews) while preserving optional SQL editing panels.
- [x] Ensure every graphical workflow emits parameterized SQL via `SqlGenerator` or new builder utilities, maintaining injection safety.
- [x] Update command registrations and context menus to launch the new graphical experiences.

## Phase 6 · Testing & Quality Assurance

- [x] Expand Jest/Playwright coverage for the Svelte components (unit + integration tests for grid interactions, schema designer, filters).
- [x] Add end-to-end extension tests (using VS Code Extension Test Runner) to cover key scenarios: loading data with special characters, resizing columns, graphical alter table execution.
- [x] Perform manual regression passes across supported OS platforms (Windows, macOS, Linux) and VS Code versions (per engine requirement).
- [x] Document known limitations and backlog follow-ups discovered during QA.

## Phase 7 · Documentation & Release Prep

- [ ] Update README and inline help to highlight the new GUI-driven workflows and advanced SQL preview options.
- [ ] Verify Github workflow will version and publish to Marketplace.
- [ ] Finalize changelog entries and VSCE packaging for release.
