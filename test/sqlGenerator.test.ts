import { SqlGenerator } from '../src/sqlGenerator';
import type { GridChange } from '../src/types';

describe('SqlGenerator', () => {
    test('generateSql for INSERT', () => {
        const schemaName = 'public';
        const tableName = 'users';
        const change: GridChange = {
            type: 'insert',
            data: { name: 'John', age: 30 }
        };

        const result = SqlGenerator.generateSql(schemaName, tableName, change);

        expect(result.query).toBe('INSERT INTO "public"."users" ("name", "age") VALUES ($1, $2)');
        expect(result.values).toEqual(['John', 30]);
    });

    test('generateSql for UPDATE', () => {
        const schemaName = 'public';
        const tableName = 'users';
        const change: GridChange = {
            type: 'update',
            data: { age: 31 },
            where: { name: 'John' }
        };

        const result = SqlGenerator.generateSql(schemaName, tableName, change);

        expect(result.query).toBe('UPDATE "public"."users" SET "age" = $1 WHERE "name" = $2');
        expect(result.values).toEqual([31, 'John']);
    });

    test('generateSql for DELETE', () => {
        const schemaName = 'public';
        const tableName = 'users';
        const change: GridChange = {
            type: 'delete',
            where: { name: 'John' }
        };

        const result = SqlGenerator.generateSql(schemaName, tableName, change);

        expect(result.query).toBe('DELETE FROM "public"."users" WHERE "name" = $1');
        expect(result.values).toEqual(['John']);
    });
});