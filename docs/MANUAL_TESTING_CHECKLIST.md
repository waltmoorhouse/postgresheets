# Manual Testing Checklist

## Overview
This checklist covers comprehensive manual testing scenarios for PostgreSheets. Use this for pre-release testing and regression validation.

**Tester:** _______________  
**Date:** _______________  
**Version:** _______________  
**OS:** ☐ Windows ☐ macOS ☐ Linux  
**VS Code Version:** _______________  

---

## Pre-Test Setup

### Database Preparation
☐ PostgreSQL server running (version 12+)  
☐ Test database created: `postgresheets_test`  
☐ Sample data loaded (see SQL below)  
☐ User has full permissions on test database  

```sql
-- Run this setup script
CREATE DATABASE postgresheets_test;
\c postgresheets_test;

-- Test table with various data types
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT UNIQUE,
    age INTEGER,
    balance NUMERIC(10,2),
    active BOOLEAN DEFAULT true,
    metadata JSONB,
    tags TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

-- Special characters test table
CREATE TABLE test_special_chars (
    id SERIAL PRIMARY KEY,
    single_quote TEXT,
    double_quote TEXT,
    backtick TEXT,
    mixed TEXT,
    unicode TEXT,
    emoji TEXT,
    newlines TEXT,
    json_data JSONB
);

-- Composite primary key table
CREATE TABLE orders (
    user_id INTEGER,
    order_id INTEGER,
    status TEXT,
    total NUMERIC(10,2),
    PRIMARY KEY (user_id, order_id)
);

-- Table with reserved keywords
CREATE TABLE keywords_test (
    "select" TEXT,
    "where" TEXT,
    "from" TEXT,
    "table" TEXT
);

-- Insert sample data
INSERT INTO users (username, email, age, balance, active, metadata, tags) VALUES
('john_doe', 'john@example.com', 30, 1000.50, true, '{"role": "admin"}', ARRAY['vip', 'active']),
('jane_smith', 'jane@example.com', 25, 500.75, true, '{"role": "user"}', ARRAY['active']),
('bob_jones', 'bob@example.com', 35, 0.00, false, NULL, ARRAY[]::TEXT[]);

INSERT INTO test_special_chars VALUES
(1, 'O''Hara', 'He said "hello"', 'Run `npm`', 'O''Brien said "hi"', 'José García', '🎉✨🚀', E'Line1\nLine2', '{"name": "test"}'),
(2, 'It''s', '"Quote"', '`code`', 'Mixed ''quotes'' "test"', 'Ñoño', '😀😃', E'Tab\tTest', '{"key": "value"}');

INSERT INTO orders VALUES
(1, 100, 'pending', 50.00),
(1, 101, 'completed', 75.50),
(2, 200, 'pending', 30.00);

INSERT INTO keywords_test VALUES
('select_val', 'where_val', 'from_val', 'table_val');
```

---

## 1. Extension Installation & Activation

### Installation
☐ Extension installed from VSIX or marketplace  
☐ No installation errors  
☐ Extension appears in Extensions list  
☐ Version number correct  

### Activation
☐ PostgreSQL icon appears in Activity Bar  
☐ Tree view opens when clicked  
☐ No activation errors in Output panel  
☐ Commands registered (check Command Palette: "PostgreSQL")  

**Notes:**
_____________________________________________

---

## 2. Connection Management

### Add Connection
☐ Click "Add Connection" button (+ icon)  
☐ Prompted for Host (default: localhost)  
☐ Prompted for Port (default: 5432)  
☐ Prompted for Database name  
☐ Prompted for Username  
☐ Prompted for Password  
☐ Connection appears in tree with correct name  
☐ Status indicator shows as disconnected  

### Connect
☐ Click "Connect" button on connection  
☐ Status changes to "connecting" then "connected"  
☐ No error messages  
☐ Databases expand correctly  
☐ While connecting, click the notification "Cancel" button to abort the attempt  
☐ While connecting, right-click the connection and select "Cancel Connect" to abort the attempt  

### Connection Errors
☐ Wrong password shows error message  
☐ Invalid host shows timeout error  
☐ Non-existent database shows error  
☐ Connection remains in tree after error  
☐ Can retry connection  

