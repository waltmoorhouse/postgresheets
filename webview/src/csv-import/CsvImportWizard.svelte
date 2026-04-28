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
				// Keep as string — pg serializes JS arrays as PG array literals
				// ({1,2,3}) rather than JSON ([1,2,3]), breaking JSON columns.
				return value;
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

	function getSamples(csvColIdx: number, max = 3): string[] {
		const dataStart = firstRowIsHeaders ? 1 : 0;
		const samples: string[] = [];
		for (let i = dataStart; i < csvData.length && samples.length < max; i++) {
			const v = csvData[i]?.[csvColIdx];
			if (v !== undefined && v !== '') {
				samples.push(v);
			}
		}
		return samples;
	}

	function getSelectValue(event: Event): string {
		return (event.target as HTMLSelectElement).value;
	}
</script>

<div class="csv-import-wizard">
	<!-- Step indicator bar -->
	{#if step !== 'loading' && step !== 'success' && step !== 'error' && step !== 'validating'}
		<div class="step-indicator" aria-label="Import steps">
			<div class="step-dot" class:active={step === 'headers'} class:done={step !== 'headers'}>
				<span class="step-num">1</span>
				<span class="step-label">File</span>
			</div>
			<div class="step-line"></div>
			<div class="step-dot" class:active={step === 'mapping'} class:done={step === 'preview'}>
				<span class="step-num">2</span>
				<span class="step-label">Map</span>
			</div>
			<div class="step-line"></div>
			<div class="step-dot" class:active={step === 'preview'}>
				<span class="step-num">3</span>
				<span class="step-label">Preview</span>
			</div>
		</div>
	{/if}

	{#if step === 'loading'}
		<div class="step-container centered">
			<div class="spinner" aria-label="Loading" role="status"></div>
			<p>Loading CSV Import Wizard…</p>
		</div>

	{:else if step === 'headers'}
		<div class="step-container">
			<div class="step-header">
				<h2>Review File &amp; Confirm Headers</h2>
				<p>Importing into <strong>{tableName}</strong> · <span class="meta">{csvData.length} row{csvData.length === 1 ? '' : 's'} detected in file</span></p>
			</div>

			<div class="file-preview" aria-label="CSV file preview">
				<div class="file-preview-header">
					<span class="file-preview-label">File preview</span>
					<span class="badge">{csvData.length} row{csvData.length === 1 ? '' : 's'}</span>
				</div>
				<div class="raw-table-wrap" tabindex="0" role="region" aria-label="CSV data preview, scrollable">
					<table class="raw-table">
						<tbody>
							{#each csvData.slice(0, 10) as row, rowIdx (rowIdx)}
								<tr class:first-row={rowIdx === 0} aria-label={rowIdx === 0 ? 'First row (potential header row)' : `Row ${rowIdx + 1}`}>
									<td class="row-num" aria-hidden="true">{rowIdx + 1}</td>
									{#each row as cell (cell + rowIdx)}
										<td title={cell}>{cell}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
					{#if csvData.length > 10}
						<p class="truncated-note" aria-live="polite">… and {csvData.length - 10} more rows not shown</p>
					{/if}
				</div>
			</div>

			<div class="header-question" role="group" aria-labelledby="header-question-label">
				<p id="header-question-label">Does the <strong>first row</strong> (row 1, highlighted above) contain column headers?</p>
				<div class="button-group">
					<button
						class="btn btn-primary"
						on:click={() => { firstRowIsHeaders = true; csvHeaders = csvData[0] ?? []; initializeMapping(); step = 'mapping'; }}
					>
						✓ Yes — first row is headers
					</button>
					<button
						class="btn"
						on:click={() => { firstRowIsHeaders = false; csvHeaders = []; initializeMapping(); step = 'mapping'; }}
					>
						✗ No — all rows are data
					</button>
					<button class="btn btn-ghost" on:click={cancel}>Cancel</button>
				</div>
			</div>
		</div>

	{:else if step === 'mapping'}
		<div class="step-container">
			<div class="step-header">
				<h2>Map CSV Columns to Database Columns</h2>
				<p>Match each CSV column to the correct database column. Use <em>Skip column</em> to ignore a column.</p>
			</div>

			<div class="mapping-table" role="table" aria-label="Column mapping">
				<div class="mapping-header" role="row">
					<div class="col-csv" role="columnheader">CSV Column</div>
					<div class="col-arrow" role="presentation">→</div>
					<div class="col-table" role="columnheader">Database Column</div>
				</div>

				{#each csvData[0] || [] as _, csvIdx (csvIdx)}
					{@const samples = getSamples(csvIdx)}
					<div class="mapping-row" role="row">
						<div class="col-csv" role="cell">
							{#if firstRowIsHeaders}
								<strong class="csv-col-name">{csvHeaders[csvIdx] || `Column ${csvIdx + 1}`}</strong>
							{:else}
								<strong class="csv-col-name">Column {csvIdx + 1}</strong>
							{/if}
							{#if samples.length > 0}
								<ul class="sample-list" aria-label="Sample values">
									{#each samples as s (s)}
										<li class="sample-value" title={s}>{s}</li>
									{/each}
								</ul>
							{:else}
								<span class="no-sample">(no data)</span>
							{/if}
						</div>
						<div class="col-arrow" role="presentation" aria-hidden="true">→</div>
						<div class="col-table" role="cell">
							<label class="sr-only" for="map-{csvIdx}">
								Map {firstRowIsHeaders ? csvHeaders[csvIdx] || `Column ${csvIdx + 1}` : `Column ${csvIdx + 1}`} to
							</label>
							<select
								id="map-{csvIdx}"
								value={columnMapping[csvIdx] ?? ''}
								on:change={(e) => updateMapping(csvIdx, getSelectValue(e) || null)}
							>
								<option value="">— Skip column —</option>
								{#each tableColumns as col (col.name)}
									<option value={col.name}>{col.name} <span class="type-hint">({col.type})</span></option>
								{/each}
							</select>
							{#if columnMapping[csvIdx]}
								{@const mappedCol = tableColumns.find(c => c.name === columnMapping[csvIdx])}
								{#if mappedCol}
									<small class="type-hint-inline">{mappedCol.type}</small>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<div class="button-group">
				<button class="btn" on:click={() => step = 'headers'}>← Back</button>
				<button class="btn btn-primary" on:click={generatePreview}>Preview Import →</button>
				<button class="btn btn-ghost" on:click={cancel}>Cancel</button>
			</div>
		</div>

	{:else if step === 'preview'}
		{@const mappedKeys = Object.keys(columnMapping).map(Number).filter(k => columnMapping[k] !== null)}
		{@const totalDataRows = csvData.length - (firstRowIsHeaders ? 1 : 0)}
		<div class="step-container">
			<div class="step-header">
				<h2>Preview Import</h2>
				<p>Showing how the first <strong>{previewRows.length}</strong> of <strong>{totalDataRows}</strong> rows will be inserted into <strong>{tableName}</strong>.</p>
			</div>

			<div class="preview-table-wrap" role="region" aria-label="Data preview, scrollable">
				<table class="preview-table" aria-label="Import preview">
					<thead>
						<tr>
							{#each mappedKeys as csvIdx (csvIdx)}
								<th scope="col">
									{columnMapping[csvIdx]}
									{#if tableColumns.find(c => c.name === columnMapping[csvIdx])}
										<small class="type-hint-col">{tableColumns.find(c => c.name === columnMapping[csvIdx])?.type}</small>
									{/if}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each previewRows as row, rowIdx (rowIdx)}
							<tr class:row-has-errors={row.errors.length > 0}>
								{#each mappedKeys as csvIdx (csvIdx)}
									{@const colName = columnMapping[csvIdx]}
									<td
										class:cell-null={row.mappedValues[colName] === null || row.mappedValues[colName] === undefined}
										title={String(row.mappedValues[colName] ?? '')}
									>
										{#if row.mappedValues[colName] === null || row.mappedValues[colName] === undefined}
											<span class="null-badge" aria-label="null">NULL</span>
										{:else}
											{JSON.stringify(row.mappedValues[colName])}
										{/if}
									</td>
								{/each}
							</tr>
							{#if row.errors.length > 0}
								<tr class="error-row" aria-live="polite">
									<td colspan={mappedKeys.length}>
										{#each row.errors as err (err)}
											<span class="inline-error">⚠ {err}</span>
										{/each}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
				{#if totalDataRows > previewRows.length}
					<p class="truncated-note">… and {totalDataRows - previewRows.length} more rows not previewed</p>
				{/if}
			</div>

			{#if validationErrors.length > 0}
				<div class="validation-errors" role="alert">
					<h3>⚠ Validation Issues</h3>
					<ul>
						{#each validationErrors as error (error)}
							<li>{error}</li>
						{/each}
					</ul>
					<p class="warning-note">You can still proceed, but some rows may fail to insert.</p>
				</div>
			{:else}
				<div class="validation-ok" role="status" aria-live="polite">
					✓ No issues detected. Ready to import.
				</div>
			{/if}

			<div class="import-summary">
				<span><strong>{mappedKeys.length}</strong> column{mappedKeys.length === 1 ? '' : 's'} mapped</span>
				<span>·</span>
				<span><strong>{totalDataRows}</strong> row{totalDataRows === 1 ? '' : 's'} to import</span>
				<span>·</span>
				<span>Target: <strong>{tableName}</strong></span>
			</div>

			<div class="button-group">
				<button class="btn" on:click={retryMapping}>← Back to Mapping</button>
				<button class="btn btn-primary" on:click={proceedToImport}>
					Import {totalDataRows} Row{totalDataRows === 1 ? '' : 's'}
				</button>
				<button class="btn btn-ghost" on:click={cancel}>Cancel</button>
			</div>
		</div>

	{:else if step === 'validating'}
		<div class="step-container centered">
			<div class="spinner" aria-label="Importing" role="status"></div>
			<h2>Importing Data…</h2>
			<p>Inserting rows into <strong>{tableName}</strong>, please wait.</p>
		</div>

	{:else if step === 'success'}
		<div class="step-container centered success" role="status">
			<div class="success-icon" aria-hidden="true">✓</div>
			<h2>Import Successful</h2>
			<p>{successMessage}</p>
		</div>

	{:else if step === 'error'}
		<div class="step-container centered error" role="alert">
			<div class="error-icon" aria-hidden="true">✗</div>
			<h2>Import Failed</h2>
			<p>{errorMessage}</p>
			<div class="button-group">
				<button class="btn" on:click={retryMapping}>← Try Again</button>
				<button class="btn btn-ghost" on:click={cancel}>Close</button>
			</div>
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

	/* ── Layout ── */
	.csv-import-wizard {
		width: 100%;
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.step-container {
		flex: 1;
		padding: 1.5rem 2rem 1rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.step-container.centered {
		align-items: center;
		justify-content: center;
		text-align: center;
	}

	/* ── Step indicator ── */
	.step-indicator {
		display: flex;
		align-items: center;
		padding: 0.75rem 2rem;
		border-bottom: 1px solid var(--vscode-panel-border);
		background-color: var(--vscode-titleBar-inactiveBackground);
		gap: 0;
	}

	.step-dot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.step-num {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: bold;
		border: 2px solid var(--vscode-panel-border);
		background-color: var(--vscode-editor-background);
		color: var(--vscode-descriptionForeground);
	}

	.step-dot.active .step-num {
		border-color: var(--vscode-button-background);
		background-color: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}

	.step-dot.done .step-num {
		border-color: var(--vscode-testing-runAction);
		background-color: var(--vscode-testing-runAction, #4caf50);
		color: #fff;
	}

	.step-label {
		font-size: 0.75rem;
		color: var(--vscode-descriptionForeground);
	}

	.step-dot.active .step-label {
		color: var(--vscode-foreground);
		font-weight: bold;
	}

	.step-line {
		flex: 1;
		height: 2px;
		background-color: var(--vscode-panel-border);
		margin: 0 0.5rem;
		margin-bottom: 1rem; /* align with num centres */
	}

	/* ── Step header ── */
	.step-header {
		margin-bottom: 0.25rem;
	}

	.step-header h2 {
		margin: 0 0 0.25rem;
		font-size: 1.15rem;
	}

	.step-header p {
		margin: 0;
		color: var(--vscode-descriptionForeground);
		font-size: 0.9rem;
	}

	.meta {
		color: var(--vscode-descriptionForeground);
	}

	/* ── Typography ── */
	h2 {
		margin-top: 0;
		margin-bottom: 0.5rem;
		color: var(--vscode-editor-foreground);
	}

	h3 {
		margin: 0.5rem 0 0.25rem;
		color: var(--vscode-editor-foreground);
	}

	p {
		margin: 0.25rem 0;
		color: var(--vscode-editor-foreground);
	}

	/* ── Badge ── */
	.badge {
		display: inline-block;
		background-color: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
		border-radius: 10px;
		padding: 1px 7px;
		font-size: 0.75rem;
		font-weight: normal;
		vertical-align: middle;
	}

	/* ── Buttons ── */
	.button-group {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.75rem;
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.45rem 1rem;
		border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
		background-color: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
		border-radius: 4px;
		cursor: pointer;
		font-family: var(--vscode-font-family);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.btn:hover {
		background-color: var(--vscode-button-secondaryHoverBackground);
	}

	.btn:focus-visible {
		outline: 2px solid var(--vscode-focusBorder);
		outline-offset: 2px;
	}

	.btn-primary {
		background-color: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
		border-color: transparent;
	}

	.btn-primary:hover {
		background-color: var(--vscode-button-hoverBackground);
	}

	.btn-ghost {
		background-color: transparent;
		color: var(--vscode-descriptionForeground);
		border-color: transparent;
	}

	.btn-ghost:hover {
		color: var(--vscode-foreground);
		background-color: var(--vscode-list-hoverBackground);
	}

	/* ── File preview (headers step) ── */
	.file-preview {
		background-color: var(--vscode-editor-background);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 5px;
		overflow: hidden;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.file-preview-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background-color: var(--vscode-titleBar-inactiveBackground);
		border-bottom: 1px solid var(--vscode-panel-border);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.file-preview-label {
		color: var(--vscode-descriptionForeground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.75rem;
	}

	.raw-table-wrap {
		overflow: auto;
		flex: 1;
	}

	.raw-table {
		border-collapse: collapse;
		width: max-content;
		min-width: 100%;
		font-size: 0.875rem;
	}

	.raw-table td {
		border: 1px solid var(--vscode-panel-border);
		padding: 0.3rem 0.7rem;
		white-space: nowrap;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.raw-table td.row-num {
		color: var(--vscode-descriptionForeground);
		background-color: var(--vscode-titleBar-inactiveBackground);
		font-size: 0.75rem;
		text-align: right;
		min-width: 2rem;
		user-select: none;
		border-right: 2px solid var(--vscode-panel-border);
	}

	.raw-table tr.first-row td {
		background-color: var(--vscode-list-activeSelectionBackground);
		color: var(--vscode-list-activeSelectionForeground);
		font-weight: 600;
	}

	.raw-table tr.first-row td.row-num {
		background-color: var(--vscode-list-activeSelectionBackground);
		color: var(--vscode-list-activeSelectionForeground);
	}

	.header-question {
		padding-top: 0.25rem;
	}

	.truncated-note {
		text-align: center;
		font-size: 0.8rem;
		color: var(--vscode-descriptionForeground);
		padding: 0.5rem;
		font-style: italic;
	}

	/* ── Mapping table ── */
	.mapping-table {
		background-color: var(--vscode-editor-background);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 5px;
		overflow: auto;
		flex: 1;
		min-height: 0;
	}

	.mapping-header {
		display: grid;
		grid-template-columns: 1fr 36px 1fr;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background-color: var(--vscode-titleBar-inactiveBackground);
		border-bottom: 1px solid var(--vscode-panel-border);
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--vscode-descriptionForeground);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.mapping-row {
		display: grid;
		grid-template-columns: 1fr 36px 1fr;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--vscode-panel-border);
		align-items: start;
	}

	.mapping-row:last-child {
		border-bottom: none;
	}

	.col-csv {
		padding: 0.25rem 0.5rem;
	}

	.col-table {
		padding: 0.25rem 0.5rem;
	}

	.csv-col-name {
		display: block;
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--vscode-editor-foreground);
		margin-bottom: 0.25rem;
	}

	.sample-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sample-value {
		font-size: 0.8rem;
		color: var(--vscode-descriptionForeground);
		background-color: var(--vscode-textCodeBlock-background);
		padding: 1px 5px;
		border-radius: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 220px;
	}

	.no-sample {
		font-size: 0.8rem;
		color: var(--vscode-descriptionForeground);
		font-style: italic;
	}

	.col-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--vscode-editorCodeLens-foreground);
		padding-top: 0.4rem;
	}

	.type-hint-inline {
		display: block;
		font-size: 0.75rem;
		color: var(--vscode-descriptionForeground);
		margin-top: 0.25rem;
	}

	select {
		width: 100%;
		padding: 0.4rem 0.5rem;
		background-color: var(--vscode-dropdown-background);
		color: var(--vscode-dropdown-foreground);
		border: 1px solid var(--vscode-dropdown-border);
		border-radius: 3px;
		font-family: var(--vscode-font-family);
		font-size: 0.875rem;
	}

	select:focus {
		outline: 2px solid var(--vscode-focusBorder);
		outline-offset: 1px;
	}

	/* ── Preview table ── */
	.preview-table-wrap {
		border: 1px solid var(--vscode-panel-border);
		border-radius: 5px;
		overflow: auto;
		flex: 1;
		min-height: 0;
	}

	.preview-table {
		border-collapse: collapse;
		width: max-content;
		min-width: 100%;
		font-size: 0.875rem;
	}

	.preview-table thead th {
		padding: 0.5rem 0.75rem;
		background-color: var(--vscode-titleBar-inactiveBackground);
		border-bottom: 2px solid var(--vscode-panel-border);
		border-right: 1px solid var(--vscode-panel-border);
		text-align: left;
		white-space: nowrap;
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.preview-table thead th:last-child {
		border-right: none;
	}

	.type-hint-col {
		display: block;
		font-size: 0.7rem;
		font-weight: normal;
		color: var(--vscode-descriptionForeground);
	}

	.preview-table tbody td {
		padding: 0.35rem 0.75rem;
		border-bottom: 1px solid var(--vscode-panel-border);
		border-right: 1px solid var(--vscode-panel-border);
		white-space: nowrap;
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.preview-table tbody td:last-child {
		border-right: none;
	}

	.preview-table tr.row-has-errors td {
		background-color: color-mix(in srgb, var(--vscode-editorError-background) 30%, transparent);
	}

	.preview-table tr.error-row td {
		background-color: var(--vscode-editorError-background);
		border-left: 3px solid var(--vscode-editorError-foreground);
		padding: 0.25rem 0.75rem;
		font-size: 0.8rem;
	}

	.null-badge {
		font-size: 0.7rem;
		color: var(--vscode-descriptionForeground);
		background-color: var(--vscode-badge-background);
		border-radius: 3px;
		padding: 1px 5px;
		font-family: monospace;
	}

	.cell-null {
		opacity: 0.6;
	}

	.inline-error {
		color: var(--vscode-editorError-foreground);
		margin-right: 0.75rem;
	}

	/* ── Validation/status panels ── */
	.validation-errors {
		background-color: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.08));
		border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-editorError-foreground));
		border-radius: 4px;
		padding: 0.75rem 1rem;
	}

	.validation-errors h3 {
		color: var(--vscode-editorError-foreground);
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
	}

	.validation-errors ul {
		margin: 0;
		padding-left: 1.5rem;
		color: var(--vscode-editorError-foreground);
		font-size: 0.875rem;
	}

	.validation-errors ul li {
		margin: 0.2rem 0;
	}

	.warning-note {
		font-size: 0.8rem;
		color: var(--vscode-descriptionForeground);
		margin: 0.5rem 0 0;
	}

	.validation-ok {
		background-color: var(--vscode-inputValidation-infoBackground, rgba(0,128,0,0.08));
		border: 1px solid var(--vscode-testing-runAction, #4caf50);
		border-radius: 4px;
		padding: 0.6rem 1rem;
		color: var(--vscode-testing-runAction);
		font-weight: 500;
		font-size: 0.9rem;
	}

	/* ── Import summary ── */
	.import-summary {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.875rem;
		color: var(--vscode-descriptionForeground);
		padding: 0.25rem 0;
	}

	/* ── Spinner ── */
	.spinner {
		width: 44px;
		height: 44px;
		border: 4px solid var(--vscode-panel-border);
		border-top-color: var(--vscode-button-background);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Success / error states ── */
	.success-icon,
	.error-icon {
		font-size: 3rem;
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.success-icon { color: var(--vscode-testing-runAction, #4caf50); }
	.error-icon   { color: var(--vscode-editorError-foreground); }

	.step-container.success h2 { color: var(--vscode-testing-runAction, #4caf50); }
	.step-container.error  h2 { color: var(--vscode-editorError-foreground); }

	/* ── Accessibility ── */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
