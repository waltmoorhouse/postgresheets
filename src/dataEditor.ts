// dataEditor.ts - Manages the webview for editing table data

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { SqlGenerator } from './sqlGenerator';

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

interface PrimaryKeyInfo {
    columns: string[];
}

export class DataEditor {
    private panels: Map<string, vscode.WebviewPanel> = new Map();

    /**
     * Default pagination size for table data.
     */
    private paginationSize: number = 100;

    /**
     * Default batch mode setting.
     */
    private batchMode: boolean = true;

    constructor(
        private context: vscode.ExtensionContext,
        private connectionManager: ConnectionManager
    ) {
        // Load configuration settings
        const config = vscode.workspace.getConfiguration('postgresDataEditor');
        this.paginationSize = config.get<number>('paginationSize', 100);
        this.batchMode = config.get<boolean>('batchMode', true);
    }

    async openTable(item: DatabaseTreeItem): Promise<void> {
        const { connectionId, schemaName, tableName } = item;
        if (!connectionId || !schemaName || !tableName) return;

        const panelKey = `${connectionId}_${schemaName}_${tableName}`;

        // If panel already exists, reveal it
        if (this.panels.has(panelKey)) {
            this.panels.get(panelKey)!.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresDataEditor',
            `${schemaName}.${tableName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panels.set(panelKey, panel);

        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        // Load table metadata and data
        await this.loadTableData(panel, connectionId, schemaName, tableName);

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            async message => {
                await this.handleMessage(message, panel, connectionId, schemaName, tableName);
            },
            undefined,
            this.context.subscriptions
        );
    }

    private async loadTableData(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        page: number = 0
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return;

        try {
            // Get columns info
            const columnsResult = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
            `, [schemaName, tableName]);

            const columns: ColumnInfo[] = columnsResult.rows.map(row => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES'
            }));

            // Get primary key info
            const pkResult = await client.query(`
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = $1::regclass AND i.indisprimary
            `, [`${schemaName}.${tableName}`]);

            const primaryKey: PrimaryKeyInfo = {
                columns: pkResult.rows.map(row => row.attname)
            };

            // Get data with pagination
            const offset = page * this.paginationSize;
            const dataResult = await client.query(
                `SELECT * FROM ${schemaName}.${tableName} LIMIT $1 OFFSET $2`,
                [this.paginationSize, offset]
            );

            // Get total count
            const countResult = await client.query(
                `SELECT COUNT(*) FROM ${schemaName}.${tableName}`
            );
            const totalRows = parseInt(countResult.rows[0].count);

            panel.webview.html = this.getWebviewContent(
                schemaName,
                tableName,
                columns,
                primaryKey,
                dataResult.rows,
                page,
                totalRows
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table data: ${error}`);
        }
    }

    private async handleMessage(
        message: any,
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        switch (message.command) {
            case 'loadPage':
                await this.loadTableData(panel, connectionId, schemaName, tableName, message.page);
                break;

            case 'executeChanges':
                await this.executeChanges(panel, connectionId, schemaName, tableName, message.changes, message.batchMode);
                break;

            case 'previewSql':
                await this.previewSql(panel, schemaName, tableName, message.changes, message.primaryKey);
                break;

            case 'search':
                await this.searchTableData(panel, connectionId, schemaName, tableName, message.searchTerm);
                break;
        }
    }

    private async executeChanges(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        changes: any[],
        batchMode: boolean = this.batchMode
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return;

        try {
            if (batchMode) {
                await client.query('BEGIN');
            }

            for (const change of changes) {
                const sql = SqlGenerator.generateSql(schemaName, tableName, change);
                await client.query(sql.query, sql.values);
            }

            if (batchMode) {
                await client.query('COMMIT');
            }

            vscode.window.showInformationMessage('Changes executed successfully');
            panel.webview.postMessage({ command: 'executionComplete', success: true });
            
            // Reload data
            await this.loadTableData(panel, connectionId, schemaName, tableName, 0);
        } catch (error) {
            if (batchMode) {
                await client.query('ROLLBACK');
            }
            vscode.window.showErrorMessage(`Failed to execute changes: ${error}`);
            panel.webview.postMessage({ command: 'executionComplete', success: false, error: String(error) });
        }
    }

    private async previewSql(
        panel: vscode.WebviewPanel,
        schemaName: string,
        tableName: string,
        changes: any[],
        primaryKey: string[]
    ): Promise<void> {
        const sqlStatements = changes.map(change => {
            const sql = SqlGenerator.generateSql(schemaName, tableName, change);
            return SqlGenerator.formatSqlWithValues(sql.query, sql.values);
        });

        panel.webview.postMessage({
            command: 'sqlPreview',
            sql: sqlStatements.join(';\n\n')
        });
    }

    private getWebviewContent(
        schemaName: string,
        tableName: string,
        columns: ColumnInfo[],
        primaryKey: PrimaryKeyInfo,
        rows: any[],
        currentPage: number,
        totalRows: number
    ): string {
        const totalPages = Math.ceil(totalRows / this.paginationSize);
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${schemaName}.${tableName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 10px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .controls {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .table-container {
            overflow: auto;
            max-height: calc(100vh - 200px);
            border: 1px solid var(--vscode-panel-border);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border: 1px solid var(--vscode-panel-border);
        }
        th {
            background-color: var(--vscode-editor-background);
            position: sticky;
            top: 0;
            z-index: 10;
            font-weight: 600;
        }
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .row-number {
            width: 40px;
            text-align: center;
            background-color: var(--vscode-editorLineNumber-background);
            color: var(--vscode-editorLineNumber-foreground);
        }
        .modified {
            background-color: var(--vscode-diffEditor-insertedTextBackground);
        }
        .deleted {
            text-decoration: line-through;
            opacity: 0.6;
        }
        input[type="checkbox"] {
            cursor: pointer;
        }
        .sql-preview {
            margin-top: 20px;
            padding: 10px;
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            white-space: pre-wrap;
            max-height: 200px;
            overflow: auto;
        }
        .pk-indicator {
            color: var(--vscode-symbolIcon-keyForeground);
            font-weight: bold;
        }
        .pagination {
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        [contenteditable="true"] {
            min-width: 100px;
            padding: 4px;
        }
        [contenteditable="true"]:focus {
            outline: 2px solid var(--vscode-focusBorder);
            background-color: var(--vscode-input-background);
        }
        .json-cell {
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
        }
        .json-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
        }
        .json-modal.active {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .json-modal-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 20px;
            max-width: 80%;
            max-height: 80%;
            overflow: auto;
            border-radius: 4px;
        }
        .json-editor {
            width: 100%;
            min-height: 300px;
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>${schemaName}.${tableName}</h2>
        <div class="controls">
            <label>
                <input type="checkbox" id="batchMode" ${this.batchMode ? 'checked' : ''}> Batch Mode
            </label>
            <button id="addRow">Add Row</button>
            <button id="deleteSelected">Delete Selected</button>
            <button id="previewSql">Preview SQL</button>
            <button id="execute">Execute Changes</button>
            <input type="text" id="searchInput" placeholder="Search..." style="padding: 6px; width: 200px;">
            <button id="searchButton">Search</button>
        </div>
    </div>

    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th class="row-number">
                        <input type="checkbox" id="selectAll">
                    </th>
                    ${columns.map(col => `
                        <th>
                            ${col.name}
                            ${primaryKey.columns.includes(col.name) ? '<span class="pk-indicator">🔑</span>' : ''}
                            <br><small style="font-weight: normal; opacity: 0.7;">${col.type}</small>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody id="tableBody">
                ${rows.map((row, idx) => `
                    <tr data-row-index="${idx}" data-original='${JSON.stringify(row)}'>
                        <td class="row-number">
                            <input type="checkbox" class="row-select">
                        </td>
                        ${columns.map(col => {
                            const value = row[col.name];
                            const isJson = col.type === 'json' || col.type === 'jsonb';
                            const isBool = col.type === 'boolean' || col.type === 'bool';
                            const displayValue = value === null ? 'NULL' : 
                                               isJson ? JSON.stringify(value) : 
                                               String(value);

                            if (isBool) {
                                const checked = value === true || value === 't' || value === 1 ? 'checked' : '';
                                return `
                                    <td data-column="${col.name}" data-type="${col.type}">
                                        <input type="checkbox" class="bool-cell" ${checked} />
                                    </td>
                                `;
                            }

                            return `
                                <td 
                                    contenteditable="true" 
                                    data-column="${col.name}"
                                    data-type="${col.type}"
                                    class="${isJson ? 'json-cell' : ''}"
                                >${displayValue}</td>
                            `;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="pagination">
        <button id="prevPage" ${currentPage === 0 ? 'disabled' : ''}>Previous</button>
        <span>Page ${currentPage + 1} of ${totalPages} (${totalRows} total rows)</span>
        <button id="nextPage" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
    </div>

    <div id="sqlPreview" class="sql-preview" style="display: none;"></div>

    <!-- JSON Editor Modal -->
    <div id="jsonModal" class="json-modal">
        <div class="json-modal-content">
            <h3>Edit JSON</h3>
            <textarea id="jsonEditor" class="json-editor"></textarea>
            <div style="margin-top: 10px; display: flex; gap: 10px;">
                <button id="saveJson">Save</button>
                <button id="cancelJson">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let changes = [];
        let currentJsonCell = null;

    const primaryKeyColumns = ${JSON.stringify(primaryKey.columns)};
    const columnsMeta = ${JSON.stringify(columns)};
    const currentPage = ${currentPage};

        // Track text changes
        document.getElementById('tableBody').addEventListener('input', (e) => {
            if (e.target.contentEditable === 'true') {
                e.target.classList.add('modified');
            }
        });

        // Track checkbox changes (booleans)
        document.getElementById('tableBody').addEventListener('change', (e) => {
            if (e.target.classList && e.target.classList.contains('bool-cell')) {
                // mark the containing cell as modified
                const cell = e.target.closest('td');
                if (cell) cell.classList.add('modified');
            }
        });

        // JSON cell click
        document.getElementById('tableBody').addEventListener('click', (e) => {
            if (e.target.classList.contains('json-cell')) {
                currentJsonCell = e.target;
                const value = e.target.textContent;
                document.getElementById('jsonEditor').value = value === 'NULL' ? '{}' : value;
                document.getElementById('jsonModal').classList.add('active');
            }
        });

        // Save JSON
        document.getElementById('saveJson').addEventListener('click', () => {
            try {
                const jsonText = document.getElementById('jsonEditor').value;
                JSON.parse(jsonText); // Validate
                currentJsonCell.textContent = jsonText;
                currentJsonCell.classList.add('modified');
                document.getElementById('jsonModal').classList.remove('active');
            } catch (error) {
                alert('Invalid JSON: ' + error.message);
            }
        });

        // Cancel JSON
        document.getElementById('cancelJson').addEventListener('click', () => {
            document.getElementById('jsonModal').classList.remove('active');
        });

        // Add row
        document.getElementById('addRow').addEventListener('click', () => {
            const tbody = document.getElementById('tableBody');
            const newRow = document.createElement('tr');
            newRow.classList.add('modified');
            newRow.setAttribute('data-new', 'true');
            
            // Build row cells from columnsMeta to avoid nested template literal issues
            const cellsHtml = columnsMeta.map(function(col) {
                const isBool = col.type === 'boolean' || col.type === 'bool';
                if (isBool) {
                    return '<td data-column="' + col.name + '" data-type="' + col.type + '"><input type="checkbox" class="bool-cell" /></td>';
                }
                return '<td contenteditable="true" data-column="' + col.name + '" data-type="' + col.type + '"></td>';
            }).join('');

            newRow.innerHTML = '<td class="row-number">' +
                '<input type="checkbox" class="row-select">' +
                '</td>' + cellsHtml;
            tbody.appendChild(newRow);
        });

        // Delete selected
        document.getElementById('deleteSelected').addEventListener('click', () => {
            const selected = document.querySelectorAll('.row-select:checked');
            selected.forEach(checkbox => {
                const row = checkbox.closest('tr');
                if (row.getAttribute('data-new') === 'true') {
                    row.remove();
                } else {
                    row.classList.add('deleted');
                }
            });
        });

        // Select all
        document.getElementById('selectAll').addEventListener('change', (e) => {
            document.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = e.target.checked;
            });
        });

        // Preview SQL
        document.getElementById('previewSql').addEventListener('click', () => {
            const changes = collectChanges();
            vscode.postMessage({
                command: 'previewSql',
                changes: changes,
                primaryKey: primaryKeyColumns
            });
        });

        // Execute changes
        document.getElementById('execute').addEventListener('click', () => {
            const changes = collectChanges();
            if (changes.length === 0) {
                alert('No changes to execute');
                return;
            }

            const batchMode = document.getElementById('batchMode').checked;
            vscode.postMessage({
                command: 'executeChanges',
                changes: changes,
                batchMode: batchMode
            });
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            vscode.postMessage({
                command: 'loadPage',
                page: currentPage - 1
            });
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            vscode.postMessage({
                command: 'loadPage',
                page: currentPage + 1
            });
        });

        // Search
        document.getElementById('searchButton').addEventListener('click', () => {
            const searchTerm = document.getElementById('searchInput').value;
            vscode.postMessage({
                command: 'search',
                searchTerm: searchTerm
            });
        });

        function collectChanges() {
            const changes = [];
            const rows = document.querySelectorAll('#tableBody tr');

            rows.forEach(row => {
                // New row
                if (row.getAttribute('data-new') === 'true' && !row.classList.contains('deleted')) {
                    const data = {};
                    row.querySelectorAll('td[data-column]').forEach(cell => {
                        const column = cell.getAttribute('data-column');
                        const type = cell.getAttribute('data-type');
                        const checkbox = cell.querySelector('input[type="checkbox"]');
                        let value;
                        if (checkbox) {
                            value = checkbox.checked;
                        } else {
                            value = parseValue(cell.textContent, type);
                        }
                        data[column] = value;
                    });
                    changes.push({
                        type: 'insert',
                        data: data
                    });
                }
                // Deleted row
                else if (row.classList.contains('deleted')) {
                    const original = JSON.parse(row.getAttribute('data-original'));
                    const where = {};
                    primaryKeyColumns.forEach(col => {
                        where[col] = original[col];
                    });
                    changes.push({
                        type: 'delete',
                        where: where
                    });
                }
                // Updated row
                else if (row.querySelector('.modified')) {
                    const original = JSON.parse(row.getAttribute('data-original'));
                    const data = {};
                    const where = {};
                    
                    primaryKeyColumns.forEach(col => {
                        where[col] = original[col];
                    });

                    row.querySelectorAll('td[data-column]').forEach(cell => {
                        if (cell.classList.contains('modified')) {
                            const column = cell.getAttribute('data-column');
                            const type = cell.getAttribute('data-type');
                            const checkbox = cell.querySelector('input[type="checkbox"]');
                            let value;
                            if (checkbox) {
                                value = checkbox.checked;
                            } else {
                                value = parseValue(cell.textContent, type);
                            }
                            data[column] = value;
                        }
                    });

                    if (Object.keys(data).length > 0) {
                        changes.push({
                            type: 'update',
                            data: data,
                            where: where
                        });
                    }
                }
            });

            return changes;
        }

        function parseValue(text, type) {
            if (text === 'NULL' || text.trim() === '') {
                return null;
            }
            
            if (type === 'json' || type === 'jsonb') {
                try {
                    return JSON.parse(text);
                } catch {
                    return text;
                }
            }
            
            if (type.includes('int') || type === 'bigint' || type === 'smallint') {
                return parseInt(text);
            }
            
            if (type === 'numeric' || type === 'decimal' || type.includes('float') || type === 'real' || type === 'double precision') {
                return parseFloat(text);
            }
            
            if (type === 'boolean' || type === 'bool') {
                return text.toLowerCase() === 'true' || text === '1';
            }
            
            return text;
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'sqlPreview':
                    const preview = document.getElementById('sqlPreview');
                    preview.textContent = message.sql;
                    preview.style.display = 'block';
                    break;
                case 'executionComplete':
                    if (!message.success) {
                        alert('Execution failed: ' + message.error);
                    }
                    break;
                case 'updateTable':
                    (function(){
                        const tableBody = document.getElementById('tableBody');
                        tableBody.innerHTML = message.rows.map(function(row, ridx) {
                            const cells = columnsMeta.map(function(col) {
                                const val = row[col.name];
                                const isJson = col.type === 'json' || col.type === 'jsonb';
                                const isBool = col.type === 'boolean' || col.type === 'bool';
                                if (isBool) {
                                    const checked = val === true || val === 't' || val === 1 ? 'checked' : '';
                                    return '<td data-column="' + col.name + '" data-type="' + col.type + '"><input type="checkbox" class="bool-cell" ' + checked + ' /></td>';
                                }
                                const display = val === null ? 'NULL' : (isJson ? JSON.stringify(val) : String(val));
                                return '<td contenteditable="true" data-column="' + col.name + '" data-type="' + col.type + '">' + display + '</td>';
                            }).join('');

                            const original = JSON.stringify(row).replace(/'/g, "\u0027");
                            return '<tr data-row-index="' + ridx + '" data-original=\'' + original + '\'>' +
                                '<td class="row-number"><input type="checkbox" class="row-select"></td>' + cells + '</tr>';
                        }).join('');
                    })();
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    private async searchTableData(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string,
        searchTerm: string
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) return;

        try {
            // Fetch column metadata to dynamically build the query
            const columnsResult = await client.query(
                `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
                [schemaName, tableName]
            );
            const columns = columnsResult.rows.map(row => row.column_name);

            const query = `
                SELECT * FROM ${schemaName}.${tableName}
                WHERE ${columns.map(col => `CAST("${col}" AS TEXT) ILIKE $1`).join(' OR ')}
                LIMIT $2 OFFSET $3
            `;
            const offset = 0;
            const result = await client.query(query, [`%${searchTerm}%`, this.paginationSize, offset]);

            panel.webview.postMessage({
                command: 'updateTable',
                rows: result.rows
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Search failed: ${error}`);
        }
    }
}