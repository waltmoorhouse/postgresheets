# Phase 0 Findings – Foundations & Analysis

## 1. HTML String Concatenation Inventory

- `src/dataEditor.ts`
  - `getWebviewContent(...)` builds the entire webview document via a single template literal with nested `${columns.map(...).join('')}` sequences for headers and cells.
  - Inline event handler logic (`panel.webview.onDidReceiveMessage`, pagination, CRUD buttons) depends on DOM nodes created via those string templates.
  - `addRow` and the `updateTable` message handler assemble `<tr>` markup through nested string concatenations and `innerHTML` assignments.
- `src/webviewUtils.ts`
  - `buildTableBodyHtml(...)` renders table rows using string concatenation and minimal escaping.
- Additional scattered usages (search results, JSON modal content) rely on string interpolation without a central templating/escaping strategy.

**Implication:** All table rendering paths bypass structured templating and are vulnerable to malformed layout when cell values include quotes or HTML-significant characters.

## 2. Manual SQL Entry Workflows

- `postgres-editor.createTable`
  - Quick input requires users to enter full column definitions (e.g. `id SERIAL PRIMARY KEY`).
- `postgres-editor.alterTable`
  - Users must type raw `ALTER TABLE` clauses (`ADD COLUMN ...`, `DROP COLUMN ...`, etc.).
- Additional DDL prompts
  - Current drop-table flow auto-generates SQL but still depends on text-based confirmation dialogues.
  - No graphical support exists for column/index management beyond free-form SQL input.

**Implication:** Core schema operations remain inaccessible to non-SQL users and provide minimal validation/safety.

## 3. Regressions & UX Pain Points

- **Quote-heavy text columns**: Values containing single, double, and backtick quotes break table layout because content is injected directly into HTML without escaping.
- **CRUD buttons unresponsive**: Event handlers rely on DOM state that becomes inconsistent once malformed HTML disrupts the table structure (e.g., `querySelector` targets missing due to broken markup).
- **General fragility**: Any cell with embedded HTML characters risks collapsing row structure, cascading into non-functional controls.

## 4. Proposed Svelte Build Pipeline

- **Tooling**: Adopt Vite with the official Svelte plugin to compile a `packages/webview` (or similar) workspace into distributable assets under `media/`.
- **Structure**:
  - `webview/` (Svelte src) → Vite build → `out/media/dataEditor.js` + `out/media/dataEditor.css`.
  - Extension webview loads bundled assets via `panel.webview.asWebviewUri` references.
- **Dev Workflow**:
  - Use `npm run dev:webview` for hot module reload during webview development (served locally, proxied via Vite).
  - Integrate `npm run build:webview` into `vscode:prepublish` to guarantee compiled assets before packaging.
- **Testing Strategy**:
  - Component tests through Vitest + Testing Library for Svelte units.
  - End-to-end scenarios with Playwright targeting the bundled webview.

**Outcome:** Establishes the baseline needed to replace string-based HTML with a component-driven Svelte UI while supporting iterative development and automated testing.
