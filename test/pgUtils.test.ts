import { parsePostgresArrayLiteral, applyEnumLabelsToColumns } from '../src/pgUtils';

describe('parsePostgresArrayLiteral', () => {
  test('parses simple unquoted array', () => {
    expect(parsePostgresArrayLiteral('{a,b,c}', 'text[]')).toEqual(['a', 'b', 'c']);
  });

  test('parses quoted elements containing commas', () => {
    expect(parsePostgresArrayLiteral('{"a,b","c"}', 'text[]')).toEqual(['a,b', 'c']);
  });

  test('parses NULL elements', () => {
    expect(parsePostgresArrayLiteral('{a,NULL,"b"}', 'text[]')).toEqual(['a', null, 'b']);
  });

  test('parses integer arrays into numbers', () => {
    expect(parsePostgresArrayLiteral('{1,2,3}', 'integer[]')).toEqual([1, 2, 3]);
  });

  test('parses numeric arrays into floats', () => {
    expect(parsePostgresArrayLiteral('{1.5,2.25}', 'numeric[]')).toEqual([1.5, 2.25]);
  });

  test('parses boolean-like values', () => {
    expect(parsePostgresArrayLiteral('{true,false,1}', 'boolean[]')).toEqual([true, false, true]);
  });
});

describe('applyEnumLabelsToColumns', () => {
  test('attaches enum labels when column typoid matches', () => {
    const cols = [{ name: 'status', type: 'status', nullable: false }];
    const rows = [{ typoid: 1001, typelem: 0 }];
    const labels: Record<number, string[]> = { 1001: ['open', 'closed'] };
    const out = applyEnumLabelsToColumns(cols, rows, labels);
    expect(out[0].enumValues).toEqual(['open', 'closed']);
  });

  test('attaches enum labels when element type matches (array-of-enum)', () => {
    const cols = [{ name: 'tags', type: 'myenum[]', nullable: true }];
    const rows = [{ typoid: 0, typelem: 2002 }];
    const labels: Record<number, string[]> = { 2002: ['a', 'b'] };
    const out = applyEnumLabelsToColumns(cols, rows, labels);
    expect(out[0].enumValues).toEqual(['a', 'b']);
  });
});
