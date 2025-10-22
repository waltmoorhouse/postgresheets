import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConnectionManager } from './connectionManager';
import { CsvExporter } from './csvExporter';
import { DatabaseTreeItem } from './databaseTreeProvider';

interface ColumnDefinition {
	name: string;
	type: string;
}

/**
 * CSV Import Wizard - provides a user-friendly interface for importing CSV data
 */
export class CsvImportWizard {
	private readonly context: vscode.ExtensionContext;
	private readonly connectionManager: ConnectionManager;
	private readonly refreshTree: () => void;
	private panel: vscode.WebviewPanel | undefined;

	private csvData: string[][] = [];
	private tableName = '';
	private schemaName = '';
	private connectionId = '';
	private tableColumns: ColumnDefinition[] = [];

	constructor(
		context: vscode.ExtensionContext,
		connectionManager: ConnectionManager,
		refreshTree: () => void
	) {
		this.context = context;
		this.connectionManager = connectionManager;
		this.refreshTree = refreshTree;
	}

	/**
	 * Open the CSV import wizard
	 */
	async openWizard(item: DatabaseTreeItem): Promise<void> {
		if (!item || item.type !== 'table') {
			vscode.window.showErrorMessage('Import from CSV must be invoked on a table node.');
			return;
		}

		this.tableName = item.label as string;
		this.connectionId = item.connectionId || '';
		this.schemaName = item.schemaName || 'public';

		// Step 1: Let user select CSV file
		const csvData = await CsvExporter.importFromFile();
		if (!csvData) {
			return; // User cancelled
		}

		this.csvData = csvData.rows;

		// Step 2: Get table columns
		const client = await this.connectionManager.getClient(this.connectionId);
		if (!client) {
			vscode.window.showErrorMessage('Could not connect to database');
			return;
		}

		try {
			const columnsResult = await client.query(
				`
				SELECT column_name, data_type
				FROM information_schema.columns
				WHERE table_schema = $1 AND table_name = $2
				ORDER BY ordinal_position
			`,
				[this.schemaName, this.tableName]
			);

			this.tableColumns = columnsResult.rows.map((row) => ({
				name: row.column_name,
				type: row.data_type
			}));

			if (this.tableColumns.length === 0) {
				vscode.window.showErrorMessage(`Could not find columns for table ${this.tableName}`);
				return;
			}

			// Step 3: Create and show webview panel
			await this.createWebviewPanel(client);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to prepare import: ${error}`);
		}
	}

	private async createWebviewPanel(client: any): Promise<void> {
		const panel = vscode.window.createWebviewPanel(
			'postgresCSVImport',
			`Import CSV to ${this.tableName}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		this.panel = panel;

		const nonce = this.getNonce();
		const cspSource = panel.webview.cspSource;

		try {
			const scriptUri = panel.webview.asWebviewUri(
				vscode.Uri.joinPath(this.context.extensionUri, 'media', 'csv-import', 'main.js')
			);
			const globalStyleUri = panel.webview.asWebviewUri(
				vscode.Uri.joinPath(this.context.extensionUri, 'media', 'app.css')
			);
			const wizardStyleUri = panel.webview.asWebviewUri(
				vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main6.css')
			);

			panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
	  <link rel="stylesheet" href="${globalStyleUri}">
	  <link rel="stylesheet" href="${wizardStyleUri}">
  <title>Import CSV</title>
</head>
<body>
  <div id="app">Loading…</div>
  <script nonce="${nonce}">
    window.initialState = {};
    window.acquireVsCodeApi = acquireVsCodeApi;
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;

			// Handle messages from webview
			panel.webview.onDidReceiveMessage(
				async (message) => {
					await this.handleWebviewMessage(message, client);
				},
				undefined,
				this.context.subscriptions
			);

			// Send initial data to webview
			panel.webview.postMessage({
				command: 'initializeWizard',
				csvData: this.csvData,
				tableColumns: this.tableColumns,
				tableName: this.tableName
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create import wizard: ${error}`);
		}
	}

	private async handleWebviewMessage(message: any, client: any): Promise<void> {
		switch (message.command) {
			case 'closeWizard':
				this.panel?.dispose();
				break;

			case 'validatePreview':
				await this.validatePreview(message, client);
				break;

			case 'executeImport':
				await this.executeImport(message, client);
				break;
		}
	}

	private async validatePreview(message: any, client: any): Promise<void> {
		const { mapping, firstRowIsHeaders, totalDataRows } = message;
		const errors: string[] = [];

		try {
			// Validate column mapping
			const mappedCols = Object.values(mapping).filter((c) => c !== null);
			if (mappedCols.length === 0) {
				errors.push('At least one column must be mapped');
			}

			// Check for not-null columns that might not be mapped
			const getNotNullCols = await client.query(
				`
				SELECT column_name
				FROM information_schema.columns
				WHERE table_schema = $1 AND table_name = $2 AND is_nullable = 'NO'
				AND column_default IS NULL
			`,
				[this.schemaName, this.tableName]
			);

			const notNullCols = getNotNullCols.rows.map((r: any) => r.column_name);
			for (const col of notNullCols) {
				if (!mappedCols.includes(col)) {
					errors.push(`Column "${col}" is NOT NULL but not mapped - rows may fail to insert`);
				}
			}

			// Send results to webview
			this.panel?.webview.postMessage({
				command: 'validationResults',
				errors
			});
		} catch (error) {
			this.panel?.webview.postMessage({
				command: 'validationResults',
				errors: [`Validation error: ${error}`]
			});
		}
	}

	private async executeImport(message: any, client: any): Promise<void> {
		const { mapping, firstRowIsHeaders } = message;

		try {
			const dataRowStart = firstRowIsHeaders ? 1 : 0;
			const dataRows = this.csvData.slice(dataRowStart);

			if (dataRows.length === 0) {
				this.panel?.webview.postMessage({
					command: 'importError',
					message: 'No data rows to import'
				});
				return;
			}

			// Convert types and prepare data
			const typedRows = dataRows.map((row) => {
				const typedRow: Record<string, unknown> = {};
				for (const [csvIdx, tableCol] of Object.entries(mapping)) {
					if (!tableCol) continue; // Skip unmapped columns
					const idx = parseInt(csvIdx);
					const colDef = this.tableColumns.find((c) => c.name === tableCol as string);
					if (idx < row.length && colDef) {
						typedRow[colDef.name] = CsvExporter.convertValue(row[idx], colDef.type);
					}
				}
				return typedRow;
			});

			// Build INSERT statements
			const columns = Object.values(mapping).filter((c) => c !== null) as string[];
			const insertStatements = typedRows.map((row) => {
				const values = columns.map((col) => row[col] ?? null);
				const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
				const sql = `INSERT INTO "${this.schemaName}"."${this.tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
				return { sql, values };
			});

			// Execute in transaction
			await client.query('BEGIN');
			try {
				for (const stmt of insertStatements) {
					await client.query(stmt.sql, stmt.values);
				}
				await client.query('COMMIT');

				this.panel?.webview.postMessage({
					command: 'importSuccess',
					message: `Successfully imported ${dataRows.length} rows into ${this.tableName}`
				});

				// Refresh tree
				this.refreshTree();

				// Close panel after 2 seconds
				setTimeout(() => {
					this.panel?.dispose();
				}, 2000);
			} catch (error) {
				await client.query('ROLLBACK');
				throw error;
			}
		} catch (error) {
			this.panel?.webview.postMessage({
				command: 'importError',
				message: `Import failed: ${error}`
			});
		}
	}

	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
