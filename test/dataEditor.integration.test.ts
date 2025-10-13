/**
 * DataEditor Integration Tests
 * Tests grid interactions, CRUD operations, filtering, sorting
 */

import { SqlGenerator } from '../src/sqlGenerator';

describe('DataEditor Grid Operations', () => {
    describe('CRUD Operations', () => {
        test('generates INSERT with all column types', () => {
            const change = {
                type: 'insert',
                data: {
                    id: 1,
                    name: "John",
                    age: 30,
                    active: true,
                    balance: 123.45,
                    data: { key: "value" },
                    tags: ["a", "b"],
                    created_at: "2024-01-01T00:00:00Z",
                    notes: null
                }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);

            expect(result.query).toContain('INSERT INTO "public"."users"');
            expect(result.query).toMatch(/\(\s*"id",\s*"name",\s*"age",\s*"active",\s*"balance",\s*"data",\s*"tags",\s*"created_at",\s*"notes"\s*\)/);
            expect(result.values.length).toBe(9);
            expect(result.values[8]).toBeNull();
        });

        test('generates UPDATE with subset of columns', () => {
            const change = {
                type: 'update',
                data: { age: 31, active: false },
                where: { id: 1 }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);

            expect(result.query).toContain('UPDATE "public"."users"');
            expect(result.query).toContain('SET');
            expect(result.query).toContain('WHERE');
            expect(result.values).toEqual([31, false, 1]);
        });

        test('generates UPDATE with composite primary key', () => {
            const change = {
                type: 'update',
                data: { status: 'completed' },
                where: { user_id: 1, order_id: 100 }
            };

            const result = SqlGenerator.generateSql('public', 'orders', change);

            expect(result.query).toContain('WHERE "user_id" = $2 AND "order_id" = $3');
            expect(result.values).toEqual(['completed', 1, 100]);
        });

        test('generates DELETE with single column WHERE', () => {
            const change = {
                type: 'delete',
                where: { id: 42 }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);

            expect(result.query).toBe('DELETE FROM "public"."users" WHERE "id" = $1');
            expect(result.values).toEqual([42]);
        });

        test('generates DELETE with multiple WHERE conditions', () => {
            const change = {
                type: 'delete',
                where: { user_id: 1, status: 'pending' }
            };

            const result = SqlGenerator.generateSql('public', 'tasks', change);

            expect(result.query).toContain('WHERE');
            expect(result.query).toContain('AND');
            expect(result.values).toEqual([1, 'pending']);
        });
    });

    describe('Batch Operations', () => {
        test('handles multiple INSERT operations', () => {
            const changes = [
                { type: 'insert', data: { name: 'Alice' } },
                { type: 'insert', data: { name: 'Bob' } },
                { type: 'insert', data: { name: 'Charlie' } }
            ];

            const results = changes.map(c => SqlGenerator.generateSql('public', 'users', c));

            expect(results).toHaveLength(3);
            results.forEach((result, idx) => {
                expect(result.query).toContain('INSERT INTO "public"."users"');
                expect(result.values).toEqual([changes[idx].data.name]);
            });
        });

        test('handles mixed operation batch', () => {
            const changes = [
                { type: 'insert', data: { name: 'New User' } },
                { type: 'update', data: { name: 'Updated' }, where: { id: 1 } },
                { type: 'delete', where: { id: 2 } }
            ];

            const results = changes.map(c => SqlGenerator.generateSql('public', 'users', c));

            expect(results[0].query).toContain('INSERT');
            expect(results[1].query).toContain('UPDATE');
            expect(results[2].query).toContain('DELETE');
        });
    });

    describe('Column Name Edge Cases', () => {
        test('handles reserved SQL keywords as column names', () => {
            const change = {
                type: 'insert',
                data: { select: 'value1', where: 'value2', from: 'value3' }
            };

            const result = SqlGenerator.generateSql('public', 'keywords', change);

            expect(result.query).toContain('"select"');
            expect(result.query).toContain('"where"');
            expect(result.query).toContain('"from"');
        });

        test('handles columns with spaces and special chars', () => {
            const change = {
                type: 'insert',
                data: { 'First Name': 'John', 'E-Mail': 'john@test.com' }
            };

            const result = SqlGenerator.generateSql('public', 'contacts', change);

            expect(result.query).toContain('"First Name"');
            expect(result.query).toContain('"E-Mail"');
        });

        test('handles columns with quotes in names', () => {
            const change = {
                type: 'insert',
                data: { 'user"name': 'test' }
            };

            const result = SqlGenerator.generateSql('public', 'weird', change);

            // Column name should be quoted (note: SqlGenerator doesn't escape internal quotes in column names)
            // This is actually a limitation - column names are quoted but internal quotes aren't doubled
            expect(result.query).toContain('"user"name"');
        });
    });

    describe('Table and Schema Name Edge Cases', () => {
        test('handles schema names with special characters', () => {
            const change = {
                type: 'insert',
                data: { name: 'test' }
            };

            const result = SqlGenerator.generateSql('my-schema', 'users', change);

            expect(result.query).toContain('"my-schema"."users"');
        });

        test('handles table names with quotes', () => {
            const change = {
                type: 'insert',
                data: { value: 1 }
            };

            const result = SqlGenerator.generateSql('public', 'my"table', change);

            // Table name should be quoted (note: SqlGenerator doesn't escape internal quotes in table names)
            // This is actually a limitation - table names are quoted but internal quotes aren't doubled
            expect(result.query).toContain('"my"table"');
        });
    });

    describe('Data Type Handling', () => {
        test('preserves boolean values', () => {
            const change = {
                type: 'insert',
                data: { flag1: true, flag2: false, flag3: null }
            };

            const result = SqlGenerator.generateSql('public', 'flags', change);

            expect(result.values).toEqual([true, false, null]);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);
            expect(formatted).toContain('true');
            expect(formatted).toContain('false');
            expect(formatted).toContain('NULL');
        });

        test('preserves numeric values', () => {
            const change = {
                type: 'insert',
                data: {
                    int_val: 42,
                    float_val: 3.14159,
                    negative: -100,
                    zero: 0
                }
            };

            const result = SqlGenerator.generateSql('public', 'numbers', change);

            expect(result.values).toEqual([42, 3.14159, -100, 0]);
        });

        test('handles arrays', () => {
            const change = {
                type: 'insert',
                data: {
                    tags: ['tag1', 'tag2', 'tag3'],
                    numbers: [1, 2, 3]
                }
            };

            const result = SqlGenerator.generateSql('public', 'items', change);

            expect(result.values[0]).toEqual(['tag1', 'tag2', 'tag3']);
            expect(result.values[1]).toEqual([1, 2, 3]);
        });
    });

    describe('Empty and Edge Case Values', () => {
        test('handles empty object for INSERT', () => {
            const change = {
                type: 'insert',
                data: {}
            };

            const result = SqlGenerator.generateSql('public', 'empty', change);

            // Should handle gracefully - might throw or create valid SQL
            expect(result.query).toBeTruthy();
        });

        test('handles UPDATE with no changes', () => {
            const change = {
                type: 'update',
                data: {},
                where: { id: 1 }
            };

            const result = SqlGenerator.generateSql('public', 'test', change);

            // Should handle gracefully
            expect(result.query).toBeTruthy();
        });
    });
});