### Edit Connection
☐ Click "Edit" icon on connection  
☐ Can modify host, port, database, username  
☐ Password retained if not changed  
☐ Changes reflected in tree  
☐ Connection works with new details  

### Delete Connection
☐ Click "Delete" icon  
☐ Confirmation required (if implemented)  
☐ Connection removed from tree  
☐ Password removed from SecretStorage  

### Disconnect
☐ Click "Disconnect" button  
☐ Status changes to disconnected  
☐ Tree collapses  
☐ No error messages  

**Notes:**
_____________________________________________

---

## 3. Tree View Navigation

### Hierarchy Display
☐ Connection → Databases → Schemas → Tables structure  
☐ Icons appropriate for each level  
☐ Expandable/collapsible nodes work  
☐ Loading indicators shown when needed  

### Refresh
☐ Click "Refresh" in toolbar  
☐ Tree structure reloads  
☐ New tables appear if created externally  
☐ Deleted tables removed  
☐ Expansion state preserved (if possible)  

### Multiple Connections
☐ Can add multiple connections  
☐ Each connection independent  
☐ Can be connected simultaneously  
☐ No interference between connections  

**Notes:**
_____________________________________________

---

## 4. Data Editor - Opening Tables

### Open Table
☐ Click on table in tree  
☐ Webview panel opens  
☐ Table data loads  
☐ Column headers displayed  
☐ Pagination controls visible  
☐ Toolbar visible with buttons  

### Multiple Tables
☐ Can open multiple tables simultaneously  
☐ Each in separate tab  
☐ Can switch between tabs  
☐ Data persists when switching  

### Re-open Table
☐ Click table that's already open  
☐ Brings existing tab to front  
☐ Reloads data  
☐ Doesn't create duplicate tab  

**Notes:**
_____________________________________________

---

## 5. Data Editor - Grid Display

### Column Display
☐ All columns visible  
☐ Column names correct  
☐ Column order matches database  
☐ Data types display appropriately  
☐ NULL values shown as "NULL"  
☐ Empty strings shown as empty  
☐ Status indicators include a shape/glyph and textual label (not color-only)

### Data Types
☐ Text/VARCHAR displays correctly  
☐ INTEGER/BIGINT displays correctly  
☐ NUMERIC/DECIMAL shows decimals  
☐ BOOLEAN shows true/false  
☐ TIMESTAMP formatted readably  
☐ JSONB formatted (JSON editor available)  
☐ Arrays shown (as JSON or comma-separated)  

### Special Characters
☐ Single quotes display: O'Hara  
☐ Double quotes display: "hello"  
☐ Backticks display: `code`  
☐ Unicode displays: José, Ñoño  
☐ Emoji displays: 🎉✨🚀  
☐ Newlines display appropriately  
☐ Tabs display appropriately  

### Large Values
☐ Long text values truncated or scrollable  
☐ Can view full value (tooltip or modal)  
☐ JSON objects formatted nicely  

**Notes:**
_____________________________________________

---

## 6. Data Editor - Column Resizing

### Resize Functionality
☐ Hover on column border shows resize cursor  
☐ Drag to resize column width  
☐ Column resizes smoothly  
☐ Other columns adjust appropriately  
☐ Minimum width enforced  
☐ Double-click to auto-fit (if implemented)  

### Persistence
☐ Column widths saved in webview state  
☐ Widths preserved when switching tabs  
☐ Widths preserved on refresh  
☐ Reset on close/reopen (expected)  

**Notes:**
_____________________________________________

---

## 7. Data Editor - Sorting

### Sort Controls
☐ Click column header to sort  
☐ First click: ascending  
☐ Second click: descending  
☐ Third click: clear sort  
☐ Sort indicator visible (arrow icon)  

### Sort Behavior
☐ Data reorders correctly  
☐ Numbers sort numerically  
☐ Text sorts alphabetically  
☐ Dates sort chronologically  
☐ NULLs handled consistently  

### Sort Persistence
☐ Sort maintained when paging  
☐ Sort cleared on refresh  
☐ Can change sort column  

**Notes:**
_____________________________________________

---

## 8. Data Editor - Filtering

### Filter Controls
☐ Filter input visible per column  
☐ Can type filter value  
☐ Filter applies on Enter or button  
☐ Multiple filters work together (AND logic)  

