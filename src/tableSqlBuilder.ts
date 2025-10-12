// tableSqlBuilder.ts - Helpers for constructing table management SQL statements

export function quoteIdentifier(name: string): string {
    if (!name || name.trim().length === 0) {
        throw new Error('Identifier is required');
    }
    return `"${name.replace(/"/g, '""')}"`;
}

export function buildCreateTableSql(schema: string, table: string, columnsDefinition: string): string {
    const trimmed = columnsDefinition.trim();
    if (!trimmed) {
        throw new Error('Column definitions cannot be empty');
    }
    return `CREATE TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (${trimmed});`;
}

export function buildAlterTableSql(schema: string, table: string, clause: string): string {
    const trimmed = clause.trim();
    if (!trimmed) {
        throw new Error('Alter clause cannot be empty');
    }
    return `ALTER TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)} ${trimmed};`;
}

export function buildDropTableSql(schema: string, table: string, cascade: boolean = false): string {
    const cascadeClause = cascade ? ' CASCADE' : '';
    return `DROP TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)}${cascadeClause};`;
}
