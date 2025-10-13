/**
 * Schema Designer Tests
 * Tests ALTER TABLE SQL generation, validation, and edge cases
 */

import { buildAlterTableSql, buildCreateTableStatements, quoteIdentifier } from '../src/tableSqlBuilder';

describe('Schema Designer - ALTER TABLE', () => {
    describe('Column Operations', () => {
        test('ADD COLUMN with basic type', () => {
            const sql = buildAlterTableSql('public', 'users', 'ADD COLUMN email TEXT');
            expect(sql).toBe('ALTER TABLE "public"."users" ADD COLUMN email TEXT;');
        });

        test('ADD COLUMN with constraints', () => {
            const sql = buildAlterTableSql('public', 'users', 'ADD COLUMN age INTEGER NOT NULL DEFAULT 0');
            expect(sql).toBe('ALTER TABLE "public"."users" ADD COLUMN age INTEGER NOT NULL DEFAULT 0;');
        });

        test('DROP COLUMN', () => {
            const sql = buildAlterTableSql('public', 'users', 'DROP COLUMN old_field');
            expect(sql).toBe('ALTER TABLE "public"."users" DROP COLUMN old_field;');
        });

        test('ALTER COLUMN TYPE', () => {
            const sql = buildAlterTableSql('public', 'users', 'ALTER COLUMN age TYPE BIGINT');
            expect(sql).toBe('ALTER TABLE "public"."users" ALTER COLUMN age TYPE BIGINT;');
        });

        test('ALTER COLUMN SET NOT NULL', () => {
            const sql = buildAlterTableSql('public', 'users', 'ALTER COLUMN email SET NOT NULL');
            expect(sql).toBe('ALTER TABLE "public"."users" ALTER COLUMN email SET NOT NULL;');
        });

        test('ALTER COLUMN DROP NOT NULL', () => {
            const sql = buildAlterTableSql('public', 'users', 'ALTER COLUMN email DROP NOT NULL');
            expect(sql).toBe('ALTER TABLE "public"."users" ALTER COLUMN email DROP NOT NULL;');
        });

        test('ALTER COLUMN SET DEFAULT', () => {
            const sql = buildAlterTableSql('public', 'users', "ALTER COLUMN status SET DEFAULT 'active'");
            expect(sql).toBe('ALTER TABLE "public"."users" ALTER COLUMN status SET DEFAULT \'active\';');
        });

        test('ALTER COLUMN DROP DEFAULT', () => {
            const sql = buildAlterTableSql('public', 'users', 'ALTER COLUMN status DROP DEFAULT');
            expect(sql).toBe('ALTER TABLE "public"."users" ALTER COLUMN status DROP DEFAULT;');
        });

        test('RENAME COLUMN', () => {
            const sql = buildAlterTableSql('public', 'users', 'RENAME COLUMN old_name TO new_name');
            expect(sql).toBe('ALTER TABLE "public"."users" RENAME COLUMN old_name TO new_name;');
        });
    });

    describe('Constraint Operations', () => {
        test('ADD PRIMARY KEY', () => {
            const sql = buildAlterTableSql('public', 'users', 'ADD PRIMARY KEY (id)');
            expect(sql).toBe('ALTER TABLE "public"."users" ADD PRIMARY KEY (id);');
        });

        test('ADD FOREIGN KEY', () => {
            const sql = buildAlterTableSql('public', 'orders', 'ADD FOREIGN KEY (user_id) REFERENCES users(id)');
            expect(sql).toBe('ALTER TABLE "public"."orders" ADD FOREIGN KEY (user_id) REFERENCES users(id);');
        });

        test('ADD UNIQUE constraint', () => {
            const sql = buildAlterTableSql('public', 'users', 'ADD UNIQUE (email)');
            expect(sql).toBe('ALTER TABLE "public"."users" ADD UNIQUE (email);');
        });

        test('ADD CHECK constraint', () => {
            const sql = buildAlterTableSql('public', 'users', 'ADD CHECK (age >= 0)');
            expect(sql).toBe('ALTER TABLE "public"."users" ADD CHECK (age >= 0);');
        });

        test('DROP CONSTRAINT', () => {
            const sql = buildAlterTableSql('public', 'users', 'DROP CONSTRAINT users_email_key');
            expect(sql).toBe('ALTER TABLE "public"."users" DROP CONSTRAINT users_email_key;');
        });
    });

    describe('Multiple Operations', () => {
        test('handles multiple comma-separated clauses', () => {
            const clause = 'ADD COLUMN email TEXT, ADD COLUMN phone TEXT';
            const sql = buildAlterTableSql('public', 'users', clause);
            expect(sql).toContain('ADD COLUMN email TEXT');
            expect(sql).toContain('ADD COLUMN phone TEXT');
        });
    });

    describe('Edge Cases and Validation', () => {
        test('throws on empty clause', () => {
            expect(() => buildAlterTableSql('public', 'users', '')).toThrow('Alter clause cannot be empty');
            expect(() => buildAlterTableSql('public', 'users', '   ')).toThrow('Alter clause cannot be empty');
        });

        test('handles schema with special characters', () => {
            const sql = buildAlterTableSql('my-app', 'users', 'ADD COLUMN test TEXT');
            expect(sql).toContain('"my-app"');
        });

        test('handles table with quotes', () => {
            const sql = buildAlterTableSql('public', 'my"table', 'ADD COLUMN test TEXT');
            expect(sql).toContain('"my""table"');
        });

        test('trims whitespace from clause', () => {
            const sql = buildAlterTableSql('public', 'users', '  ADD COLUMN test TEXT  ');
            expect(sql).toBe('ALTER TABLE "public"."users" ADD COLUMN test TEXT;');
        });
    });

    describe('Identifier Quoting', () => {
        test('quotes normal identifiers', () => {
            expect(quoteIdentifier('users')).toBe('"users"');
            expect(quoteIdentifier('public')).toBe('"public"');
        });

        test('escapes double quotes in identifiers', () => {
            expect(quoteIdentifier('my"table')).toBe('"my""table"');
            expect(quoteIdentifier('col"name"test')).toBe('"col""name""test"');
        });

        test('throws on empty string', () => {
            expect(() => quoteIdentifier('')).toThrow('Identifier is required');
        });

        test('handles special characters', () => {
            expect(quoteIdentifier('my-table')).toBe('"my-table"');
            expect(quoteIdentifier('table.name')).toBe('"table.name"');
            expect(quoteIdentifier('table name')).toBe('"table name"');
        });
    });
});