### Filter Behavior
☐ Text filters: contains match  
☐ Number filters: exact or range  
☐ Boolean filters work  
☐ Results update correctly  
☐ Row count updates  

### Clear Filters
☐ Can clear individual filter  
☐ Can clear all filters  
☐ Data returns to unfiltered state  

**Notes:**
_____________________________________________

---

## 9. Data Editor - Pagination

### Page Navigation
☐ "Previous" button works  
☐ "Next" button works  
☐ "Previous" disabled on first page  
☐ "Next" disabled on last page  
☐ Current page displayed  
☐ Total pages displayed  

### Page Size
☐ Default 100 rows per page  
☐ Configurable (if implemented)  
☐ Performance acceptable  

### Interaction with Sorting/Filtering
☐ Pagination works with active sort  
☐ Pagination works with active filters  
☐ Page resets to 1 when filter changes  

**Notes:**
_____________________________________________

---

## 10. Data Editor - CRUD Operations

### Add Row
☐ Click "Add Row" button  
☐ New empty row appears at top  
☐ Row marked as new (styling/indicator)  
☐ Can fill in values  
☐ Multiple new rows supported  

### Edit Cell
☐ Click cell to edit  
☐ Value becomes editable  
☐ Can type new value  
☐ Tab to move to next cell  
☐ Enter to save and move down  
☐ Escape to cancel  

### Edit Special Values
☐ Can enter NULL (how?)  
☐ Can enter empty string  
☐ Can edit JSON (modal or inline)  
☐ Can edit arrays (via JSON editor modal)  

### Delete Row
☐ Select row (checkbox)  
☐ Click "Delete" button  
☐ Row marked for deletion (styling)  
☐ Not immediately deleted  
☐ Multiple deletes supported  

### Change Tracking
☐ Pending changes count shown  
☐ Modified cells indicated (styling)  
☐ New rows indicated  
☐ Deleted rows indicated (strikethrough)  

**Notes:**
_____________________________________________

---

## 11. Data Editor - Save Changes

### Preview
☐ Click "Preview SQL" button  
☐ Modal/panel opens  
☐ Shows SQL statements  
☐ Statements use parameterized queries  
☐ Can copy SQL  

### Save (Batch Mode)
☐ Click "Save" button  
☐ Confirmation message (optional)  
☐ Changes execute in transaction  
☐ Success message shown  
☐ Data reloads  
☐ Change count resets  


### Save (Immediate Mode)
☐ Immediate (non-batch) mode removed — the editor runs all saves in a single transaction (batch mode) by design.  
☐ There should be no UI toggle for "Immediate Mode"; if a toggle is present it is considered a bug.  
☐ Preview SQL should still show parameterized statements for the pending changes.  

### Save with Errors
☐ Constraint violation shows error  
☐ Transaction rolls back (batch mode)  
☐ Error message specific and helpful  
☐ Data not corrupted  
☐ Can fix and retry  

### Cancel
☐ Click "Cancel" button  
☐ Confirmation required  
☐ All changes discarded  
☐ Data reloads  
☐ Change count resets  

**Notes:**
_____________________________________________

---

## 12. Data Editor - Special Character Testing

### Single Quotes
☐ Load row with O'Hara  
☐ Displays correctly  
☐ Edit to add It's  
☐ Save successfully  
☐ Verify in database (external tool)  
☐ Reload shows correct value  

### Double Quotes
☐ Load row with "hello"  
☐ Displays correctly  
☐ Edit to add more quotes  
☐ Save successfully  
☐ Verify in database  

### Mixed Quotes
☐ Enter: O'Brien said "hi" with `code`  
☐ Save successfully  
☐ Reload shows all quote types  
☐ No corruption  

### Unicode
☐ Enter: José García Müller  
☐ Save successfully  
☐ Displays correctly after reload  

### Emoji
☐ Enter: 🎉✨🚀💾😀  
☐ Save successfully  
☐ Displays correctly (not as boxes/?)  

### Newlines
☐ Enter multi-line value (Shift+Enter or paste)  
☐ Save successfully  
☐ Displays with line breaks or \n  

### SQL Injection Attempts
☐ Enter: '; DROP TABLE users; --  
☐ Save successfully as literal value  
☐ Does not execute SQL  
☐ Table still exists  
☐ Value stored correctly  

**Notes:**
_____________________________________________

---

## 13. Schema Designer - Open

