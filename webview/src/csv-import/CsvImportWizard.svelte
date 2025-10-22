<script lang="ts">
	import { onMount } from 'svelte';
	import type { VSCodeApi } from '../lib/vscode';

	let vscode: VSCodeApi;

	interface TableColumn {
		name: string;
		type: string;
	}

	interface PreviewRow {
		csvValues: string[];
		mappedValues: Record<string, any>;
		errors: string[];
	}

	// State
	let step: 'loading' | 'headers' | 'mapping' | 'preview' | 'validating' | 'success' | 'error' =
		'loading';
	let csvData: string[][] = [];
	let tableColumns: TableColumn[] = [];
	let csvHeaders: string[] = [];
	let columnMapping: Record<number, string | null> = {};
	let firstRowIsHeaders = true;
	let previewRows: PreviewRow[] = [];
	let validationErrors: string[] = [];
	let tableName = '';
	let successMessage = '';
	let errorMessage = '';

	onMount(async () => {
		// @ts-ignore
		vscode = acquireVsCodeApi?.();

		// Listen for messages from extension
		window.addEventListener('message', (event: MessageEvent) => {
			const message = event.data;

			switch (message.command) {
				case 'initializeWizard':
					handleInitialize(message);
					break;
				case 'validationResults':
					handleValidationResults(message);
					break;
				case 'importSuccess':
					step = 'success';
					successMessage = message.message;
					setTimeout(() => {
						vscode.postMessage({ command: 'closeWizard' });
					}, 2000);
					break;
				case 'importError':
					step = 'error';
					errorMessage = message.message;
					break;
			}
		});

		// Request initialization
		vscode.postMessage({ command: 'getInitialData' });
	});

	function handleInitialize(message: any) {
		csvData = message.csvData;
		tableColumns = message.tableColumns;
		tableName = message.tableName;

		// Detect if first row might be headers
		if (csvData.length > 0) {
			// Simple heuristic: if first row values look like column names
			const firstRow = csvData[0];
			let looksLikeHeaders = true;

			// Check if any values in first row are numeric (unlikely for headers)
			for (const val of firstRow) {
				if (/^\d+$/.test(val.trim())) {
					looksLikeHeaders = false;
					break;
				}
			}

			if (looksLikeHeaders) {
				csvHeaders = firstRow;
				step = 'headers';
			} else {
				firstRowIsHeaders = false;
				initializeMapping();
				step = 'mapping';
			}
		}
	}

	function handleValidationResults(message: any) {
		validationErrors = message.errors;
		// Stay on preview step either way - user can see results and decide
		step = 'preview';
	}

	function toggleFirstRowHeaders() {
		firstRowIsHeaders = !firstRowIsHeaders;
		if (firstRowIsHeaders && csvData.length > 0) {
			csvHeaders = csvData[0];
		}
		initializeMapping();
	}

	function initializeMapping() {
		columnMapping = {};

		const dataRowStart = firstRowIsHeaders ? 1 : 0;
		const firstDataRow = csvData[dataRowStart] || [];

		// Auto-map by matching header names to column names
		if (firstRowIsHeaders && csvHeaders.length > 0) {
			for (let i = 0; i < csvHeaders.length; i++) {
				const header = csvHeaders[i].trim().toLowerCase();
				const matchedCol = tableColumns.find((c) => c.name.toLowerCase() === header);
				if (matchedCol) {
					columnMapping[i] = matchedCol.name;
				}
			}
		} else {
			// Map by position
			for (let i = 0; i < Math.min(firstDataRow.length, tableColumns.length); i++) {
				columnMapping[i] = tableColumns[i].name;
			}
		}
	}

	function updateMapping(csvIndex: number, tableName: string | null) {
		columnMapping[csvIndex] = tableName;
	}

	function generatePreview() {
		previewRows = [];
		const dataRowStart = firstRowIsHeaders ? 1 : 0;
		const rowsToPreview = Math.min(5, csvData.length - dataRowStart);

		for (let i = 0; i < rowsToPreview; i++) {
			const csvRow = csvData[dataRowStart + i];
			const mappedValues: Record<string, any> = {};
			const errors: string[] = [];

			for (const [csvIdx, colName] of Object.entries(columnMapping)) {
				const idx = parseInt(csvIdx);
				if (colName && idx < csvRow.length) {
					const colDef = tableColumns.find((c) => c.name === colName);
					if (colDef) {
						try {
							mappedValues[colName] = convertValue(csvRow[idx], colDef.type);
						} catch (e) {
							errors.push(`${colName}: Invalid ${colDef.type}`);
							mappedValues[colName] = csvRow[idx];
						}
					}
				}
			}

			previewRows.push({
				csvValues: csvRow,
				mappedValues,
				errors
			});
		}

		step = 'preview';

		// Request validation
		requestValidation();
	}

	function convertValue(value: string, pgType: string): any {
		if (!value || value.trim() === '') {
			return null;
		}

		const baseType = pgType.toLowerCase().split('(')[0].replace('[]', '');

		switch (baseType) {
			case 'boolean':
			case 'bool':
				return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
			case 'integer':
			case 'int':
			case 'int2':
			case 'int4':
			case 'int8':
			case 'smallint':
			case 'bigint':
				return parseInt(value, 10);
			case 'numeric':
			case 'decimal':
			case 'real':
			case 'double':
			case 'float':
			case 'float4':
			case 'float8':
				return parseFloat(value);
			case 'json':
			case 'jsonb':
				return JSON.parse(value);
			case 'date':
				return new Date(value).toISOString().split('T')[0];
			case 'timestamp':
			case 'timestamptz':
			case 'timestamp without time zone':
			case 'timestamp with time zone':
				return new Date(value).toISOString();
			case 'uuid':
				return value.trim();
			default:
				return value;
		}
	}

	function requestValidation() {
		vscode.postMessage({
			command: 'validatePreview',
			mapping: columnMapping,
			firstRowIsHeaders,
			previewRows,
			totalDataRows: csvData.length - (firstRowIsHeaders ? 1 : 0)
		});
	}

	function proceedToImport() {
		if (validationErrors.length === 0) {
			step = 'validating';
			vscode.postMessage({
				command: 'executeImport',
				mapping: columnMapping,
				firstRowIsHeaders,
				totalRows: csvData.length - (firstRowIsHeaders ? 1 : 0)
			});
		}
	}

	function retryMapping() {
		validationErrors = [];
		step = 'mapping';
	}

	function cancel() {
		vscode.postMessage({ command: 'closeWizard' });
	}
