// sqlGenerator.ts - Generates SQL statements for INSERT, UPDATE, DELETE

import { quoteIdentifier } from './tableSqlBuilder';
import type { GridChange, RowData } from './types';

export interface SqlResult {
    query: string;
    values: unknown[];
}

export class SqlGenerator {
    static generateSql(schemaName: string, tableName: string, change: GridChange): SqlResult {
        const fullTableName = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;

        switch (change.type) {
            case 'insert':
                return this.generateInsert(fullTableName, change.data);
            case 'update':
                return this.generateUpdate(fullTableName, change.data, change.where);
            case 'delete':
                return this.generateDelete(fullTableName, change.where);
        }
    }

    private static generateInsert(tableName: string, data: RowData): SqlResult {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        
    const columnList = columns.map(c => quoteIdentifier(c)).join(', ');
        const query = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;
        
        return { query, values };
    }

    private static generateUpdate(tableName: string, data: RowData, where: RowData): SqlResult {
        const dataColumns = Object.keys(data);
        const whereColumns = Object.keys(where);
        
        const dataValues = Object.values(data);
        const whereValues = Object.values(where);
        
        const setClause = dataColumns
            .map((col, i) => `${quoteIdentifier(col)} = $${i + 1}`)
            .join(', ');
        
        const whereClause = whereColumns
            .map((col, i) => `${quoteIdentifier(col)} = $${dataValues.length + i + 1}`)
            .join(' AND ');
        
        const query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
        const values = [...dataValues, ...whereValues];
        
        return { query, values };
    }

    private static generateDelete(tableName: string, where: RowData): SqlResult {
        const whereColumns = Object.keys(where);
        const whereValues = Object.values(where);
        
        const whereClause = whereColumns
            .map((col, i) => `${quoteIdentifier(col)} = $${i + 1}`)
            .join(' AND ');
        
        const query = `DELETE FROM ${tableName} WHERE ${whereClause}`;
        
        return { query, values: whereValues };
    }

    static formatSqlWithValues(query: string, values: unknown[]): string {
        let formattedQuery = query;
        values.forEach((value, i) => {
            const placeholder = `$${i + 1}`;
            let formattedValue: string;
            
            if (value === null) {
                formattedValue = 'NULL';
            } else if (typeof value === 'string') {
                formattedValue = `'${value.replace(/'/g, "''")}'`;
            } else if (typeof value === 'object') {
                formattedValue = `'${JSON.stringify(value).replace(/'/g, "''")}'`;
            } else {
                formattedValue = String(value);
            }
            
            formattedQuery = formattedQuery.replace(placeholder, formattedValue);
        });
        
        return formattedQuery;
    }
}