### Access
☐ Right-click table in tree  
☐ "Alter Table" option visible  
☐ Click to open  
☐ Webview opens  

### Initial Load
☐ Table name displayed  
☐ Schema name displayed  
☐ All columns listed  
☐ Column properties correct (type, nullable, default)  
☐ Primary key indicated  
☐ Foreign keys shown (if implemented)  

**Notes:**
_____________________________________________

---

## 14. Schema Designer - Column Operations

### Add Column
☐ Click "Add Column" button  
☐ New row appears  
☐ Can enter column name  
☐ Can select type from dropdown  
☐ Can set nullable  
☐ Can set default value  
☐ Can add comment  

### Edit Column
☐ Click column to select  
☐ Can change name  
☐ Can change type  
☐ Can toggle nullable  
☐ Can modify default  
☐ Can edit comment  

### Delete Column
☐ Select column  
☐ Click "Delete" button  
☐ Column marked for deletion  
☐ Can undo deletion  

### Reorder Columns
☐ Drag and drop (if implemented)  
☐ Or up/down buttons  
☐ Order updates  

**Notes:**
_____________________________________________

---

## 15. Schema Designer - SQL Preview

### Preview Updates
☐ Preview updates on column changes  
☐ Shows ALTER TABLE statement  
☐ Syntax highlighted (if implemented)  
☐ Properly formatted  

### Multiple Changes
☐ Multiple column changes shown  
☐ Statements in correct order  
☐ Dependencies handled (drop FK before column)  

### Warnings
☐ Warnings shown for risky changes  
☐ NOT NULL without default warned  
☐ Type changes that may lose data warned  

### Manual SQL Toggle
☐ Can toggle to manual SQL mode  
☐ Can edit SQL directly  
☐ Changes to SQL update preview  
☐ Can toggle back to visual mode  

**Notes:**
_____________________________________________

---

## 16. Schema Designer - Execute

### Successful Execution
☐ Click "Execute" button  
☐ Confirmation dialog (if implemented)  
☐ SQL executes  
☐ Success message shown  
☐ Tree refreshes  
☐ Table structure updated  

### Execution Errors
☐ Invalid SQL shows error  
☐ Error message specific  
☐ Changes rolled back  
☐ Can fix and retry  

### Complex Changes
☐ Add multiple columns - works  
☐ Drop and add in same transaction - works  
☐ Change types with casting - works  
☐ Add constraints - works  

**Notes:**
_____________________________________________

---

## 17. Create Table Wizard

### Access
☐ Right-click schema in tree  
☐ "Create Table" option visible  
☐ Wizard opens  

### Table Definition
☐ Can enter table name  
☐ Can add columns  
☐ Can set column properties  
☐ Can designate primary key  
☐ Can add constraints (if implemented)  

### SQL Preview
☐ Shows CREATE TABLE statement  
☐ Includes all columns and constraints  
☐ Properly formatted  

### Execute
☐ Click "Create" button  
☐ Table created successfully  
☐ Appears in tree  
☐ Can open and use immediately  

### Validation
☐ Duplicate column names rejected  
☐ Empty table name rejected  
☐ Missing primary key warned (if applicable)  

**Notes:**
_____________________________________________

---

## 18. Drop Table Wizard

### Access
☐ Right-click table in tree  
☐ "Drop Table" option visible  
☐ Wizard opens  

### Confirmation
☐ Shows table name to be dropped  
☐ Shows schema name  
☐ Requires explicit confirmation  
☐ CASCADE option available (if implemented)  
☐ Warning about data loss  

### Execute
☐ Click "Drop" button  
☐ Table dropped successfully  
☐ Removed from tree  
☐ Cannot be opened afterward  

### Cancel
☐ Cancel button works  
☐ Table not dropped  
☐ No changes made  

**Notes:**
_____________________________________________

---

## 19. Theme Testing

### Light Theme
☐ Switch to light theme  
☐ Tree view readable  
☐ Webviews readable  
☐ Icons visible  
☐ Contrast sufficient  
☐ No color bleeding  

### Dark Theme
☐ Switch to dark theme  
☐ Tree view readable  
☐ Webviews readable  
☐ Icons visible  
☐ Contrast sufficient  
☐ Background colors appropriate  

