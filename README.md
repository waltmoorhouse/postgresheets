# PostgreSQL Data Editor for VSCode

[![Build](https://github.com/waltmoorhouse/postgresheets/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/waltmoorhouse/postgresheets/actions/workflows/build.yml)
[![Tests](https://github.com/waltmoorhouse/postgresheets/actions/workflows/component-tests.yml/badge.svg?branch=main)](https://github.com/waltmoorhouse/postgresheets/actions/workflows/component-tests.yml)
[![Version](https://img.shields.io/badge/version-2.0.6-blue.svg)](https://github.com/waltmoorhouse/postgresheets/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.md)
[![Publish](https://github.com/waltmoorhouse/postgresheets/actions/workflows/publish-on-merge.yml/badge.svg?branch=next-level)](https://github.com/waltmoorhouse/postgresheets/actions/workflows/publish-on-merge.yml)
[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/WaltMoorhouse.postgresheets?label=marketplace%20version)](https://marketplace.visualstudio.com/items?itemName=WaltMoorhouse.postgresheets)

A VSCode extension that lets you connect to PostgreSQL databases and edit table data in a spreadsheet-like interface.

## Features

- 🔐 **Secure Connection Management** - Store multiple database connections with encrypted passwords
- 🌳 **Database Browser** - Navigate databases, schemas, and tables in a tree view
- 📊 **Spreadsheet Interface** - Edit table data with inline editing
- 🔑 **Primary Key Detection** - Automatically detects and uses primary keys for updates/deletes
- 📝 **JSON Support** - Special handling for JSON/JSONB columns with validation
- 🔄 **Transaction Control** - Choose between batch transactions or immediate execution
- 👁️ **SQL Preview** - Preview generated SQL before execution
- 📄 **Pagination** - Handle large tables with 100-row pagination
- 💾 **CSV Export** - Export table data to CSV format with optional headers
- 📥 **CSV Import** - Import data from CSV files with automatic column mapping and type conversion
- 📋 **Query History** - Automatic query tracking with search and clipboard integration
- 📊 **Table Statistics** - View table size, row counts, index usage, bloat analysis, and maintenance info
- 💾 **Database Backup/Restore** - Full backup and restore using pg_dump/pg_restore with multiple format options (requires pg_dump/pg_restore be installed on system and in path)
- ♿ **Full Keyboard Navigation** - All features accessible via keyboard
- 🔊 **Screen Reader Support** - WCAG 2.1 Level AA accessibility compliance

## Discalimer

This code was written with help from AI Coding Agents such as GitHub Copilot. I have performed code reviews and consider it safe enough to use on my machine. 
However, when using code created with GenAI (or really when installing any VSCode extension, even if written by humans) you should do your own code/security review to ensure you trust the product.

## Installation

### Prerequisites

- Node.js 20+ and npm
- VSCode 1.80.0 or higher

### Setup Steps

1. **Clone the project**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Compile the extension:**
   ```bash
   npm run compile
   ```

4. **Open in VSCode and test:**
   - Press `F5` to open a new Extension Development Host window
   - Or run from command line:
     ```bash
     code --extensionDevelopmentPath=/path/to/postgres-data-editor
     ```

## Usage

### Adding a Connection

1. Click the PostgreSQL icon in the Activity Bar (left sidebar)
2. Click the `+` icon to add a new connection
3. Enter connection details:
   - Connection name (e.g., "Production DB")
   - Connection string (e.g., postgres://user:pass@hostname:port/db?sslmode=require)

### Browsing Database

1. Expand a connection in the tree view
2. Navigate through: Databases → Schemas → Tables
3. Click on a table to open the data editor

### Editing Data

#### Update Existing Rows
- Double-click any cell to edit
- Modified cells will be highlighted
- Changes are tracked but not saved until you click "Execute Changes"

#### Insert New Rows
- Click "Add Row" button
- Fill in the cell values
- Empty cells will be inserted as NULL

#### Delete Rows
- Check the checkbox next to rows you want to delete
- Click "Delete Selected"
- Deleted rows will be marked with strikethrough

#### JSON/JSONB Columns
- Click on a JSON cell to open a dedicated JSON editor modal
- Edit the JSON in the text area
- JSON is validated before saving
- Invalid JSON will show an error

### Transaction Modes

**Batch Mode (Default - Checked):**
- All changes are collected and executed in a single transaction
- If any statement fails, all changes are rolled back
- Better for multiple related changes

**Immediate Mode (Unchecked):**
- Each change is executed immediately
- Changes are committed one by one
- Failed statements don't affect other changes

### Executing Changes

1. Make your edits (update, insert, delete)
2. Click "Preview SQL" to see the generated SQL statements
3. Review the SQL preview panel
4. Click "Execute Changes" to run the statements
5. Check the notification for success/failure

### Pagination

- Each page shows 100 rows
- Use "Previous" and "Next" buttons to navigate
- Total row count and page number displayed at bottom

### CSV Export

1. Open a table in the data editor
2. Click the "Export as CSV" button (or use Command Palette: `PostgreSQL: Export Table as CSV`)
3. Choose whether to include column headers:
   - **Yes** - CSV will include header row with column names
   - **No** - CSV will only include data rows
4. Select save location in the file dialog
5. File is saved and confirmation message appears

**CSV Format:**
- RFC 4180 compliant format
- Properly escapes special characters (quotes, commas, newlines)
- Handles NULL values as empty cells
- Compatible with Excel, Google Sheets, and other spreadsheet applications

### CSV Import

1. Open a table in the data editor or right-click a table in the tree view
2. Click the "Import from CSV" button (or use Command Palette: `PostgreSQL: Import Table from CSV`)
3. Select a CSV file to import in the file picker
4. Choose whether the first row contains column headers:
   - **Yes** - First row is treated as header with column names for auto-mapping
   - **No** - All rows are treated as data
5. Review the column mapping preview
   - The extension automatically maps CSV columns to table columns by name
   - Unmapped columns are skipped
6. Confirm the import
   - Shows number of rows to import
   - All rows are inserted in a single transaction (all-or-nothing)
7. On success, the table data is refreshed with new rows

**Import Features:**
- **Smart Type Conversion**: Automatically converts values to the correct PostgreSQL types:
  - Booleans: Recognizes "true", "false", "yes", "no", "1", "0"
  - Numbers: Integers and floats parsed correctly
  - Dates/Timestamps: ISO 8601 formats recognized
  - JSON: Valid JSON strings parsed to objects
  - UUIDs: Properly formatted and validated
  - Enums: Text values matched to enum options
- **NULL Handling**: Empty cells automatically converted to NULL
- **Transaction Safety**: All rows inserted together—if any row fails, entire import is rolled back
- **Column Mapping**: Flexible mapping with auto-detection by column name
- **Large File Support**: Handles CSV files with thousands of rows efficiently

### Query History

The extension automatically tracks executed queries for easy reference and reuse:

1. **View Query History:**
   - Use Command Palette: `PostgreSQL: Show Query History`
   - Quick pick dialog shows recent queries with metadata:
     - Query text (truncated if long)
     - Connection name
     - Database and schema
     - Execution timestamp

2. **Search and Filter:**
   - Use the search box in the quick pick to filter by query text or connection name
   - Most recent queries appear first

3. **Copy Query:**
   - Select a query and press Enter
   - Query is copied to clipboard
   - Modify and execute in any SQL editor

4. **Clear History:**
   - Use Command Palette: `PostgreSQL: Clear Query History`
   - Requires confirmation to prevent accidental data loss
   - Clears all saved queries

**History Limits:**
- Stores up to 100 most recent queries
- Persists across VSCode sessions
- Per-connection history tracking with timestamps

### Table Statistics

View comprehensive statistics and health metrics for any table:

1. **Open Table Statistics:**
   - Right-click on a table in the tree view
   - Select "View Table Statistics"
   - Or use Command Palette: `PostgreSQL: View Table Statistics`

2. **Statistics Displayed:**
   - **Table Overview:**
     - Total row count
     - Table size (bytes, KB, MB, GB)
     - Number of indexes
     - Dead tuples count
     - Live tuple ratio (% of active vs deleted rows)
   - **Maintenance Information:**
     - Last VACUUM timestamp
     - Last ANALYZE timestamp
   - **Bloat Analysis:**
     - Estimated bloat percentage
     - Estimated bloat size
     - Maintenance recommendations
   - **Index Statistics:**
     - Index name and size
     - Scan counts (how often used)
     - Tuples read and fetched
     - Last used timestamp
     - Unused index detection

3. **Actions Available:**
   - **Refresh** - Reload all statistics
   - **Run VACUUM** - Reclaim storage space from dead tuples
   - **Run ANALYZE** - Update query planner statistics

4. **Health Indicators:**
   - 🟢 Green: Good health (live ratio > 80%, bloat < 20%)
   - 🟡 Yellow: Monitor recommended (bloat 20-30%)
   - 🔴 Red: Action needed (bloat > 30%, unused indexes)

### Database Backup and Restore

Create and restore full database backups using PostgreSQL's native tools:

#### Prerequisites
- PostgreSQL client tools installed (`pg_dump` and `pg_restore`)
- Sufficient disk space for backup files
- Database access permissions

#### Backup Database

1. **Start Backup:**
   - Right-click on a connected database in the tree view
   - Select "Backup Database"
   - Or use Command Palette: `PostgreSQL: Backup Database`

2. **Select Format:**
   - **Custom (recommended)** - Compressed binary format, best for restore flexibility
   - **Plain SQL** - Human-readable SQL script
   - **Directory** - Directory format supporting parallel operations
   - **Tar** - Tar archive format

3. **Choose Save Location:**
   - File picker opens with suggested filename (includes timestamp)
   - Select destination folder and confirm

4. **Monitor Progress:**
   - Progress notification shows backup status
   - Completion message displays saved file path

**Backup Features:**
- Automatic timestamp in filename
- Progress tracking during backup
- Multiple format options for different use cases
- Full transaction consistency
- Compressed output (custom format)

#### Restore Database

⚠️ **Warning:** Restoring will modify your database. Always backup first!

1. **Start Restore:**
   - Right-click on a connected database in the tree view
   - Select "Restore Database"
   - Or use Command Palette: `PostgreSQL: Restore Database`

2. **Confirmation:**
   - Warning dialog appears
   - Requires explicit "Continue" confirmation

3. **Select Backup File:**
   - File picker opens
   - Supports .dump, .tar, and .sql files
   - Automatically detects file format

4. **Restore Options:**
   - **Clean Mode:**
     - **No** - Add to existing database (merge)
     - **Yes** - Drop existing objects before restore (clean slate)

5. **Monitor Progress:**
   - Progress notification shows restore status
   - Completion refreshes database tree view

**Restore Features:**
- Automatic format detection
- Single transaction mode (all-or-nothing)
- IF EXISTS safety (prevents errors on missing objects)
- No owner restore (avoids permission issues)
- Progress tracking during restore

**Safety Tips:**
- Always create a backup before restoring
- Test restores on a development database first
- Use clean mode carefully - it drops existing objects
- Large databases may take several minutes

## Keyboard Shortcuts

Currently no custom keyboard shortcuts are defined. You can add them in VSCode settings.

## Database Support
- PostgreSQL 10+

## Troubleshooting

### Connection fails
- Verify your connection string details
- Check if PostgreSQL server is running
- Ensure firewall allows connections
- For SSL errors, try toggling the SSL option

### Changes not saving
- Ensure table has a primary key
- Check you have write permissions on the table
- Review SQL preview for any syntax errors

### JSON editing issues
- Ensure JSON is valid before saving
- Large JSON objects may take time to load
- Use the JSON modal editor for complex structures

## Development

### Building from source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on changes)
npm run watch

# Run tests
npm run test
```

### Publishing

To publish to the VSCode Marketplace:

1. Update `publisher` field in package.json
2. Create a Personal Access Token from Azure DevOps
3. Install vsce: `npm install -g @vscode/vsce`
4. Package: `vsce package`
5. Publish: `vsce publish`

## Security

- Passwords are stored using VSCode's SecretStorage API
- Connections are encrypted in the extension context
- Never stores passwords in plain text
- SSL connections supported for encrypted data transfer

## Known Limitations

- 100 row pagination (configurable in code)
- Requires tables to have primary keys for updates/deletes
- No support for altering table structure (columns, indexes, etc.)
- No support for stored procedures or functions
- Complex data types (arrays, custom types) shown as strings (arrays and enums have improved handling; enums show a select UI, arrays are normalized and editable via the JSON editor)

## Contributing

This is a custom extension. To modify:

1. Edit TypeScript files in `src/`
2. Run `npm run compile`
3. Press F5 to test in Extension Development Host

## License

MIT License - Feel free to modify and distribute

## Support

For issues or questions, review the code comments in each TypeScript file for detailed implementation notes.

## Release Notes & Packaging

### Recent Release Activity
- Phase 6 (Testing & QA) completed: comprehensive Jest test coverage added; integration test scaffolding and documentation added. See `CHANGELOG.md` and `docs/TESTING.md` for full details.

### Packaging
To create a package (`.vsix`) for local distribution:

```bash
# Build webview and compile
npm run build:webview
npm run compile

# Package extension
npx vsce package
```

To publish to the Marketplace:

1. Ensure `publisher` is set in `package.json`.
2. Create a Personal Access Token (PAT) with Marketplace permissions.
3. Run:

```bash
npx vsce publish
```

Note: Automated publishing requires securely storing a PAT as a secret in your CI system.
