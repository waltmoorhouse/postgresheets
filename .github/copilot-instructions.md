# PostgreSQL Data Editor - AI Coding Agent Instructions

## Project Overview
This is a VS Code extension that provides PostgreSQL database connectivity with a spreadsheet-like interface for editing table data. The extension follows VS Code's webview + tree provider architecture with secure credential management.

## Core Architecture

### Main Components
- **`extension.ts`**: Entry point that registers commands and providers
- **`connectionManager.ts`**: Handles PostgreSQL connections, uses `pg` library + VS Code SecretStorage API
- **`databaseTreeProvider.ts`**: Tree view showing connections → databases → schemas → tables hierarchy
- **`dataEditor.ts`**: Webview-based spreadsheet interface with bidirectional postMessage communication
- **`sqlGenerator.ts`**: Creates parameterized SQL (INSERT/UPDATE/DELETE) for safety

### Data Flow Pattern
1. User creates connections via input prompts → stored in `globalState` + `SecretStorage`
2. Tree provider queries `information_schema` to build database hierarchy
3. Table selection opens webview panel with paginated data (100 rows/page)
4. WebView tracks changes in JavaScript → sends via `postMessage` to extension
5. Extension uses `SqlGenerator` to create parameterized queries → executes via cached `pg.Client`

## Critical Patterns

### Security & Connections
- **Always use `SecretStorage`** for passwords: `context.secrets.store()`/`get()`
- **Connection caching**: `ConnectionManager` maintains `Map<string, Client>` for performance
- **SQL injection prevention**: All queries use parameterized statements (`$1`, `$2`, etc.)
- **Quoted identifiers**: Always quote schema/table/columns: `"schema"."table"`

### Webview Communication
```typescript
// Extension → Webview
panel.webview.postMessage({ command: 'sqlPreview', sql: statements });

// Webview → Extension  
vscode.postMessage({ command: 'executeChanges', changes: changes });
```

### Transaction Control
- **Batch mode** (default): Wrap all changes in `BEGIN`/`COMMIT`/`ROLLBACK`
- **Immediate mode**: Execute each statement independently
- Choice controlled by webview checkbox, passed to `executeChanges()`

### Primary Key Handling
- Required for UPDATE/DELETE operations
- Detected via `pg_index` + `pg_attribute` queries in `databaseTreeProvider.ts`
- Used in `SqlGenerator` WHERE clauses for row identification

## Development Workflows

### Building & Testing
```bash
npm run compile    # One-time build
npm run watch     # Auto-compile on changes
# F5 in VS Code launches Extension Development Host
```

### Adding New Features
1. **New commands**: Register in `package.json` contributions + `extension.ts`
2. **Tree items**: Extend `DatabaseTreeItem` with new `type` + context menu
3. **Webview features**: Add HTML/CSS/JS in `dataEditor.getWebviewContent()`
4. **Database operations**: Use `ConnectionManager.getClient()` + parameterized queries

## Project-Specific Conventions

### Error Handling
```typescript
try {
    await client.query(sql, values);
    vscode.window.showInformationMessage('Success');
} catch (error) {
    vscode.window.showErrorMessage(`Failed: ${error}`);
}
```

### JSON/JSONB Support
- Special handling in webview with modal editor
- Client-side validation before sending to extension
- Server-side parsing in `SqlGenerator.parseValue()`

### Pagination Pattern
- Fixed 100 rows per page in `dataEditor.ts`
- Uses `LIMIT 100 OFFSET $1` with separate count query
- Page navigation via webview buttons → `loadPage` message

### VS Code Integration
- Uses theme CSS variables: `var(--vscode-foreground)`
- Activity bar icon: `"$(database)"`
- Command palette integration via `contributes.commands`

## Common Modifications

### Adding Database Support
1. Install driver (e.g., `mysql2`)
2. Modify `ConnectionManager.getClient()` for connection string format
3. Update information schema queries in `databaseTreeProvider.ts`
4. Test primary key detection logic

### UI Customization
- Icons defined in `package.json` contributions
- Command visibility controlled by `when` clauses
- Always use Svlete for all UI work!

### Performance Optimization
- Connection pooling already implemented
- Pagination prevents large result sets
- Consider adding column filtering for wide tables

## Changelog
- Always update CHANGELOG.md when adding features or fixing major bugs
