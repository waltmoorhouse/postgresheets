/**
 * CSV Import/Export functionality for PostgreSQL Data Editor
 * Exports and imports table data to/from CSV format
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ExportOptions {
    includeHeaders: boolean;
    delimiter?: string;
    quoteChar?: string;
    escapeChar?: string;
}

export class CsvExporter {
    /**
     * Escape a CSV field value according to RFC 4180
     * @param value The value to escape
     * @param quoteChar The quote character to use (default: ")
     * @param escapeChar The escape character to use (default: ")
     * @returns The escaped value
     */
    static escapeField(value: any, quoteChar: string = '"', escapeChar: string = '"'): string {
        // Convert null/undefined to empty string
        if (value === null || value === undefined) {
            return '';
        }

        // Convert to string
        let str = String(value);

        // If value contains delimiter, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(',') || str.includes(quoteChar) || str.includes('\n') || str.includes('\r')) {
            // Escape quotes by doubling them
            str = str.replace(new RegExp(escapeChar, 'g'), escapeChar + escapeChar);
            return quoteChar + str + quoteChar;
        }

        return str;
    }

    /**
     * Convert a row of data to CSV format
     * @param row The row of data
     * @param delimiter The field delimiter (default: ,)
     * @param quoteChar The quote character (default: ")
     * @param escapeChar The escape character (default: ")
     * @returns The CSV formatted row
     */
    static formatRow(
        row: any[],
        delimiter: string = ',',
        quoteChar: string = '"',
        escapeChar: string = '"'
    ): string {
        return row
            .map(field => this.escapeField(field, quoteChar, escapeChar))
            .join(delimiter);
    }

    /**
     * Convert table data to CSV string
     * @param columnNames The column names
     * @param rows The data rows
     * @param options Export options
     * @returns The CSV string
     */
    static generateCsv(
        columnNames: string[],
        rows: any[][],
        options: ExportOptions = { includeHeaders: true }
    ): string {
        const {
            includeHeaders = true,
            delimiter = ',',
            quoteChar = '"',
            escapeChar = '"'
        } = options;

        const lines: string[] = [];

        // Add header row if requested
        if (includeHeaders) {
            const headerRow = columnNames.map(name => this.escapeField(name, quoteChar, escapeChar));
            lines.push(headerRow.join(delimiter));
        }

        // Add data rows
        for (const row of rows) {
            lines.push(this.formatRow(row, delimiter, quoteChar, escapeChar));
        }

        return lines.join('\n');
    }

    /**
     * Export table data to a CSV file
     * @param columnNames The column names
     * @param rows The data rows
     * @param tableName The table name (for default filename)
     * @param options Export options
     * @returns The file path where the CSV was saved, or null if cancelled
     */
    static async exportToFile(
        columnNames: string[],
        rows: any[][],
        tableName: string,
        options: ExportOptions = { includeHeaders: true }
    ): Promise<string | null> {
        // Generate CSV content
        const csvContent = this.generateCsv(columnNames, rows, options);

        // Show save dialog
        const defaultUri = vscode.Uri.file(
            path.join(
                require('os').homedir(),
                `${tableName}_${new Date().toISOString().split('T')[0]}.csv`
            )
        );

        const filePath = await vscode.window.showSaveDialog({
            defaultUri,
            filters: {
                'CSV files': ['csv'],
                'All files': ['*']
            },
            title: `Export ${tableName} as CSV`
        });

        if (!filePath) {
            return null;
        }

        // Write file
        await fs.promises.writeFile(filePath.fsPath, csvContent, 'utf-8');

        return filePath.fsPath;
    }

    /**
     * Parse CSV string into rows
     * @param csvContent The CSV content
     * @param delimiter The field delimiter (default: ,)
     * @param quoteChar The quote character (default: ")
     * @returns Parsed rows
     */
    static parseCsv(
        csvContent: string,
        delimiter: string = ',',
        quoteChar: string = '"'
    ): string[][] {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let insideQuotes = false;

        for (let i = 0; i < csvContent.length; i++) {
            const char = csvContent[i];
            const nextChar = csvContent[i + 1];

            if (char === quoteChar) {
                if (insideQuotes && nextChar === quoteChar) {
                    // Escaped quote
                    currentField += quoteChar;
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    insideQuotes = !insideQuotes;
                }
            } else if (char === delimiter && !insideQuotes) {
                // End of field
                currentRow.push(currentField);
                currentField = '';
            } else if ((char === '\n' || char === '\r') && !insideQuotes) {
                // End of row
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField);
                    if (currentRow.length > 0) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentField = '';
                }
                // Skip \r\n combination
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                currentField += char;
            }
        }

        // Add final field and row
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField);
        }
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

        return rows;
    }

    /**
     * Read a CSV file from disk
     * @param filePath The path to the CSV file
     * @returns The CSV content as a string
     */
    static async readCsvFile(filePath: string): Promise<string> {
        return await fs.promises.readFile(filePath, 'utf-8');
    }

    /**
     * Import CSV file - shows file picker and parses content
     * @param options Parse options
     * @returns Object with headers and rows, or null if cancelled
     */
    static async importFromFile(options?: {
        delimiter?: string;
        quoteChar?: string;
    }): Promise<{ headers: string[] | null; rows: string[][] } | null> {
        // Show file picker dialog
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFolders: false,
            canSelectFiles: true,
            filters: {
                'CSV files': ['csv'],
                'All files': ['*']
            },
            title: 'Select CSV file to import'
        });

        if (!files || files.length === 0) {
            return null;
        }

        const filePath = files[0].fsPath;

        // Read file
        const csvContent = await this.readCsvFile(filePath);

        // Parse CSV
        const delimiter = options?.delimiter || ',';
        const quoteChar = options?.quoteChar || '"';
        const rows = this.parseCsv(csvContent, delimiter, quoteChar);

        if (rows.length === 0) {
            return null;
        }

        // First row might be headers, or it's all data
        // Return null for headers to indicate user needs to map columns
        return {
            headers: null,
            rows
        };
    }

    /**
     * Convert CSV rows to typed values based on column types
     * @param rows CSV rows (strings)
     * @param columnTypes Map of column name to PostgreSQL type
     * @returns Rows with properly typed values
     */
    static convertRowTypes(
        rows: string[][],
        columnTypes: Record<string, string>
    ): any[][] {
        return rows.map(row => {
            return row.map((value, index) => {
                if (!value || value.trim() === '') {
                    return null;
                }

                const columnName = Object.keys(columnTypes)[index];
                const type = columnTypes[columnName];

                return this.convertValue(value, type);
            });
        });
    }

    /**
     * Convert a single value to the appropriate type
     * @param value The string value
     * @param pgType The PostgreSQL type
     * @returns The converted value
     */
    static convertValue(value: string, pgType: string): any {
        if (!value || value.trim() === '') {
            return null;
        }

        // Normalize type (remove precision, array brackets, etc.)
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
                try {
                    return JSON.parse(value);
                } catch {
                    return value; // Return as string if not valid JSON
                }

            case 'date':
                return new Date(value).toISOString().split('T')[0];

            case 'timestamp':
            case 'timestamptz':
            case 'timestamp without time zone':
            case 'timestamp with time zone':
                return new Date(value).toISOString();

            case 'uuid':
                return value.trim();

            case 'text':
            case 'varchar':
            case 'character':
            case 'char':
            case 'string':
            default:
                return value;
        }
    }

    /**
     * Validate if all required columns are mapped
     * @param mapping Map of CSV column index to table column name
     * @param tableColumns Available table columns
     * @param requiredColumns Column names that are required (not null)
     * @returns Array of validation errors, empty if valid
     */
    static validateMapping(
        mapping: Record<number, string>,
        tableColumns: string[],
        requiredColumns: string[] = []
    ): string[] {
        const errors: string[] = [];

        // Check all mapped columns exist in table
        for (const tableCol of Object.values(mapping)) {
            if (!tableColumns.includes(tableCol)) {
                errors.push(`Column "${tableCol}" not found in table`);
            }
        }

        // Check all required columns are mapped
        for (const col of requiredColumns) {
            if (!Object.values(mapping).includes(col)) {
                errors.push(`Required column "${col}" is not mapped`);
            }
        }

        return errors;
    }
}

