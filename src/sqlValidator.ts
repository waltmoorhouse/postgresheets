import type { Client } from 'pg';

interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
  typoid: number;
  typelem: number;
}

/**
 * Validate a batch of GridChange-like objects against the database schema.
 * Returns an array of error messages; empty array means validation passed.
 */
export async function validateChangesAgainstSchema(client: Client, schemaName: string, tableName: string, changes: any[]): Promise<string[]> {
  const errors: string[] = [];

  // Fetch column metadata (matching the same query used when building payloads)
  const columnsResult = await client.query(
    `SELECT a.attname AS column_name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
            NOT a.attnotnull AS is_nullable,
            t.oid AS typoid,
            t.typelem AS typelem
     FROM pg_attribute a
     JOIN pg_class c ON a.attrelid = c.oid
     JOIN pg_namespace n ON c.relnamespace = n.oid
     JOIN pg_type t ON a.atttypid = t.oid
     WHERE n.nspname = $1
       AND c.relname = $2
       AND a.attnum > 0
       AND NOT a.attisdropped
     ORDER BY a.attnum;`,
    [schemaName, tableName]
  );

  const cols: ColumnMeta[] = columnsResult.rows.map((r: any) => ({
    name: String(r.column_name),
    type: String(r.data_type),
    nullable: Boolean(r.is_nullable),
    typoid: Number(r.typoid) || 0,
    typelem: Number(r.typelem) || 0
  }));

  const byName = new Map(cols.map((c) => [c.name, c]));

  // Collect enum type oids
  const candidateOids: number[] = [];
  for (const c of cols) {
    if (c.typoid) candidateOids.push(c.typoid);
    if (c.typelem) candidateOids.push(c.typelem);
  }
  const uniqueOids = Array.from(new Set(candidateOids));

  const enumLabelsByOid: Record<number, string[]> = {};
  if (uniqueOids.length > 0) {
    const enumRows = await client.query(
      `SELECT enumtypid::oid AS enumtypid, enumlabel FROM pg_enum WHERE enumtypid = ANY($1::oid[]) ORDER BY enumtypid, enumsortorder`,
      [uniqueOids]
    );
    for (const er of enumRows.rows) {
      const oid = Number(er.enumtypid);
      enumLabelsByOid[oid] = enumLabelsByOid[oid] || [];
      enumLabelsByOid[oid].push(String(er.enumlabel));
    }
  }

  // Helper to check numericness
  const isIntegerString = (v: any) => typeof v === 'number' ? Number.isInteger(v) : /^-?\d+$/.test(String(v));
  const isNumericString = (v: any) => typeof v === 'number' ? !Number.isNaN(v) : /^-?\d+(?:\.\d+)?$/.test(String(v));

  // Validate each change
  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    if (!ch || (ch.type !== 'insert' && ch.type !== 'update')) continue;
    const data = ch.data ?? {};
    for (const [colName, val] of Object.entries(data)) {
      const meta = byName.get(colName);
      if (!meta) continue; // unknown column - let DB fail
      const baseType = String(meta.type).replace(/\[\]$/, '').toLowerCase();

      // Skip JSON types
      if (baseType === 'json' || baseType === 'jsonb') continue;

      // Nulls allowed
      if (val === null || val === undefined) continue;

      // Arrays: for now, if element type is enum, validate contents
      if (String(meta.type).endsWith('[]')) {
        if (!Array.isArray(val)) {
          errors.push(`Column "${colName}" expects an array`);
          continue;
        }
        const elemOid = meta.typelem || 0;
        if (elemOid && enumLabelsByOid[elemOid]) {
          const labels = enumLabelsByOid[elemOid];
          for (const el of val as any[]) {
            if (el === null) continue;
            if (!labels.includes(String(el))) {
              errors.push(`Column "${colName}" contains invalid enum element: ${String(el)}`);
            }
          }
        }
        continue;
      }

      // Enums
      if (meta.typoid && enumLabelsByOid[meta.typoid]) {
        const labels = enumLabelsByOid[meta.typoid];
        if (!labels.includes(String(val))) {
          errors.push(`Column "${colName}" has invalid enum value: ${String(val)}`);
        }
        continue;
      }

      // Integers
      if (baseType.includes('int') || baseType === 'bigint' || baseType === 'smallint' || baseType === 'integer') {
        if (!isIntegerString(val)) {
          errors.push(`Column "${colName}" expected integer but got: ${String(val)}`);
        }
        continue;
      }

      // Numeric/floats
      if (baseType === 'numeric' || baseType === 'decimal' || baseType.includes('float') || baseType === 'real' || baseType === 'double precision') {
        if (!isNumericString(val)) {
          errors.push(`Column "${colName}" expected numeric value but got: ${String(val)}`);
        }
        continue;
      }

          // Dates / timestamps - accept ISO-like strings or Date objects
          if (baseType === 'date' || baseType.includes('timestamp') || baseType === 'time') {
            const s = String(val);
            // Very small heuristic: ISO date-like check (YYYY-MM-DD or full ISO)
            if (!(typeof val === 'object' && val instanceof Date) && !/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) {
              errors.push(`Column "${colName}" expected date/time in ISO format but got: ${String(val)}`);
            }
            continue;
          }

          // UUID
          if (baseType === 'uuid') {
            const s = String(val);
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
              errors.push(`Column "${colName}" expected UUID but got: ${String(val)}`);
            }
            continue;
          }

      // Booleans
      if (baseType === 'boolean' || baseType === 'bool') {
        const acceptable = (v: any) => typeof v === 'boolean' || v === 0 || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1' || String(v).toLowerCase() === 'false' || String(v) === '0';
        if (!acceptable(val)) {
          errors.push(`Column "${colName}" expected boolean but got: ${String(val)}`);
        }
        continue;
      }
    }
  }

  return errors;
}
