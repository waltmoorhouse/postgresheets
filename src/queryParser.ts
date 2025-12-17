/**
 * Query Parser Utility
 * Parses simple SELECT statements to extract table and WHERE clause information
 */

export interface ParsedQuery {
    isSupported: boolean;
    schema?: string;
    table?: string;
    whereClause?: string;
    reason?: string;
}

/**
 * Parse a SELECT query to extract table and WHERE clause information
 * Only supports simple single-table SELECT queries
 */
export function parseSelectQuery(sql: string): ParsedQuery {
    if (!sql || typeof sql !== 'string') {
        return { isSupported: false, reason: 'Empty or invalid query' };
    }

    const trimmedSql = sql.trim();
    
    // Check if it starts with SELECT
    if (!/^SELECT\s+/i.test(trimmedSql)) {
        return { isSupported: false, reason: 'Not a SELECT statement' };
    }

    // Check for unsupported patterns
    const unsupportedPatterns = [
        /\bJOIN\b/i,
        /\bUNION\b/i,
        /\bINTERSECT\b/i,
        /\bEXCEPT\b/i,
        /\bWITH\b/i,  // CTEs
        /\(SELECT\b/i,  // Subqueries
    ];

    for (const pattern of unsupportedPatterns) {
        if (pattern.test(trimmedSql)) {
            return { isSupported: false, reason: 'Query contains JOINs, subqueries, or other complex features' };
        }
    }

    // Extract FROM clause
    const fromMatch = trimmedSql.match(/\bFROM\s+([^\s;,()]+)/i);
    if (!fromMatch) {
        return { isSupported: false, reason: 'No FROM clause found' };
    }

    const tableRef = fromMatch[1];
    let schema: string | undefined;
    let table: string;

    // Handle schema.table notation
    if (tableRef.includes('.')) {
        const parts = tableRef.split('.');
        if (parts.length === 2) {
            schema = parts[0].replace(/"/g, '');
            table = parts[1].replace(/"/g, '');
        } else {
            return { isSupported: false, reason: 'Invalid table reference' };
        }
    } else {
        table = tableRef.replace(/"/g, '');
    }

    // Extract WHERE clause if present
    let whereClause: string | undefined;
    const whereMatch = trimmedSql.match(/\bWHERE\s+(.*?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|;|$)/is);
    if (whereMatch) {
        whereClause = whereMatch[1].trim();
    }

    return {
        isSupported: true,
        schema,
        table,
        whereClause
    };
}

/**
 * Check if a query is a simple SELECT that can be opened in the data editor
 */
export function canOpenInEditor(sql: string): boolean {
    const parsed = parseSelectQuery(sql);
    return parsed.isSupported && !!parsed.table;
}
