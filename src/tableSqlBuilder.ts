// tableSqlBuilder.ts - Helpers for constructing table management SQL statements

export interface CreateTableColumnDefinition {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    comment: string | null;
    isPrimaryKey: boolean;
}

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

export interface CreateTableBuildResult {
    statements: string[];
    warnings: string[];
}

export function buildCreateTableStatements(
    schema: string,
    table: string,
    columns: CreateTableColumnDefinition[],
    // constraints come from schema/create wizards; may be undefined or empty
    constraints?: {
        name: string;
        type: 'index' | 'uniqueIndex' | 'foreignKey';
        columns: string[];
        referencedSchema?: string | null;
        referencedTable?: string | null;
        referencedColumns?: string[];
        onUpdate?: string | null;
        onDelete?: string | null;
        method?: string | null;
    }[]
): CreateTableBuildResult {
    if (!schema || !table) {
        throw new Error('Schema and table name are required');
    }
    if (!Array.isArray(columns) || columns.length === 0) {
        throw new Error('At least one column definition is required');
    }

    const warnings: string[] = [];
    const normalizedColumns = columns.map(column => {
        if (!column.name || !column.name.trim()) {
            throw new Error('Column name cannot be empty');
        }
        if (!column.type || !column.type.trim()) {
            throw new Error(`Column "${column.name}" is missing a type`);
        }
        const name = column.name.trim();
        return {
            name,
            type: column.type.trim(),
            nullable: Boolean(column.nullable),
            defaultValue: column.defaultValue?.trim?.() ?? null,
            comment: column.comment?.trim?.() ?? null,
            isPrimaryKey: Boolean(column.isPrimaryKey)
        };
    });

    const definitionFragments: string[] = [];
    const comments: string[] = [];
    const primaryKeys: string[] = [];

    for (const column of normalizedColumns) {
        const pieces = [
            `${quoteIdentifier(column.name)} ${column.type}`
        ];
        if (!column.nullable) {
            pieces.push('NOT NULL');
            if (!column.defaultValue) {
                warnings.push(`Column "${column.name}" is NOT NULL without a default value.`);
            }
        }
        if (column.defaultValue) {
            pieces.push(`DEFAULT ${column.defaultValue}`);
        }
        definitionFragments.push(pieces.join(' '));

        if (column.comment) {
            comments.push(
                buildColumnCommentStatement(schema, table, column.name, column.comment)
            );
        }
        if (column.isPrimaryKey) {
            primaryKeys.push(quoteIdentifier(column.name));
        }
    }

    if (primaryKeys.length > 0) {
        definitionFragments.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
    }

    const tableIdentifier = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
    const statements = [`CREATE TABLE ${tableIdentifier} (${definitionFragments.join(', ')});`];
    if (comments.length > 0) {
        statements.push(...comments);
    }

    // add any additional constraint creation statements after the table creation
    if (Array.isArray(constraints) && constraints.length > 0) {
        for (const constraint of constraints) {
            const cname = constraint.name.trim();
            if (!cname) {
                // skip invalid constraint
                continue;
            }
            const columnList = (constraint.columns || []).map(col => quoteIdentifier(col)).join(', ');
            if (!columnList) {
                continue;
            }

            if (constraint.type === 'foreignKey') {
                const refSchema = quoteIdentifier(constraint.referencedSchema ?? schema);
                const refTable = quoteIdentifier(constraint.referencedTable ?? '');
                const refCols = (constraint.referencedColumns || []).map(col => quoteIdentifier(col)).join(', ');
                const onUpdate = (constraint.onUpdate || 'NO ACTION').trim() || 'NO ACTION';
                const onDelete = (constraint.onDelete || 'NO ACTION').trim() || 'NO ACTION';
                statements.push(
                    `ALTER TABLE ${tableIdentifier} ADD CONSTRAINT ${quoteIdentifier(cname)} FOREIGN KEY (${columnList}) REFERENCES ${refSchema}.${refTable} (${refCols}) ON UPDATE ${onUpdate} ON DELETE ${onDelete};`
                );
                continue;
            }

            if (constraint.type === 'uniqueIndex') {
                const method = (constraint.method ?? '').trim();
                if (method.length > 0) {
                    statements.push(
                        `CREATE UNIQUE INDEX ${quoteIdentifier(cname)} ON ${tableIdentifier} USING ${method || 'btree'} (${columnList});`
                    );
                } else {
                    statements.push(
                        `ALTER TABLE ${tableIdentifier} ADD CONSTRAINT ${quoteIdentifier(cname)} UNIQUE (${columnList});`
                    );
                }
                continue;
            }

            // default to regular index
            const method = (constraint.method ?? 'btree').trim() || 'btree';
            statements.push(
                `CREATE INDEX ${quoteIdentifier(cname)} ON ${tableIdentifier} USING ${method} (${columnList});`
            );
        }
    }

    return {
        statements,
        warnings
    };
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

export function buildColumnCommentStatement(schema: string, table: string, column: string, comment: string | null): string {
    const literal = comment == null ? 'NULL' : `'${comment.replace(/'/g, "''")}'`;
    return `COMMENT ON COLUMN ${quoteIdentifier(schema)}.${quoteIdentifier(table)}.${quoteIdentifier(column)} IS ${literal};`;
}

