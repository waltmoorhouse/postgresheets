/**
 * Special Characters Test Suite
 * Tests handling of various quote types, special characters, and edge cases
 */

import { SqlGenerator } from '../src/sqlGenerator';
import type { GridChange } from '../src/types';

describe('Special Characters Handling', () => {
    describe('Single Quotes', () => {
        test('handles single quotes in INSERT', () => {
            const change: GridChange = {
                type: 'insert',
                data: { name: "O'Hara", description: "It's a test" }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toContain("'O''Hara'");
            expect(formatted).toContain("'It''s a test'");
        });

        test('handles single quotes in UPDATE', () => {
            const change: GridChange = {
                type: 'update',
                data: { description: "John's car" },
                where: { id: 1 }
            };

            const result = SqlGenerator.generateSql('public', 'items', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toContain("'John''s car'");
        });

        test('handles multiple single quotes in WHERE clause', () => {
            const change: GridChange = {
                type: 'delete',
                where: { name: "O'Brien's" }
            };

            const result = SqlGenerator.generateSql('public', 'items', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toContain("'O''Brien''s'");
        });
    });

    describe('Double Quotes', () => {
        test('handles double quotes in text values', () => {
            const change: GridChange = {
                type: 'insert',
                data: { quote: 'He said "hello"', json_text: '{"key": "value"}' }
            };

            const result = SqlGenerator.generateSql('public', 'quotes', change);
            expect(result.values).toEqual(['He said "hello"', '{"key": "value"}']);
        });

        test('preserves double quotes in JSON strings', () => {
            const change: GridChange = {
                type: 'insert',
                data: { data: { message: "This has \"nested\" quotes" } }
            };

            const result = SqlGenerator.generateSql('public', 'logs', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toContain('nested');
        });
    });

    describe('Backticks', () => {
        test('handles backticks in text', () => {
            const change: GridChange = {
                type: 'insert',
                data: { command: 'Run `npm install` first', note: '`test`' }
            };

            const result = SqlGenerator.generateSql('public', 'commands', change);
            expect(result.values).toEqual(['Run `npm install` first', '`test`']);
        });
    });

    describe('Mixed Quote Types', () => {
        test('handles all quote types together', () => {
            const change: GridChange = {
                type: 'insert',
                data: {
                    text: `O'Hara said "hello" with \`backticks\``,
                    json: '{"name": "O\'Brien", "note": "`test`"}'
                }
            };

            const result = SqlGenerator.generateSql('public', 'mixed', change);
            expect(result.query).toBe('INSERT INTO "public"."mixed" ("text", "json") VALUES ($1, $2)');
            expect(result.values.length).toBe(2);
        });
    });

    describe('Newlines and Special Characters', () => {
        test('handles newlines in text', () => {
            const change: GridChange = {
                type: 'insert',
                data: { description: "Line 1\nLine 2\nLine 3" }
            };

            const result = SqlGenerator.generateSql('public', 'texts', change);
            expect(result.values[0]).toBe("Line 1\nLine 2\nLine 3");
        });

        test('handles tabs in text', () => {
            const change: GridChange = {
                type: 'insert',
                data: { data: "Col1\tCol2\tCol3" }
            };

            const result = SqlGenerator.generateSql('public', 'texts', change);
            expect(result.values[0]).toBe("Col1\tCol2\tCol3");
        });

        test('handles unicode characters', () => {
            const change: GridChange = {
                type: 'insert',
                data: { name: "José García", emoji: "🎉✨🚀" }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);
            expect(result.values).toEqual(["José García", "🎉✨🚀"]);
        });
    });

    describe('NULL and Empty Values', () => {
        test('handles NULL values correctly', () => {
            const change: GridChange = {
                type: 'insert',
                data: { name: "John", age: null, active: true }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toContain('NULL');
            expect(formatted).toContain("'John'");
            expect(formatted).toContain('true');
        });

        test('handles empty strings', () => {
            const change: GridChange = {
                type: 'insert',
                data: { name: "", description: "not empty" }
            };

            const result = SqlGenerator.generateSql('public', 'items', change);
            expect(result.values).toEqual(["", "not empty"]);
        });

        test('distinguishes NULL from empty string', () => {
            const change: GridChange = {
                type: 'insert',
                data: { field1: null, field2: "" }
            };

            const result = SqlGenerator.generateSql('public', 'test', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toMatch(/NULL,\s*''/);
        });
    });

    describe('JSON/JSONB Values', () => {
        test('handles JSON objects', () => {
            const change: GridChange = {
                type: 'insert',
                data: {
                    metadata: { key: "value", nested: { arr: [1, 2, 3] } }
                }
            };

            const result = SqlGenerator.generateSql('public', 'documents', change);
            expect(result.values[0]).toEqual({ key: "value", nested: { arr: [1, 2, 3] } });
        });

        test('handles JSON with special characters', () => {
            const change: GridChange = {
                type: 'insert',
                data: {
                    config: { message: "O'Brien's \"quote\"", emoji: "🎉" }
                }
            };

            const result = SqlGenerator.generateSql('public', 'configs', change);
            const formatted = SqlGenerator.formatSqlWithValues(result.query, result.values);

            expect(formatted).toContain('O');
            expect(formatted).toContain('Brien');
        });
    });

    describe('SQL Injection Prevention', () => {
        test('parameterizes values with SQL-like syntax', () => {
            const change: GridChange = {
                type: 'insert',
                data: { name: "'; DROP TABLE users; --" }
            };

            const result = SqlGenerator.generateSql('public', 'test', change);

            // Should use parameterized query, not inject SQL
            expect(result.query).toContain('$1');
            expect(result.values[0]).toBe("'; DROP TABLE users; --");
        });

        test('handles WHERE clause with malicious content', () => {
            const change: GridChange = {
                type: 'delete',
                where: { name: "admin' OR '1'='1" }
            };

            const result = SqlGenerator.generateSql('public', 'users', change);

            expect(result.query).toContain('$1');
            expect(result.values[0]).toBe("admin' OR '1'='1");
        });
    });

    describe('Backslashes and Escape Sequences', () => {
        test('handles backslashes in text', () => {
            const change: GridChange = {
                type: 'insert',
                data: { path: "C:\\Users\\John\\Documents", regex: "\\d+\\w*" }
            };

            const result = SqlGenerator.generateSql('public', 'paths', change);
            expect(result.values).toEqual(["C:\\Users\\John\\Documents", "\\d+\\w*"]);
        });

        test('handles mixed escapes', () => {
            const change: GridChange = {
                type: 'insert',
                data: { text: "Line 1\\nLine 2\nActual newline" }
            };

            const result = SqlGenerator.generateSql('public', 'texts', change);
            expect(result.values[0]).toBe("Line 1\\nLine 2\nActual newline");
        });
    });
});