### High Contrast
☐ Switch to high contrast theme  
☐ All elements visible  
☐ Borders clear  
☐ Focus indicators visible  
☐ Text highly readable  
☐ Meets accessibility standards  

**Notes:**
_____________________________________________

---

## 20. Accessibility

### Keyboard Navigation
☐ Tab through all controls  
☐ Tab order logical  
☐ Focus indicators clear  
☐ Enter activates buttons  
☐ Escape closes modals  
☐ Arrow keys navigate (where appropriate)  

### Screen Reader (if available)
☐ Tree items announced  
☐ Button labels clear  
☐ Table headers announced  
☐ Error messages read  
☐ Success messages read  

**Notes:**
_____________________________________________

---

## 21. Performance Testing

### Large Tables
☐ Open table with 10,000+ rows  
☐ Pagination responsive  
☐ Column resizing smooth  
☐ Sorting completes in <2s  
☐ Filtering responsive  

### Many Columns
☐ Open table with 50+ columns  
☐ Horizontal scroll works  
☐ Resizing responsive  
☐ All columns accessible  

### Complex Data
☐ Large JSON objects render  
☐ Long text values handle well  
☐ Many emoji don't slow down  

### Memory
☐ Open 5+ tables simultaneously  
☐ No significant slowdown  
☐ No memory warnings  
☐ Can close tabs to free memory  

**Notes:**
_____________________________________________

---

## 22. Error Scenarios

### Network Issues
☐ Disconnect network during query  
☐ Error message shown  
☐ Can retry when reconnected  
☐ No data corruption  

### Database Errors
☐ Constraint violation handled  
☐ Foreign key violation handled  
☐ Unique constraint violation handled  
☐ Type mismatch handled  
☐ Error messages helpful  

### Webview Errors
☐ Invalid message format handled  
☐ JavaScript errors don't crash  
☐ Can recover from errors  
☐ Error shown to user  

**Notes:**
_____________________________________________

---

## 23. Cross-Platform (if testing multiple platforms)

### Windows Specific
☐ Paths with backslashes work  
☐ Drive letters handled (C:\)  
☐ Command Prompt execution works  
☐ File dialog works  

### macOS Specific
☐ Unix paths work  
☐ Terminal execution works  
☐ File dialog works  
☐ Keyboard shortcuts work (Cmd vs Ctrl)  

### Linux Specific
☐ Unix paths work  
☐ Terminal execution works  
☐ Various distributions (Ubuntu, Fedora, etc.)  
☐ File permissions respected  

**Notes:**
_____________________________________________

---

## 25. CSV Export Feature

### Basic Export
☐ Right-click table → "Export as CSV" appears in context menu  
☐ Dialog appears asking for header preference  
☐ File save dialog opens with sensible default name  
☐ Can select different directory  
☐ Can change filename  
☐ CSV file created successfully  

### CSV Content Verification
☐ Headers included when selected  
☐ Headers omitted when deselected  
☐ All rows exported correctly  
☐ All columns exported correctly  
☐ Special characters properly escaped  
☐ Quotes handled correctly (RFC 4180)  
☐ Commas within fields escaped  
☐ Newlines handled  
☐ NULL values exported as empty  

### CSV Roundtrip
☐ Export data  
☐ Open in Excel/Sheets  
☐ Data displays correctly  
☐ Special characters visible  
☐ No data corruption  
☐ File size reasonable  

### Accessibility - CSV Export
☐ Tab navigates through dialog  
☐ Enter/Space activates buttons  
☐ Header selection quick pick keyboard navigable  
☐ File save dialog accessible  
☐ Screen reader announces options  
☐ Focus visible at all times  

**Notes:**
_____________________________________________

---

## 26. CSV Import Feature

### File Selection
☐ Right-click table → "Import from CSV" appears in context menu  
☐ File picker dialog opens  
☐ Can navigate to file location  
☐ CSV files visible in picker  
☐ Can select CSV file  
☐ Can cancel file selection  

### Header Detection
☐ Dialog asks if first row is headers  
☐ "Yes" option selected by default  
☐ "No" option available  
☐ Can switch between options  
☐ Keyboard navigable  

### Column Mapping
☐ Mapping preview shows before import  
☐ CSV columns mapped to table columns  
☐ Header names auto-matched to column names  
☐ Mapping accurate and complete  
☐ Can review mapping before proceeding  

