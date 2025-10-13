import { SqlGenerator } from '../src/sqlGenerator';
import { buildCreateTableStatements } from '../src/tableSqlBuilder';

describe('Phase6 additional tests', () => {
    test('formatSqlWithValues handles strings with quotes, nulls and objects', () => {
        const query = `INSERT INTO "public"."t" (a, b, c, d) VALUES ($1, $2, $3, $4)`;
        const values = ["O'Hara", null, { x: 1, y: "yes" }, 42];

        const formatted = SqlGenerator.formatSqlWithValues(query, values);

        expect(formatted).toContain("'O''Hara'");
        expect(formatted).toContain('NULL');
        expect(formatted).toContain("'{\"x\":1,\"y\":\"yes\"}'");
        expect(formatted).toContain('42');
    });

    test('buildCreateTableStatements warns for NOT NULL without default', () => {
        const cols = [
            { name: 'id', type: 'SERIAL', nullable: false, defaultValue: null, comment: null, isPrimaryKey: true },
            { name: 'name', type: 'TEXT', nullable: false, defaultValue: null, comment: null, isPrimaryKey: false }
        ];

        const result = buildCreateTableStatements('public', 'people', cols as any);

        expect(result.statements.length).toBeGreaterThan(0);
        expect(result.warnings.length).toBeGreaterThanOrEqual(1);
        expect(result.warnings.some(w => w.includes('NOT NULL'))).toBe(true);
    });
});
