# Phase 6 Testing & QA Plan

## Test Coverage Summary

### Backend Unit Tests (Jest)

#### Core SQL Generation (`test/sqlGenerator.test.ts`)
- ✅ Basic INSERT/UPDATE/DELETE operations
- ✅ Parameterized queries

#### Special Characters (`test/specialCharacters.test.ts`)
- ✅ Single quotes (O'Hara, It's)
- ✅ Double quotes in text values
- ✅ Backticks in text
- ✅ Mixed quote types
- ✅ Newlines, tabs, unicode
- ✅ NULL vs empty string distinction
- ✅ JSON/JSONB with special characters
- ✅ SQL injection prevention
- ✅ Backslashes and escape sequences

#### Data Editor Integration (`test/dataEditor.integration.test.ts`)
- ✅ CRUD operations with various data types
- ✅ Composite primary keys
- ✅ Batch operations
- ✅ Reserved SQL keywords as column names
- ✅ Column names with spaces and special characters
- ✅ Column/table names with quotes
- ✅ Boolean, numeric, array handling
- ✅ Empty and edge case values

#### Schema Designer (`test/schemaDesigner.test.ts`)
- ✅ ALTER TABLE operations (ADD, DROP, ALTER COLUMN)
- ✅ Constraint operations (PK, FK, UNIQUE, CHECK)
- ✅ Multiple operations
- ✅ Edge cases and validation
- ✅ Identifier quoting and escaping
- ✅ CREATE TABLE statement generation
- ✅ NOT NULL warnings

#### Table SQL Builder (`test/tableSqlBuilder.test.ts`)
- ✅ CREATE TABLE construction
- ✅ ALTER TABLE construction
- ✅ DROP TABLE with CASCADE
- ✅ Identifier quoting

#### Additional Tests (`test/phase6.additional.test.ts`)
- ✅ formatSqlWithValues with special characters
- ✅ buildCreateTableStatements warnings

#### Webview Utils (`test/webviewUpdate.test.ts`)
- ✅ HTML generation with escaping
- ✅ NULL rendering

### Frontend/Svelte Component Tests

#### Data Grid Component (App.svelte)
**Critical Functionality:**
- [ ] Column resizing
  - [ ] Drag handles work correctly
  - [ ] Column widths persist in state
  - [ ] Minimum width constraints
- [ ] Sorting
  - [ ] Single column sort (asc/desc/none)
  - [ ] Visual indicators
  - [ ] Data reordering
- [ ] Filtering
  - [ ] Filter input per column
  - [ ] Filter application to data
  - [ ] Clear filters
- [ ] CRUD Operations
  - [ ] Add row button creates new row
  - [ ] Delete row marks for deletion
  - [ ] Cell editing updates state
  - [ ] Save changes sends correct messages
  - [ ] Cancel discards changes
- [ ] Change Tracking
  - [ ] Tracks inserts, updates, deletes
  - [ ] Shows pending change count
  - [ ] Preserves changes across pagination
  - [ ] Discards on cancel
- [ ] Pagination
  - [ ] Next/previous page navigation
  - [ ] Page number display
  - [ ] Preserves changes when changing pages
- [ ] Special Characters
  - [ ] Displays quotes correctly
  - [ ] Escapes HTML entities
  - [ ] Handles unicode emoji
  - [ ] Renders newlines appropriately

#### Schema Designer Component (SchemaDesignerApp.svelte)
**Critical Functionality:**
- [ ] Column Management
  - [ ] Add column button
  - [ ] Remove column button
  - [ ] Column reordering
  - [ ] Column property editors
- [ ] Type Selection
  - [ ] Type dropdown populated
  - [ ] Custom type entry
  - [ ] Common types available
- [ ] Validation
  - [ ] Duplicate column names detected
  - [ ] Empty column names rejected
  - [ ] Missing types highlighted
  - [ ] Invalid changes flagged
- [ ] SQL Preview
  - [ ] Updates on column changes
  - [ ] Shows warnings
  - [ ] Syntax-highlighted (if implemented)
  - [ ] Manual SQL toggle works
- [ ] Execution
  - [ ] Execute button sends message
  - [ ] Shows success/error feedback
  - [ ] Disables during execution
  - [ ] Handles errors gracefully

#### Create Table Wizard (CreateTableApp.svelte)
**Critical Functionality:**
- [ ] Column Definition
  - [ ] Add/remove columns
  - [ ] Set types and constraints
  - [ ] Primary key selection
  - [ ] Default values
- [ ] SQL Preview
  - [ ] Generates valid CREATE TABLE
  - [ ] Shows warnings
  - [ ] Updates on changes
- [ ] Execution
  - [ ] Creates table successfully
  - [ ] Handles errors
  - [ ] Shows feedback

