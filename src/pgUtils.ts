// pgUtils.ts - lightweight Postgres helpers used by the extension
// These helpers are intentionally small and well-tested so the
// data-editor's parsing/enum-detection behavior can be validated
// independently from the full WebView/DB codepath.

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  enumValues?: string[];
}

/**
 * Cast a single array element string according to a Postgres element type.
 * This mirrors the best-effort behavior used in the data editor.
 */
export function castArrayElement(raw: string, pgType?: string): unknown {
  const trimmed = raw === null || raw === undefined ? '' : String(raw).trim();
  if (trimmed === 'NULL') return null;

  const baseType = pgType ? String(pgType).replace(/\[\]$/, '').toLowerCase() : undefined;

  if (baseType && (baseType.includes('int') || baseType === 'bigint' || baseType === 'smallint' || baseType === 'integer')) {
    const n = Number.parseInt(trimmed, 10);
    return Number.isNaN(n) ? trimmed : n;
  }

  if (baseType && (baseType === 'numeric' || baseType === 'decimal' || baseType.includes('float') || baseType === 'real' || baseType === 'double precision')) {
    const f = Number.parseFloat(trimmed);
    return Number.isNaN(f) ? trimmed : f;
  }

  if (baseType && (baseType === 'boolean' || baseType === 'bool' || baseType === 'boolean[]')) {
    return trimmed.toLowerCase() === 'true' || trimmed === '1';
  }

  return trimmed;
}

/**
 * Parse a small subset of Postgres array literal syntax into a JS array.
 * Supports quoted values with escaped quotes, backslash escapes and NULL.
 */
export function parsePostgresArrayLiteral(literal: string, pgType?: string): unknown[] {
  if (!literal || typeof literal !== 'string') return [];

  let body = literal;
  if (body.startsWith('{') && body.endsWith('}')) {
    body = body.slice(1, -1);
  }

  const result: unknown[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < body.length && body[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === '\\' && i + 1 < body.length) {
        current += body[i + 1];
        i += 2;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      result.push(castArrayElement(current, pgType));
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.length > 0 || body.endsWith(',')) {
    result.push(castArrayElement(current, pgType));
  }

  return result;
}

/**
 * Attach enum labels (from pg_enum) to ColumnInfo entries when the
 * column type oid or element type oid matches a known enum oid.
 *
 * columnsResultRows should be the rows returned from the
 * pg_attribute/pg_type query (the same shape used in DataEditor).
 */
export function applyEnumLabelsToColumns(columns: ColumnInfo[], columnsResultRows: any[], enumLabelsByOid: Record<number, string[]>) {
  for (let i = 0; i < columns.length; i++) {
    const colRow = columnsResultRows[i] ?? {};
    const col = columns[i];
    const typoid = Number(colRow.typoid) || 0;
    const typelem = Number(colRow.typelem) || 0;
    if (typoid && enumLabelsByOid[typoid]) {
      col.enumValues = enumLabelsByOid[typoid];
    } else if (typelem && enumLabelsByOid[typelem]) {
      col.enumValues = enumLabelsByOid[typelem];
    }
  }
  return columns;
}