### Type Conversion
☐ Boolean values correctly converted  
☐ Integer values correctly converted  
☐ Float/Numeric values correctly converted  
☐ Date values correctly converted  
☐ Timestamp values correctly converted  
☐ JSON values correctly parsed  
☐ UUID values correctly formatted  
☐ Empty cells converted to NULL  
☐ Text values preserved correctly  

### Import Execution
☐ Import button initiates transaction  
☐ Row count displayed correctly  
☐ All rows inserted successfully  
☐ Transaction committed on success  
☐ Success message appears  
☐ Table refreshes with new data  
☐ No duplicate rows  

### Error Handling
☐ Import fails gracefully on invalid data  
☐ Transaction rolled back on error  
☐ Error message displayed  
☐ Original data untouched  
☐ User can retry with corrected file  

### Import with Special Cases
☐ CSV with embedded quotes  
☐ CSV with embedded commas  
☐ CSV with newlines in fields  
☐ CSV with very long fields  
☐ CSV with NULL/empty values  
☐ CSV with JSON data  
☐ CSV with special characters  
☐ CSV with Unicode characters  
☐ Large CSV file (1000+ rows)  

### Accessibility - CSV Import
☐ Tab navigates through dialogs  
☐ Enter/Space activates buttons  
☐ File picker keyboard navigable  
☐ Header selection quick pick accessible  
☐ Screen reader announces file count  
☐ Screen reader announces column mapping  
☐ Focus indicators visible  
☐ No keyboard traps  
☐ Escape cancels at any step  

**Notes:**
_____________________________________________

---

## 27. Query History Feature

### History Recording
☐ Queries recorded automatically  
☐ Connection name stored  
☐ Timestamp recorded  
☐ Database name stored  
☐ Execution time captured (if available)  
☐ History persists across sessions  
☐ History limit enforced (default 100)  

### History Browsing
☐ "Query History" command in palette  
☐ Quick pick shows recent queries  
☐ Description shows connection and time  
☐ Can scroll through long list  
☐ Search works on query text  
☐ Search works on connection name  
☐ Queries truncated for display  
☐ Query History appears as a bottom-panel view (same tray as Terminal and Debug Console) so it can be visible while editing tables above.

### History Actions
☐ "Copy to Clipboard" option works  
☐ Query copied exactly as entered  
☐ "Re-run Query" option appears  
☐ Re-run functionality (if implemented)  
☐ Confirmation before destructive queries (if implemented)  
☐ History entries can be opened in the SQL Terminal ("Open in SQL Terminal") or sent to the terminal for easy re-execution.

### History Management
☐ "Clear Query History" command available  
☐ Confirmation dialog shows  
☐ All history cleared when confirmed  
☐ History stays when cancelled  
☐ Per-connection clearing (if implemented)  

### Accessibility - Query History
☐ Tab navigates quick picks  
☐ Arrow keys move through options  
☐ Enter selects item  
☐ Escape cancels  
☐ Screen reader announces query count  
☐ Screen reader announces descriptions  
☐ Focus management correct  
☐ Keyboard shortcuts work from all contexts  

**Notes:**
_____________________________________________


---

## 27.5 SQL Terminal Feature

### Access
☐ Command palette shows "Open SQL Terminal"  
☐ Can open terminal from context menu on a connection  
☐ Prompt shows format: "$<username>@<connectionName>/<database>/<schema> > "  

### Basic Input
☐ Can type SQL directly at the prompt  
☐ Supports multi-line input (statements spanning lines)  
☐ Enter executes the current statement when terminated with a semicolon (;)  
☐ Backspace and Ctrl+C behave as expected to edit/interrupt input  

### Execution
☐ Sent SQL executes against the selected connection  
☐ Results printed to the terminal in readable tabular form or as JSON for complex types  
☐ Errors (syntax or runtime) are shown with helpful messages  
☐ Execution time and row counts displayed when available  

### Context & Navigation
☐ Can choose connection and schema when opening the terminal  
☐ Terminal sets search_path to the chosen schema for the session  
☐ Can open multiple terminals for different connections/schemas  
☐ Terminal history (up/down arrows) navigates previous commands  

### Integration with Query History
☐ Queries executed from the terminal are recorded in Query History  
☐ Can send a Query History entry to an open terminal ("Open in SQL Terminal")  
☐ Can re-run a history entry directly from the history panel into the terminal  