describe('Schema Designer - CREATE TABLE', () => {
    test('buildCreateTableStatements generates proper structure', () => {
        const columns = [
            { name: 'id', type: 'SERIAL', nullable: false, defaultValue: null, comment: 'Primary key', isPrimaryKey: true },
            { name: 'name', type: 'TEXT', nullable: false, defaultValue: null, comment: null, isPrimaryKey: false },
            { name: 'email', type: 'TEXT', nullable: true, defaultValue: null, comment: 'User email', isPrimaryKey: false },
            { name: 'created_at', type: 'TIMESTAMP', nullable: false, defaultValue: 'NOW()', comment: null, isPrimaryKey: false }
        ];

        const result = buildCreateTableStatements('public', 'users', columns as any);

        expect(result.statements.length).toBeGreaterThan(0);
        expect(result.statements.some((s: string) => s.includes('CREATE TABLE'))).toBe(true);
        expect(result.statements.some((s: string) => s.includes('PRIMARY KEY'))).toBe(true);
        expect(result.statements.some((s: string) => s.includes('COMMENT ON COLUMN'))).toBe(true);
    });

    test('warns about NOT NULL without default', () => {
        const columns = [
            { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, comment: null, isPrimaryKey: true },
            { name: 'required_field', type: 'TEXT', nullable: false, defaultValue: null, comment: null, isPrimaryKey: false }
        ];

        const result = buildCreateTableStatements('public', 'test', columns as any);

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some((w: string) => w.includes('required_field'))).toBe(true);
    });

    test('handles column with default value', () => {
        const columns = [
            { name: 'id', type: 'SERIAL', nullable: false, defaultValue: null, comment: null, isPrimaryKey: true },
            { name: 'status', type: 'TEXT', nullable: false, defaultValue: "'pending'", comment: null, isPrimaryKey: false }
        ];

        const result = buildCreateTableStatements('public', 'tasks', columns as any);

        const createStmt = result.statements.find((s: string) => s.includes('CREATE TABLE'));
        expect(createStmt).toContain("DEFAULT 'pending'");
    });
});
