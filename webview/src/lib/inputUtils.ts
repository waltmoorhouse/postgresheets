export function isIntegerType(type: unknown): boolean {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return /(^|\W)(smallint|int|integer|bigint|serial|bigserial)(\W|$)/.test(t);
}

export function isFloatType(type: unknown): boolean {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return /(^|\W)(numeric|decimal|float|real|double precision)(\W|$)/.test(t) || t.includes('double');
}

export function sanitizeIntegerInput(value: string): string {
  if (!value) return '';
  // Preserve a single leading '-' if present then strip all non-digits
  const neg = value.startsWith('-');
  const digits = value.replace(/[^0-9]/g, '');
  return neg ? `-${digits}` : digits;
}

export function sanitizeFloatInput(value: string): string {
  if (!value) return '';
  // Remove letters and keep digits + one dot + exponent parts
  let v = value.replace(/[^0-9eE+\-.]/g, '');
  // Collapse multiple dots to a single dot (keep first)
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  // Collapse multiple e/E to a single one (keep first)
  const eIndex = Math.max(v.indexOf('e'), v.indexOf('E'));
  if (eIndex !== -1) {
    const before = v.slice(0, eIndex + 1);
    let after = v.slice(eIndex + 1).replace(/[eE]/g, '');
    // Allow a single leading sign in exponent
    after = after.replace(/[^0-9+\-]/g, '');
    // Collapse multiple + or - at start of exponent
    after = after.replace(/^(\+|-)+/, (m) => m[m.length - 1]);
    v = before + after;
  }
  // Ensure we don't return an isolated '+' or '-' only
  if (v === '+' || v === '-') return '';
  return v;
}