### Security
☐ Terminal does not leak passwords or secrets in output  
☐ Sensitive error messages redact secrets if present  

**Notes:**
_____________________________________________


---

## 28. Index Management Feature

### Access Index Manager
☐ Right-click table → "Manage Indexes" appears in context menu  
☐ Index manager panel opens in new column  
☐ Table name displayed in title  
☐ Schema name displayed in title  

### View Indexes
☐ All existing indexes listed  
☐ Column names shown for each index  
☐ Index type displayed (btree, hash, etc.)  
☐ Unique indexes indicated  
☐ Primary key indexes indicated  
☐ Index size displayed  
☐ Size formatted appropriately (KB, MB)  

### Create Index
☐ Click "Create Index" button  
☐ Prompted for index name  
☐ Prompted for column names (comma-separated)  
☐ Prompted for unique constraint (Yes/No)  
☐ Index created successfully  
☐ Success message displayed  
☐ Index appears in list  
☐ Tree view can be refreshed to show new index  

### Reindex
☐ Click "Reindex" button on existing index  
☐ Reindex operation completes  
☐ Success message displayed  
☐ No data loss  

### Drop Index
☐ Click "Drop" button on non-primary index  
☐ Confirmation dialog appears  
☐ Index dropped on confirmation  
☐ Success message displayed  
☐ Index removed from list  
☐ Cannot drop primary key indexes (button not shown)  

### Refresh Indexes
☐ Click "Refresh" button  
☐ Index list reloads  
☐ New indexes appear  
☐ Dropped indexes removed  

### Accessibility - Index Management
☐ Tab navigates through index list and buttons  
☐ Enter activates buttons  
☐ Keyboard navigation works in table  
☐ Screen reader announces index details  
☐ Focus indicators visible  

**Notes:**
_____________________________________________

---

## 29. Permissions Management Feature

### Access Permissions Manager
☐ Right-click table → "Manage Permissions" appears in context menu  
☐ Permissions manager panel opens in new column  
☐ Table name displayed in title  
☐ Schema name displayed in title  

### View Permissions
☐ All current permissions listed  
☐ Role/user names displayed  
☐ Privileges shown (SELECT, INSERT, UPDATE, DELETE)  
☐ Grant option indicated (Yes/No)  
☐ Grouped by role/user  
☐ Empty state shown if no permissions  

### Grant Permissions
☐ Click "Grant Permissions" button  
☐ Prompted for role name  
☐ Multi-select picker shows privilege options  
☐ Default privileges selected (SELECT, INSERT, UPDATE)  
☐ Can select/deselect privileges  
☐ Permissions granted successfully  
☐ Success message displayed  
☐ Permissions appear in list  

### Revoke Permissions
☐ Click "Revoke" button on existing permission  
☐ Confirmation dialog appears  
☐ Shows which role will lose permissions  
☐ Permissions revoked on confirmation  
☐ Success message displayed  
☐ Permissions removed from list  

### Refresh Permissions
☐ Click "Refresh" button  
☐ Permissions list reloads  
☐ New permissions appear  
☐ Revoked permissions removed  

### Error Handling
☐ Invalid role name shows error  
☐ Insufficient privileges shows error  
☐ Error messages helpful  
☐ Can retry after fixing  

### Accessibility - Permissions Management
☐ Tab navigates through permissions list and buttons  
☐ Enter activates buttons  
☐ Keyboard navigation works in table  
☐ Screen reader announces permission details  
☐ Focus indicators visible  
☐ Quick pick for privileges is keyboard navigable  

**Notes:**
_____________________________________________

---

## Issues Found

### Critical Issues
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Major Issues
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Minor Issues
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## Overall Assessment

**Ready for Release:** ☐ Yes ☐ No ☐ With Reservations

**Comments:**
_______________________________________________________
_______________________________________________________
_______________________________________________________

**Signature:** _______________  **Date:** _______________

```

## Issues Found

### Critical Issues
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Major Issues
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Minor Issues
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## Overall Assessment

**Ready for Release:** ☐ Yes ☐ No ☐ With Reservations

**Comments:**
_______________________________________________________
_______________________________________________________
_______________________________________________________

**Signature:** _______________  **Date:** _______________
