# PostgreSQL Data Editor for VSCode

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

## Discalimer

This code was written with help from AI Coding Agents such as GitHub Copilot. I have performed code reviews and consider it safe enough to use on my machine. 
However, when using code created with GenAI (or really when installing any VSCode extension, even if written by humans) you should do your own code/security review to ensure you trust the product.

## Installation

### Prerequisites

- Node.js 18+ and npm
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
- Complex data types (arrays, custom types) shown as strings

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
