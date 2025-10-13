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
☐ Can edit arrays  

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
☐ Toggle batch mode off (if supported)  
☐ Each change executes immediately  
☐ Success message per change  
☐ Can continue editing  

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

## 24. Data Integrity Verification

### After CRUD Operations
☐ Use external tool (psql, pgAdmin) to verify:  
  ☐ INSERTs actually inserted  
  ☐ UPDATEs modified correct rows  
  ☐ DELETEs removed correct rows  
  ☐ Composite keys preserved  
  ☐ Special characters intact  
  ☐ NULL vs empty string correct  
  ☐ JSON structure valid  

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
