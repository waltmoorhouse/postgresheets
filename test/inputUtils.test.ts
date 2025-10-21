import { sanitizeIntegerInput, sanitizeFloatInput, isIntegerType, isFloatType } from '../webview/src/lib/inputUtils';

describe('inputUtils', () => {
  test('sanitizes integers by removing letters', () => {
    expect(sanitizeIntegerInput('12a3')).toBe('123');
    expect(sanitizeIntegerInput('-1a2b')).toBe('-12');
    expect(sanitizeIntegerInput('a1b2')).toBe('12');
  });

  test('sanitizes floats by removing letters and extra dots', () => {
    expect(sanitizeFloatInput('1.2.3a')).toBe('1.23');
    expect(sanitizeFloatInput('-1.5e+2x')).toBe('-1.5e+2');
  });

  test('type detectors', () => {
    expect(isIntegerType('bigint')).toBe(true);
    expect(isIntegerType('integer')).toBe(true);
    expect(isFloatType('numeric')).toBe(true);
    expect(isFloatType('double precision')).toBe(true);
  });
});
