import { buildAlterTableSql, buildCreateTableSql, buildDropTableSql, quoteIdentifier } from '../src/tableSqlBuilder';

describe('tableSqlBuilder', () => {
    test('quoteIdentifier escapes double quotes', () => {
        expect(quoteIdentifier('foo')).toBe('"foo"');
        expect(quoteIdentifier('weird"name')).toBe('"weird""name"');
    });

    test('buildCreateTableSql constructs statement with schema and table', () => {
        const sql = buildCreateTableSql('public', 'users', 'id SERIAL PRIMARY KEY');
        expect(sql).toBe('CREATE TABLE "public"."users" (id SERIAL PRIMARY KEY);');
    });

    test('buildCreateTableSql throws when columns empty', () => {
        expect(() => buildCreateTableSql('public', 'users', '   ')).toThrow('Column definitions cannot be empty');
    });

    test('buildAlterTableSql constructs statement and trims input', () => {
        const sql = buildAlterTableSql('app', 'orders', 'ADD COLUMN total NUMERIC');
        expect(sql).toBe('ALTER TABLE "app"."orders" ADD COLUMN total NUMERIC;');
    });

    test('buildAlterTableSql throws when clause empty', () => {
        expect(() => buildAlterTableSql('app', 'orders', '')).toThrow('Alter clause cannot be empty');
    });

    test('buildDropTableSql adds cascade when requested', () => {
        expect(buildDropTableSql('public', 'logs')).toBe('DROP TABLE "public"."logs";');
        expect(buildDropTableSql('public', 'logs', true)).toBe('DROP TABLE "public"."logs" CASCADE;');
    });
});
