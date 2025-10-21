import { validateChangesAgainstSchema } from '../src/sqlValidator';
import { fn } from 'jest-mock';

function makeClient(columnRows: any[], enumRows: any[] = []) {
  return {
    query: fn(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM pg_attribute')) {
        return { rows: columnRows };
      }
      if (sql.includes('FROM pg_enum')) {
        return { rows: enumRows };
      }
      return { rows: [] };
    })
  } as any;
}

test('detects non-numeric value for bigint column', async () => {
  const cols = [{ column_name: 'id', data_type: 'bigint', is_nullable: false, typoid: 20, typelem: 0 }];
  const client = makeClient(cols);
  const changes = [{ type: 'insert', data: { id: 'abc' } }];
  const errors = await validateChangesAgainstSchema(client, 'public', 't', changes);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toMatch(/expected integer/i);
});

test('accepts numeric value for bigint column', async () => {
  const cols = [{ column_name: 'id', data_type: 'bigint', is_nullable: false, typoid: 20, typelem: 0 }];
  const client = makeClient(cols);
  const changes = [{ type: 'insert', data: { id: '123' } }];
  const errors = await validateChangesAgainstSchema(client, 'public', 't', changes);
  expect(errors).toHaveLength(0);
});

test('detects invalid enum element in array-of-enum column', async () => {
  const cols = [{ column_name: 'tags', data_type: 'myenum[]', is_nullable: true, typoid: 0, typelem: 2002 }];
  const enumRows = [{ enumtypid: 2002, enumlabel: 'a' }, { enumtypid: 2002, enumlabel: 'b' }];
  const client = makeClient(cols, enumRows);
  const changes = [{ type: 'insert', data: { tags: ['a', 'bad'] } }];
  const errors = await validateChangesAgainstSchema(client, 'public', 't', changes);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toMatch(/invalid enum element/i);
});

test('validates ISO date strings and rejects non-ISO', async () => {
  const cols = [{ column_name: 'created_at', data_type: 'timestamp without time zone', is_nullable: false, typoid: 1114, typelem: 0 }];
  const client = makeClient(cols);
  const changes = [{ type: 'insert', data: { created_at: 'not-a-date' } }];
  const errors = await validateChangesAgainstSchema(client, 'public', 't', changes);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toMatch(/expected date/i);
});

test('validates UUID values', async () => {
  const cols = [{ column_name: 'id', data_type: 'uuid', is_nullable: false, typoid: 2950, typelem: 0 }];
  const client = makeClient(cols);
  const errors1 = await validateChangesAgainstSchema(client, 'public', 't', [{ type: 'insert', data: { id: 'not-a-uuid' } }]);
  expect(errors1.length).toBeGreaterThan(0);
  const errors2 = await validateChangesAgainstSchema(client, 'public', 't', [{ type: 'insert', data: { id: '550e8400-e29b-41d4-a716-446655440000' } }]);
  expect(errors2).toHaveLength(0);
});
