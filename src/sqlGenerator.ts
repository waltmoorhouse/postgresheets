// sqlGenerator.ts - Generates SQL statements for INSERT, UPDATE, DELETE

export interface SqlResult {
    query: string;
    values: any[];
}

export class SqlGenerator {
    static generateSql(schemaName: string, tableName: string, change: any): SqlResult {
        const fullTableName = `"${schemaName}"."${tableName}"`;

        switch (change.type) {
            case 'insert':
                return this.generateInsert(fullTableName, change.data);
            case 'update':
                return this.generateUpdate(fullTableName, change.data, change.where);
            case 'delete':
                return this.generateDelete(fullTableName, change.where);
            default:
                throw new Error(`Unknown change type: ${change.type}`);
        }
    }

    private static generateInsert(tableName: string, data: any): SqlResult {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        
        const columnList = columns.map(c => `"${c}"`).join(', ');
        const query = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;
        
        return { query, values };
    }

    private static generateUpdate(tableName: string, data: any, where: any): SqlResult {
        const dataColumns = Object.keys(data);
        const whereColumns = Object.keys(where);
        
        const dataValues = Object.values(data);
        const whereValues = Object.values(where);
        
        const setClause = dataColumns
            .map((col, i) => `"${col}" = $${i + 1}`)
            .join(', ');
        
        const whereClause = whereColumns
            .map((col, i) => `"${col}" = $${dataValues.length + i + 1}`)
            .join(' AND ');
        
        const query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
        const values = [...dataValues, ...whereValues];
        
        return { query, values };
    }

    private static generateDelete(tableName: string, where: any): SqlResult {
        const whereColumns = Object.keys(where);
        const whereValues = Object.values(where);
        
        const whereClause = whereColumns
            .map((col, i) => `"${col}" = $${i + 1}`)
            .join(' AND ');
        
        const query = `DELETE FROM ${tableName} WHERE ${whereClause}`;
        
        return { query, values: whereValues };
    }

    static formatSqlWithValues(query: string, values: any[]): string {
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