#### Drop Table Wizard (DropTableApp.svelte)
**Critical Functionality:**
- [ ] Confirmation
  - [ ] Shows table name
  - [ ] CASCADE option
  - [ ] Requires explicit confirmation
- [ ] Execution
  - [ ] Drops table on confirm
  - [ ] Shows success message
  - [ ] Handles errors

### Extension Integration Tests

#### Connection Management
- [ ] Add new connection
  - [ ] Prompts for host, port, database, user
  - [ ] Stores password in SecretStorage
  - [ ] Creates connection in tree
- [ ] Connect/Disconnect
  - [ ] Connect establishes pg client
  - [ ] Disconnect closes client
  - [ ] Status indicators update
- [ ] Edit connection
  - [ ] Updates connection details
  - [ ] Preserves password
  - [ ] Refreshes tree
- [ ] Delete connection
  - [ ] Removes from state
  - [ ] Removes from SecretStorage
  - [ ] Updates tree

#### Tree Provider
- [ ] Hierarchy Display
  - [ ] Connections → Databases → Schemas → Tables
  - [ ] Icons for each level
  - [ ] Expandable nodes
- [ ] Refresh
  - [ ] Reloads tree structure
  - [ ] Updates table list
  - [ ] Preserves expansion state
- [ ] Error Handling
  - [ ] Shows connection errors
  - [ ] Handles missing databases
  - [ ] Timeout handling

#### Data Editor Webview
- [ ] Opening Tables
  - [ ] Loads table data correctly
  - [ ] Shows column headers
  - [ ] Displays primary key info
  - [ ] Initial pagination state
- [ ] Message Passing
  - [ ] Extension → Webview messages
  - [ ] Webview → Extension messages
  - [ ] State synchronization
- [ ] SQL Generation
  - [ ] Generates correct parameterized SQL
  - [ ] Batching works correctly
  - [ ] Individual execution works
- [ ] Transaction Handling
  - [ ] BEGIN/COMMIT for batch mode
  - [ ] ROLLBACK on error
  - [ ] Error messages displayed
- [ ] Special Characters End-to-End
  - [ ] Load data with quotes
  - [ ] Edit cell with special chars
  - [ ] Save changes successfully
  - [ ] Verify in database

#### Schema Designer Webview
- [ ] Opening Designer
  - [ ] Loads existing table structure
  - [ ] Populates column list
  - [ ] Shows current types and constraints
- [ ] ALTER TABLE Execution
  - [ ] Executes SQL successfully
  - [ ] Shows success message
  - [ ] Refreshes tree
  - [ ] Handles errors with rollback

#### Create/Drop Table Wizards
- [ ] Create Table
  - [ ] Opens wizard from schema context
  - [ ] Creates table successfully
  - [ ] Adds to tree
  - [ ] Shows errors on failure
- [ ] Drop Table
  - [ ] Opens wizard from table context
  - [ ] Drops table on confirm
  - [ ] Removes from tree
  - [ ] Handles CASCADE correctly

## Manual Regression Testing Checklist

### Platform Testing

#### Windows
- [ ] Extension activates correctly
- [ ] Database connections work
- [ ] Webviews render properly
- [ ] File paths handled correctly
- [ ] Special characters in paths
- [ ] Command prompt execution

#### macOS
- [ ] Extension activates correctly
- [ ] Database connections work
- [ ] Webviews render properly
- [ ] File paths handled correctly
- [ ] Terminal execution
- [ ] Keyboard shortcuts

#### Linux
- [ ] Extension activates correctly
- [ ] Database connections work
- [ ] Webviews render properly
- [ ] File paths handled correctly
- [ ] Terminal execution
- [ ] Various distributions tested

### Theme Testing

- [ ] Light Theme
  - [ ] Tree view readable
  - [ ] Webview colors appropriate
  - [ ] Icons visible
  - [ ] Contrast sufficient
- [ ] Dark Theme
  - [ ] Tree view readable
  - [ ] Webview colors appropriate
  - [ ] Icons visible
  - [ ] Contrast sufficient
- [ ] High Contrast
  - [ ] All elements visible
  - [ ] Meets accessibility standards
  - [ ] Focus indicators clear
  - [ ] Text readable

### Accessibility Testing

- [ ] Keyboard Navigation
  - [ ] Tab order logical
  - [ ] All controls reachable
  - [ ] Escape closes modals
  - [ ] Enter submits forms
- [ ] Screen Reader
  - [ ] Tree items announced
  - [ ] Button labels clear
  - [ ] Error messages read
  - [ ] Table navigation works

### Performance Testing

- [ ] Large Tables
  - [ ] 10,000+ rows pagination
  - [ ] Column resizing responsive
  - [ ] Filtering performance
  - [ ] Sort performance
- [ ] Many Columns
  - [ ] 50+ columns display
  - [ ] Horizontal scrolling
  - [ ] Resize performance
