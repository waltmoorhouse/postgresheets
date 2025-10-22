/**
 * types.ts - Shared type definitions for webview communication and data structures
 * 
 * This file provides type-safe, discriminated union types for all webview messages
 * sent between the Extension and Webview layers, eliminating the need for unsafe `any` types.
 */

/**
 * Column metadata including type information and enum values for dropdowns
 */
export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    enumValues?: string[];
    isUnique?: boolean;
    isIndexed?: boolean;
    foreignKey?: {
        referencedSchema: string;
        referencedTable: string;
        referencedColumn: string;
    };
}

/**
 * Primary key information for a table
 */
export interface PrimaryKeyInfo {
    columns: string[];
}

/**
 * Sort descriptor for grid sorting
 */
export interface SortDescriptor {
    column: string;
    direction: 'asc' | 'desc';
}

/**
 * Filter map for column filters (column name -> filter value)
 */
export type FilterMap = Record<string, string>;

/**
 * Row data for display in the grid
 */
export type RowData = Record<string, unknown>;

/**
 * Change operations for grid editing
 */
export interface GridChangeInsert {
    type: 'insert';
    data: RowData;
}

export interface GridChangeUpdate {
    type: 'update';
    data: RowData;
    where: RowData;
}

export interface GridChangeDelete {
    type: 'delete';
    where: RowData;
}

export type GridChange = GridChangeInsert | GridChangeUpdate | GridChangeDelete;

/**
 * Initial state payload sent when a table is first loaded
 */
export interface TableStatePayload {
    schemaName: string;
    tableName: string;
    columns: ColumnInfo[];
    primaryKey: PrimaryKeyInfo;
    rows: RowData[];
    currentPage: number;
    totalRows: number;
    paginationSize: number;
    sort: SortDescriptor | null;
    filters: FilterMap;
    searchTerm: string;
    tablePreferences?: TablePreferences;
}

/**
 * Table display preferences (column order, hidden columns, widths)
 */
export interface TablePreferences {
    columnOrder?: string[];
    hiddenColumns?: string[];
    columnWidths?: Record<string, number>;
}

/**
 * Database type for error information
 */
export interface ErrorInfo {
    message: string;
    stack?: string;
    code?: string;
}

// ============================================================================
// WEBVIEW → EXTENSION MESSAGE TYPES (Discriminated Union)
// ============================================================================

export type WebviewToExtensionMessage =
    | { command: 'executeChanges'; changes: GridChange[]; batchMode: boolean; bypassValidation?: boolean }
    | { command: 'loadPage'; pageNumber: number }
    | { command: 'previewChanges'; changes: GridChange[] }
    | { command: 'search'; term: string }
    | { command: 'applySort'; sort: SortDescriptor | null }
    | { command: 'applyFilters'; filters: FilterMap }
    | { command: 'refresh' }
    | { command: 'saveTablePreferences'; prefs: TablePreferences }
    | { command: 'resetTablePreferences' }
    | { command: 'openIndexManager' }
    | { command: 'loadForeignKeyRows'; schemaName: string; tableName: string; columnName: string }
    | { command: 'copyToSqlTerminal'; sql: string };

// ============================================================================
// EXTENSION → WEBVIEW MESSAGE TYPES (Discriminated Union)
// ============================================================================

export type ExtensionToWebviewMessage =
    | { command: 'loadTableState'; data: TableStatePayload }
    | { command: 'loadPageData'; rows: RowData[]; currentPage: number; totalRows: number }
    | { command: 'sqlPreview'; payload: string; error?: boolean }
    | { command: 'executionComplete'; success: boolean; error?: string }
    | { command: 'showMessage'; text: string }
    | { command: 'showError'; error: ErrorInfo }
    | { command: 'webviewError'; error: ErrorInfo }
    | { command: 'foreignKeyRows'; rows: RowData[]; pkColumn: string };

/**
 * Union type for all possible webview messages
 */
export type WebviewMessage = WebviewToExtensionMessage | ExtensionToWebviewMessage;

/**
 * Type guard to check if a message is from webview to extension
 */
export function isWebviewToExtension(msg: any): msg is WebviewToExtensionMessage {
    return msg && typeof msg === 'object' && typeof msg.command === 'string' && (
        msg.command === 'executeChanges' ||
        msg.command === 'loadPage' ||
        msg.command === 'previewChanges' ||
        msg.command === 'search' ||
        msg.command === 'applySort' ||
        msg.command === 'applyFilters' ||
        msg.command === 'refresh' ||
        msg.command === 'saveTablePreferences' ||
        msg.command === 'resetTablePreferences' ||
        msg.command === 'openIndexManager' ||
        msg.command === 'loadForeignKeyRows' ||
        msg.command === 'copyToSqlTerminal'
    );
}

/**
 * Type guard to check if a message is from extension to webview
 */
export function isExtensionToWebview(msg: any): msg is ExtensionToWebviewMessage {
    return msg && typeof msg === 'object' && typeof msg.command === 'string' && (
        msg.command === 'loadTableState' ||
        msg.command === 'loadPageData' ||
        msg.command === 'sqlPreview' ||
        msg.command === 'executionComplete' ||
        msg.command === 'showMessage' ||
        msg.command === 'showError' ||
        msg.command === 'webviewError' ||
        msg.command === 'foreignKeyRows'
    );
}

/**
 * SQL query result interface for typed database results
 */
export interface QueryResult<T extends RowData = RowData> {
    rows: T[];
    rowCount: number;
}

/**
 * Represents a parsed query result row from PostgreSQL with proper typing
 */
export type QueryResultRow = Record<string, unknown>;

/**
 * Column type metadata for enum detection and array handling
 */
export interface ColumnTypeMetadata {
    typoid: number;
    typname: string;
    typtype: 'e' | 'b' | 'c' | 'd' | 'r' | 'm' | 'p' | string;
    typelem: number;
    oid: number;
}