</script>

<div class="csv-import-wizard">
	{#if step === 'loading'}
		<div class="step-container">
			<h2>Loading CSV Import Wizard...</h2>
			<p>Please wait...</p>
		</div>
	{:else if step === 'headers'}
		<div class="step-container">
			<h2>CSV Format</h2>
			<p>Does your CSV file have headers in the first row?</p>
			<div class="button-group">
				<button
					class="btn btn-primary"
					on:click={() => {
						firstRowIsHeaders = true;
						initializeMapping();
						step = 'mapping';
					}}
				>
					✓ Yes, first row is headers
				</button>
				<button class="btn" on:click={toggleFirstRowHeaders}>✗ No, first row is data</button>
			</div>
		</div>
	{:else if step === 'mapping'}
		<div class="step-container">
			<h2>Map CSV Columns</h2>
			<p>Match CSV columns to database columns:</p>

			<div class="mapping-table">
				<div class="mapping-header">
					<div class="col-csv">CSV Column</div>
					<div class="col-arrow">→</div>
					<div class="col-table">Database Column</div>
				</div>

				{#each csvData[0] || [] as _, csvIdx (csvIdx)}
					<div class="mapping-row">
						<div class="col-csv">
							{#if firstRowIsHeaders}
								<strong>{csvHeaders[csvIdx] || `Column ${csvIdx + 1}`}</strong>
								<br />
								<small>{csvData[1]?.[csvIdx] || '(no preview)'}</small>
							{:else}
								<small>Col {csvIdx + 1}</small>
								<br />
								<small>{csvData[csvIdx]?.[csvIdx] || '(no preview)'}</small>
							{/if}
						</div>
						<div class="col-arrow">→</div>
						<div class="col-table">
							<select value={columnMapping[csvIdx] || ''} on:change={(e) => updateMapping(csvIdx, e.target.value || null)}>
								<option value="">-- Skip column --</option>
								{#each tableColumns as col (col.name)}
									<option value={col.name}>{col.name} ({col.type})</option>
								{/each}
							</select>
						</div>
					</div>
				{/each}
			</div>

			<div class="button-group">
				<button class="btn btn-primary" on:click={generatePreview}> Preview Data </button>
				<button class="btn" on:click={cancel}>Cancel</button>
			</div>
		</div>
	{:else if step === 'preview'}
		<div class="step-container">
			<h2>Preview Import</h2>
			<p>Review how your data will be imported (showing first {previewRows.length} rows):</p>

			<div class="preview-table">
				<div class="preview-header">
					{#each Object.keys(columnMapping).filter((k) => columnMapping[parseInt(k)] !== null) as csvIdx (csvIdx)}
						<div class="preview-col">
							<strong>{columnMapping[parseInt(csvIdx)]}</strong>
						</div>
					{/each}
				</div>

				{#each previewRows as row, rowIdx (rowIdx)}
					<div class="preview-row" class:has-errors={row.errors.length > 0}>
						{#each Object.keys(columnMapping).filter((k) => columnMapping[parseInt(k)] !== null) as csvIdx (csvIdx)}
							<div class="preview-col">
								<code>{JSON.stringify(row.mappedValues[columnMapping[parseInt(csvIdx)]] ?? '')}</code>
							</div>
						{/each}
					</div>
					{#if row.errors.length > 0}
						<div class="preview-errors">
							{#each row.errors as error (error)}
								<div class="error">⚠ {error}</div>
							{/each}
						</div>
					{/if}
				{/each}
			</div>

			{#if validationErrors.length > 0}
				<div class="validation-errors">
					<h3>Validation Issues:</h3>
					{#each validationErrors as error (error)}
						<div class="error-item">• {error}</div>
					{/each}
				</div>

				<div class="button-group">
					<button class="btn" on:click={retryMapping}>← Back to Mapping</button>
					<button class="btn" on:click={cancel}>Cancel</button>
				</div>
			{:else}
				<p class="success-text">✓ Preview looks good! Ready to import.</p>
				<div class="button-group">
					<button class="btn" on:click={retryMapping}>← Back to Mapping</button>
					<button class="btn btn-primary" on:click={proceedToImport}>
						Import {csvData.length - (firstRowIsHeaders ? 1 : 0)} Rows
					</button>
					<button class="btn" on:click={cancel}>Cancel</button>
				</div>
			{/if}
		</div>
	{:else if step === 'validating'}
		<div class="step-container">
			<h2>Importing Data...</h2>
			<div class="spinner"></div>
			<p>Processing your data, please wait...</p>
		</div>
	{:else if step === 'success'}
		<div class="step-container success">
			<h2>✓ Import Successful!</h2>
			<p>{successMessage}</p>
		</div>
	{:else if step === 'error'}
		<div class="step-container error">
			<h2>✗ Import Failed</h2>
			<p>{errorMessage}</p>
			<button class="btn" on:click={cancel}>Close</button>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background-color: var(--vscode-editor-background);
		color: var(--vscode-editor-foreground);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
	}

	.csv-import-wizard {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 0;
	}

	.step-container {
		flex: 1;
		padding: 2rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	h2 {
		margin-top: 0;
		margin-bottom: 1rem;
		color: var(--vscode-editor-foreground);
	}

	h3 {
		margin-top: 1rem;
		margin-bottom: 0.5rem;
		color: var(--vscode-editor-foreground);
	}

	p {
		margin: 0.5rem 0;
		color: var(--vscode-editor-foreground);
	}

	.button-group {
		display: flex;
		gap: 0.5rem;
		margin-top: auto;
		margin-bottom: 0;
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: 1px solid var(--vscode-button-border);
		background-color: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
		border-radius: 4px;
		cursor: pointer;
		font-family: var(--vscode-font-family);
		font-size: 0.9rem;
	}

	.btn:hover {
		background-color: var(--vscode-button-secondaryHoverBackground);
	}

	.btn-primary {
		background-color: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}

	.btn-primary:hover {
		background-color: var(--vscode-button-hoverBackground);
	}

	.mapping-table {
		background-color: var(--vscode-editor-background);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		overflow: auto;
		margin: 1rem 0;
		max-height: 300px;
	}

	.mapping-header {
		display: grid;
		grid-template-columns: 1fr 40px 1fr;
		gap: 0.5rem;
		padding: 0.75rem;
		background-color: var(--vscode-titleBar-inactiveBackground);
		border-bottom: 1px solid var(--vscode-panel-border);
		font-weight: bold;
		position: sticky;
		top: 0;
	}

	.mapping-row {
		display: grid;
		grid-template-columns: 1fr 40px 1fr;
		gap: 0.5rem;
		padding: 0.75rem;
		border-bottom: 1px solid var(--vscode-panel-border);
		align-items: center;
	}

	.col-csv,
	.col-table {
		padding: 0.5rem;
	}

	.col-csv small {
		display: block;
		color: var(--vscode-textCodeBlock-background);
		font-size: 0.85em;
	}

	.col-arrow {
		text-align: center;
		color: var(--vscode-textCodeBlock-background);
	}

	select {
		width: 100%;
		padding: 0.5rem;
		background-color: var(--vscode-dropdown-background);
		color: var(--vscode-dropdown-foreground);
		border: 1px solid var(--vscode-dropdown-border);
		border-radius: 3px;
		font-family: var(--vscode-font-family);
		font-size: 0.9rem;
	}

	select:focus {
		outline: none;
		border-color: var(--vscode-focusBorder);
	}

	.preview-table {
		background-color: var(--vscode-editor-background);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		overflow: auto;
		margin: 1rem 0;
		max-height: 400px;
	}

	.preview-header {
		display: grid;
		grid-auto-columns: minmax(150px, 1fr);
		grid-auto-flow: column;
		gap: 0.5rem;
		padding: 0.75rem;
		background-color: var(--vscode-titleBar-inactiveBackground);
		border-bottom: 1px solid var(--vscode-panel-border);
		font-weight: bold;
		position: sticky;
		top: 0;
	}

	.preview-row {
		display: grid;
		grid-auto-columns: minmax(150px, 1fr);
		grid-auto-flow: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-bottom: 1px solid var(--vscode-panel-border);
	}

	.preview-row.has-errors {
		background-color: var(--vscode-editorError-background);
	}

	.preview-col {
		padding: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	code {
		background-color: var(--vscode-textCodeBlock-background);
		color: var(--vscode-textCodeBlock-foreground);
		padding: 0.2rem 0.4rem;
		border-radius: 2px;
		font-family: monospace;
		font-size: 0.85em;
	}

	.preview-errors {
		padding: 0.5rem;
		background-color: var(--vscode-editorWarning-background);
		border-left: 3px solid var(--vscode-editorWarning-foreground);
		margin: 0.5rem 0;
		border-radius: 2px;
	}

	.error,
	.error-item {
		color: var(--vscode-editorWarning-foreground);
		font-size: 0.9rem;
		margin: 0.25rem 0;
	}

	.validation-errors {
		background-color: var(--vscode-editorError-background);
		border: 1px solid var(--vscode-editorError-foreground);
		border-radius: 4px;
		padding: 1rem;
		margin: 1rem 0;
	}

	.validation-errors h3 {
		color: var(--vscode-editorError-foreground);
		margin-top: 0;
	}

	.validation-errors .error-item {
		color: var(--vscode-editorError-foreground);
	}

	.success-text {
		color: var(--vscode-testing-runAction);
		font-weight: bold;
		margin: 1rem 0;
	}

	.step-container.success {
		background-color: var(--vscode-editorGutter-addedBackground);
		align-items: center;
		justify-content: center;
	}

	.step-container.success h2 {
		color: var(--vscode-testing-runAction);
	}

	.step-container.error {
		background-color: var(--vscode-editorError-background);
	}

	.step-container.error h2 {
		color: var(--vscode-editorError-foreground);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--vscode-progressBar-background);
		border-top: 4px solid var(--vscode-button-background);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 1rem auto;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.col-arrow {
		color: var(--vscode-editorCodeLens-foreground);
	}
</style>