- [ ] Complex Schemas
  - [ ] 100+ tables
  - [ ] Tree expansion speed
  - [ ] Refresh performance
- [ ] Memory Usage
  - [ ] No memory leaks
  - [ ] Multiple webviews
  - [ ] Long running sessions

### Error Scenarios

- [ ] Connection Failures
  - [ ] Wrong password
  - [ ] Invalid host
  - [ ] Database doesn't exist
  - [ ] Network timeout
- [ ] SQL Errors
  - [ ] Invalid syntax (manual SQL)
  - [ ] Constraint violations
  - [ ] Deadlocks
  - [ ] Transaction rollback
- [ ] Webview Errors
  - [ ] Invalid message format
  - [ ] Missing required fields
  - [ ] JavaScript errors handled
  - [ ] State corruption recovery

### Data Integrity

- [ ] CRUD Verification
  - [ ] INSERT actually inserts
  - [ ] UPDATE modifies correct row
  - [ ] DELETE removes correct row
  - [ ] Composite keys work
- [ ] Special Characters
  - [ ] Quote types preserved
  - [ ] Unicode saved correctly
  - [ ] Newlines maintained
  - [ ] JSON structure intact
- [ ] NULL Handling
  - [ ] NULL vs empty string
  - [ ] NULL in various types
  - [ ] NOT NULL constraints

## Known Limitations and Backlog

### Current Limitations

1. **Pagination Only**
   - No infinite scroll option
   - Fixed page size (configurable but not dynamic)
   - Large result sets must be paginated

2. **Limited Data Type Support**
   - Complex PostgreSQL types may need manual entry
   - Array types displayed as JSON strings
   - Custom enum types require manual SQL

3. **No Query Builder**
   - Complex WHERE clauses require manual SQL
   - No visual JOIN builder
   - No aggregation UI

4. **Single Connection at a Time**
   - Cannot compare data across connections
   - No cross-database queries

5. **Limited Schema Designer**
   - Cannot visually design relationships
   - No ER diagram view
   - Foreign key management requires manual SQL

6. **No Data Import/Export**
   - Cannot bulk import CSV
   - No export to Excel/CSV
   - No backup/restore UI

### Backlog Items

#### High Priority
- [ ] Add CSV import functionality
- [ ] Add data export (CSV, JSON, Excel)
- [ ] Implement infinite scroll for large tables
- [ ] Add query history
- [ ] Add connection pooling configuration

#### Medium Priority
- [ ] Add ER diagram view
- [ ] Implement visual query builder
- [ ] Add index management UI
- [ ] Add database backup/restore
- [ ] Add permission/role management
- [ ] Add table statistics view
- [ ] Implement stored procedure editor

#### Low Priority
- [ ] Add custom theme support
- [ ] Implement saved queries/snippets
- [ ] Add data visualization charts
- [ ] Add schema comparison tool
- [ ] Add migration generator
- [ ] Multi-connection comparison view

#### Technical Debt
- [ ] Refactor connection management for better pooling
- [ ] Improve webview message typing (full type safety)
- [ ] Add comprehensive E2E test suite
- [ ] Implement proper error boundaries in Svelte
- [ ] Add telemetry for error tracking
- [ ] Performance profiling and optimization
- [ ] Reduce bundle size

## Test Execution Instructions

### Running Backend Tests

```bash
# Run all Jest tests
npm test

# Run specific test file
npm test -- specialCharacters.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Manual Testing Setup

1. **Install Extension**
   ```bash
   npm run vscode:package
   # Install .vsix file in VS Code
   ```

2. **Setup Test Database**
   ```sql
   CREATE DATABASE postgresheets_test;
   
   CREATE TABLE test_special_chars (
       id SERIAL PRIMARY KEY,
       single_quote TEXT,
       double_quote TEXT,
       backtick TEXT,
       mixed TEXT,
       unicode TEXT,
       emoji TEXT
   );
   
   INSERT INTO test_special_chars VALUES
   (1, 'O''Hara', 'He said "hello"', 'Run `npm`', 'O''Brien said "hi" with `code`', 'José García', '🎉✨🚀');
   ```

3. **Test Scenarios**
   - Follow Manual Regression Testing Checklist
   - Document any issues found
   - Verify fixes with retesting

### Automated Test Expansion TODO

- [ ] Set up VS Code Extension Test Runner
- [ ] Create fixture databases for testing
- [ ] Implement Playwright for Svelte component testing
- [ ] Add CI/CD pipeline with automated tests
- [ ] Set up test coverage reporting
- [ ] Create performance benchmarks

## Documentation Updates Needed

- [ ] Update README with testing instructions
- [ ] Add TESTING.md with detailed test guide
- [ ] Document known issues in KNOWN_ISSUES.md
- [ ] Update CHANGELOG.md with Phase 6 completion
- [ ] Add screenshots of new features
- [ ] Create troubleshooting guide
