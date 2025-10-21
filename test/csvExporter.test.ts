/**
 * Tests for CSV Exporter functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CsvExporter, ExportOptions } from '../src/csvExporter';

describe('CsvExporter', () => {
    describe('escapeField', () => {
        it('should return empty string for null/undefined', () => {
            expect(CsvExporter.escapeField(null)).toBe('');
            expect(CsvExporter.escapeField(undefined)).toBe('');
        });

        it('should not escape simple values', () => {
            expect(CsvExporter.escapeField('simple')).toBe('simple');
            expect(CsvExporter.escapeField('123')).toBe('123');
            expect(CsvExporter.escapeField('hello')).toBe('hello');
        });

        it('should escape values with commas', () => {
            expect(CsvExporter.escapeField('value,with,comma')).toBe('"value,with,comma"');
        });

        it('should escape values with quotes', () => {
            expect(CsvExporter.escapeField('value"with"quote')).toBe('"value""with""quote"');
        });

        it('should escape values with newlines', () => {
            expect(CsvExporter.escapeField('value\nwith\nnewline')).toBe('"value\nwith\nnewline"');
        });

        it('should escape values with carriage returns', () => {
            expect(CsvExporter.escapeField('value\rcarriage')).toBe('"value\rcarriage"');
        });

        it('should handle complex values', () => {
            const result = CsvExporter.escapeField('Hello "World", test\nline');
            expect(result).toBe('"Hello ""World"", test\nline"');
        });
    });

    describe('formatRow', () => {
        it('should format simple row', () => {
            const row = ['name', 'email', 'age'];
            expect(CsvExporter.formatRow(row)).toBe('name,email,age');
        });

        it('should format row with commas', () => {
            const row = ['Smith, John', 'test@example.com', '25'];
            expect(CsvExporter.formatRow(row)).toBe('"Smith, John",test@example.com,25');
        });

        it('should handle custom delimiter', () => {
            const row = ['name', 'email', 'age'];
            expect(CsvExporter.formatRow(row, ';')).toBe('name;email;age');
        });

        it('should handle null values', () => {
            const row = ['name', null, 'age'];
            expect(CsvExporter.formatRow(row)).toBe('name,,age');
        });
    });

    describe('generateCsv', () => {
        it('should generate CSV with headers', () => {
            const columns = ['name', 'age', 'city'];
            const rows = [
                ['Alice', '30', 'New York'],
                ['Bob', '25', 'Los Angeles'],
                ['Charlie', '35', 'Chicago']
            ];

            const result = CsvExporter.generateCsv(columns, rows, { includeHeaders: true });
            const lines = result.split('\n');

            expect(lines[0]).toBe('name,age,city');
            expect(lines[1]).toBe('Alice,30,New York');
            expect(lines[2]).toBe('Bob,25,Los Angeles');
            expect(lines[3]).toBe('Charlie,35,Chicago');
        });

        it('should generate CSV without headers', () => {
            const columns = ['name', 'age', 'city'];
            const rows = [
                ['Alice', '30', 'New York'],
                ['Bob', '25', 'Los Angeles']
            ];

            const result = CsvExporter.generateCsv(columns, rows, { includeHeaders: false });
            const lines = result.split('\n');

            expect(lines[0]).toBe('Alice,30,New York');
            expect(lines[1]).toBe('Bob,25,Los Angeles');
        });

        it('should handle empty rows', () => {
            const columns = ['name', 'age'];
            const rows: any[][] = [];

            const result = CsvExporter.generateCsv(columns, rows, { includeHeaders: true });
            expect(result).toBe('name,age');
        });

        it('should handle special characters', () => {
            const columns = ['name', 'description'];
            const rows = [
                ['Product A', 'Comma, separated'],
                ['Product "B"', 'Quote marks']
            ];

            const result = CsvExporter.generateCsv(columns, rows, { includeHeaders: true });
            const lines = result.split('\n');

            expect(lines[0]).toBe('name,description');
            expect(lines[1]).toBe('Product A,"Comma, separated"');
            // Check that quotes are properly escaped
            expect(lines[2]).toContain('Product');
            expect(lines[2]).toContain('Quote marks');
            // Verify round-trip works
            const parsed = CsvExporter.parseCsv(result);
            expect(parsed[2][0]).toBe('Product "B"');
        });
    });

    describe('parseCsv', () => {
        it('should parse simple CSV', () => {
            const csv = 'name,age,city\nAlice,30,New York\nBob,25,Los Angeles';
            const result = CsvExporter.parseCsv(csv);

            expect(result).toHaveLength(3);
            expect(result[0]).toEqual(['name', 'age', 'city']);
            expect(result[1]).toEqual(['Alice', '30', 'New York']);
            expect(result[2]).toEqual(['Bob', '25', 'Los Angeles']);
        });

        it('should parse CSV with quoted fields', () => {
            const csv = 'name,description\n"Smith, John","Comma, separated"';
            const result = CsvExporter.parseCsv(csv);

            expect(result).toHaveLength(2);
            expect(result[1]).toEqual(['Smith, John', 'Comma, separated']);
        });

        it('should parse CSV with escaped quotes', () => {
            const csv = '"Product ""B""","Quote marks"';
            const result = CsvExporter.parseCsv(csv);

            expect(result[0]).toEqual(['Product "B"', 'Quote marks']);
        });

        it('should handle empty fields', () => {
            const csv = 'name,age,city\nAlice,,New York';
            const result = CsvExporter.parseCsv(csv);

            expect(result[1]).toEqual(['Alice', '', 'New York']);
        });

        it('should handle line endings', () => {
            const csv = 'name,age\r\nAlice,30\r\nBob,25';
            const result = CsvExporter.parseCsv(csv);

            expect(result).toHaveLength(3);
            expect(result[1]).toEqual(['Alice', '30']);
            expect(result[2]).toEqual(['Bob', '25']);
        });
    });

    describe('roundtrip', () => {
        it('should generate and parse CSV consistently', () => {
            const columns = ['name', 'email', 'age'];
            const original = [
                ['Alice', 'alice@example.com', '30'],
                ['Bob', 'bob@example.com', '25'],
                ['Charlie', 'charlie@example.com', '35']
            ];

            const csv = CsvExporter.generateCsv(columns, original, { includeHeaders: true });
            const parsed = CsvExporter.parseCsv(csv);

            expect(parsed[0]).toEqual(columns);
            expect(parsed[1]).toEqual(original[0]);
            expect(parsed[2]).toEqual(original[1]);
            expect(parsed[3]).toEqual(original[2]);
        });

        it('should roundtrip with special characters', () => {
            const columns = ['name', 'description'];
            const original = [
                ['Smith, John', 'Contains "quotes" and, commas'],
                ['Product A', 'Normal text']
            ];

            const csv = CsvExporter.generateCsv(columns, original, { includeHeaders: true });
            const parsed = CsvExporter.parseCsv(csv);

            expect(parsed[1]).toEqual(original[0]);
            expect(parsed[2]).toEqual(original[1]);
        });
    });
});
