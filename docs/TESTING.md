# Testing Guide for PostgreSheets

## Overview

This document provides comprehensive testing guidelines for the PostgreSheets VS Code extension. The test suite covers backend logic, SQL generation, special character handling, and extension integration.

## Test Structure

```
test/
├── integration/              # VS Code extension integration tests
│   ├── runTest.ts           # Test runner setup
│   └── suite/               # Test suites
│       ├── index.ts         # Test configuration
│       ├── connectionManager.test.ts
│       └── dataEditor.test.ts
├── dataEditor.integration.test.ts        # Grid operations tests
├── phase6.additional.test.ts             # Additional Phase 6 tests
├── schemaDesigner.test.ts                # Schema designer tests
├── specialCharacters.test.ts             # Special character handling
├── sqlGenerator.test.ts                  # SQL generation tests
├── tableSqlBuilder.test.ts               # Table SQL builder tests
├── webviewUpdate.test.ts                 # Webview utility tests
├── csvExporter.test.ts                   # CSV export functionality
├── csvImport.test.ts                     # CSV import functionality
├── queryHistory.test.ts                  # Query history storage and retrieval
└── webviewAccessibilityEnhancements.spec.ts  # Accessibility features
```

## Running Tests

### Backend Unit Tests (Jest)

```bash
# Run all tests
npm test

# Run specific test file
npm test -- specialCharacters.test.ts

# Run with coverage report
npm test -- --coverage

# Watch mode for development
npm test -- --watch

# Run tests matching pattern
npm test -- --testNamePattern="handles single quotes"
```

### Integration Tests (VS Code Extension)

**Note:** Integration tests require additional setup (see Setup section below).

```bash
# Run integration tests (once configured)
npm run test:integration
```

## Test Categories

### 1. SQL Generation Tests (`sqlGenerator.test.ts`)

Tests the core SQL generation logic for CRUD operations.

**Coverage:**
- INSERT statement generation
- UPDATE with WHERE clause
- DELETE operations
- Parameterized query creation
- Value sanitization

**Example:**
```typescript
test('generates INSERT with parameterized values', () => {
    const change = {
        type: 'insert',
        data: { name: 'John', age: 30 }
    };
    const result = SqlGenerator.generateSql('public', 'users', change);
    
    expect(result.query).toBe('INSERT INTO "public"."users" ("name", "age") VALUES ($1, $2)');
    expect(result.values).toEqual(['John', 30]);
});
```

### 2. Special Characters Tests (`specialCharacters.test.ts`)

Comprehensive testing of quote handling, unicode, and edge cases.

**Coverage:**
- Single quotes (O'Hara, It's)
- Double quotes in values
- Backticks
- Mixed quote types
- Newlines and tabs
- Unicode and emoji
- NULL vs empty string
- JSON/JSONB values
- SQL injection prevention
- Backslashes and escape sequences

**Critical Test Cases:**
```typescript
// Single quote escaping
"O'Hara" → 'O''Hara'

// Mixed quotes
`O'Hara said "hello" with \`backticks\``

// NULL distinction
{ field1: null, field2: "" } → NULL, ''

// SQL injection prevention
"'; DROP TABLE users; --" → parameterized as $1
```

### 3. Data Editor Integration Tests (`dataEditor.integration.test.ts`)

Tests grid operations and CRUD functionality.

**Coverage:**
- CRUD with various data types (string, number, boolean, array, JSON)
- Composite primary keys
- Batch operations
- Reserved SQL keywords as column names
- Column names with spaces/special characters
- Schema/table names with quotes
- Empty and edge case values

**Example Scenarios:**
```typescript
// Composite primary key UPDATE
{
    type: 'update',
    data: { status: 'completed' },
    where: { user_id: 1, order_id: 100 }
}
// → WHERE "user_id" = $2 AND "order_id" = $3

// Reserved keywords
{ select: 'value1', where: 'value2', from: 'value3' }
// → "select", "where", "from"
```

### 4. Schema Designer Tests (`schemaDesigner.test.ts`)

Tests ALTER TABLE and CREATE TABLE generation.

**Coverage:**
- ADD COLUMN operations
- DROP COLUMN
- ALTER COLUMN (TYPE, SET/DROP NOT NULL, SET/DROP DEFAULT)
- RENAME COLUMN
- Constraint operations (PK, FK, UNIQUE, CHECK)
- DROP CONSTRAINT
- Identifier quoting and escaping
- CREATE TABLE statement generation
- Validation warnings

**Example:**
```typescript
test('ALTER COLUMN SET DEFAULT', () => {
    const sql = buildAlterTableSql('public', 'users', 
        "ALTER COLUMN status SET DEFAULT 'active'");
    expect(sql).toBe(
        'ALTER TABLE "public"."users" ALTER COLUMN status SET DEFAULT \'active\';'
    );
});
```

### 5. Table SQL Builder Tests (`tableSqlBuilder.test.ts`)

Tests basic SQL construction utilities.

**Coverage:**
- CREATE TABLE construction
- ALTER TABLE construction
- DROP TABLE with CASCADE
- Identifier quoting (escaping double quotes)
- Empty input validation

### 6. Integration Tests (VS Code Extension)

Tests extension lifecycle and command registration.

**Coverage:**
- Extension activation
- Command registration
- Tree view creation
- Webview panel management
- Message passing (extension ↔ webview)

## Test Data

### Special Characters Test Dataset

Use this dataset for manual testing:

```sql
CREATE TABLE test_special_chars (
    id SERIAL PRIMARY KEY,
    single_quote TEXT,
    double_quote TEXT,
    backtick TEXT,
    mixed TEXT,
    unicode TEXT,
    emoji TEXT,
    newlines TEXT,
    json_data JSONB
);

INSERT INTO test_special_chars VALUES
(1, 
 'O''Hara', 
 'He said "hello"', 
 'Run `npm install`', 
 'O''Brien said "hi" with `code`', 
 'José García Müller', 
 '🎉✨🚀💾',
 E'Line 1\nLine 2\nLine 3',
 '{"name": "O''Brien", "emoji": "🎉"}'::jsonb);

INSERT INTO test_special_chars VALUES
(2,
 'It''s a test',
 'String with "nested" quotes',
 'Backtick `test` here',
 'All ''quotes'' "types" `together`',
 'Ñoño Ελληνικά 中文',
 '😀😃😄😁😆',
 E'Tab\tSeparated\tValues',
 '{"key": "value", "nested": {"arr": [1, 2, 3]}}'::jsonb);
```

### Edge Cases Dataset

```sql
CREATE TABLE test_edge_cases (
    id SERIAL PRIMARY KEY,
    "select" TEXT,           -- Reserved keyword
    "weird""name" TEXT,      -- Double quote in name
    "with space" TEXT,       -- Space in name
    empty_string TEXT,
    null_value TEXT,
    zero_number INTEGER,
    false_bool BOOLEAN,
    array_field TEXT[]
);

INSERT INTO test_edge_cases VALUES
(1, 'keyword', 'quoted', 'spaced', '', NULL, 0, false, ARRAY['a', 'b', 'c']);
```

## Writing New Tests

### Backend Test Template

```typescript
import { SqlGenerator } from '../src/sqlGenerator';

describe('Feature Name', () => {
    describe('Sub-feature', () => {
        test('should do something specific', () => {
            // Arrange
            const input = { /* test data */ };
            
            // Act
            const result = SqlGenerator.generateSql('schema', 'table', input);
            
            // Assert
            expect(result.query).toContain('expected SQL');
            expect(result.values).toEqual(['expected', 'values']);
        });
    });
});
```

### Best Practices

1. **Descriptive Names**: Test names should clearly describe what is being tested
   ```typescript
   // Good
   test('handles single quotes in UPDATE WHERE clause')
   
   // Bad
   test('quotes work')
   ```

2. **Arrange-Act-Assert**: Structure tests clearly
   ```typescript
   // Arrange - set up test data
   const change = { type: 'insert', data: { name: "O'Hara" } };
   
   // Act - execute the code
   const result = SqlGenerator.generateSql('public', 'users', change);
   
   // Assert - verify results
   expect(result.values[0]).toBe("O'Hara");
   ```

3. **Test One Thing**: Each test should verify one specific behavior

4. **Edge Cases**: Include tests for empty strings, NULL, special characters

5. **Error Cases**: Test error handling and validation

## Integration Test Setup

### Prerequisites

To run integration tests, install additional dependencies:

```bash
npm install --save-dev @vscode/test-electron @types/mocha mocha glob
```

### Configuration

Update `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:integration": "node ./out/test/integration/runTest.js",
    "pretest:integration": "npm run compile"
  },
  "devDependencies": {
    "@vscode/test-electron": "^2.3.0",
    "@types/mocha": "^10.0.0",
    "mocha": "^10.2.0",
    "glob": "^10.0.0"
  }
}
```

### Running Integration Tests

```bash
# Compile TypeScript
npm run compile

# Run integration tests
npm run test:integration
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run backend tests
      run: npm test -- --coverage
    
    - name: Build webview
      run: npm run build:webview
    
    - name: Compile extension
      run: npm run compile
    
    - name: Run integration tests
      run: npm run test:integration
      if: runner.os == 'Linux'  # Run integration tests on Linux only
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

## Coverage Goals

### Current Coverage
- SQL Generation: ~85%
- Special Characters: ~90%
- Table Builders: ~80%

### Target Coverage
- Backend logic: >90%
- Critical paths: 100%
- Edge cases: >80%

### 7. CSV Exporter Tests (`csvExporter.test.ts`)

Tests CSV export and import functionality with proper RFC 4180 compliance.

**Coverage:**
- Field escaping (quotes, commas, newlines)
- Header inclusion/exclusion
- Round-trip consistency (export → parse → export)
- Special character handling
- NULL and empty value handling
- Custom delimiters
- Quote and escape character customization

**Key Test Cases:**
```typescript
// Simple CSV generation
generateCsv(['name', 'age'], [['Alice', 30]], { includeHeaders: true })
// Expected: "name,age\nAlice,30"

// Quoted field escaping
escapeField('Smith, John')  
// Expected: '"Smith, John"'

// Quote escaping
escapeField('Product "B"')
// Expected: '"Product ""B"""'

// Round-trip consistency
const original = [['Test', 'Value,with,commas']];
const csv = generateCsv(columns, original);
const parsed = parseCsv(csv);
// parsed[0] should equal ['Test', 'Value,with,commas']
```

### 8. CSV Import Tests (`csvImport.test.ts`)

Tests CSV import functionality including type conversion and column mapping.

**Coverage:**
- Type conversion (boolean, integer, float, date, timestamp, JSON, UUID)
- NULL/empty value handling
- Column mapping validation
- Row type conversion
- Large file support
- Special character handling
- Round-trip import/export consistency
- Edge cases (inconsistent columns, very long values)

**Key Test Cases:**
```typescript
// Boolean conversion
convertValue('true', 'boolean')      // true
convertValue('1', 'boolean')         // true
convertValue('yes', 'boolean')       // true

// Numeric conversion
convertValue('42', 'integer')        // 42
convertValue('3.14', 'numeric')      // 3.14

// Date/Time conversion
convertValue('2024-01-15', 'date')
// '2024-01-15'

// JSON conversion
convertValue('{"key": "value"}', 'json')
// { key: 'value' }

// Column mapping validation
const mapping = { 0: 'id', 1: 'name' };
const tableColumns = ['id', 'name', 'email'];
const errors = validateMapping(mapping, tableColumns);
// errors should be empty

// Type conversion for insert
const row = ['42', 'true', 'Alice'];
const columnTypes = { 'id': 'integer', 'active': 'boolean', 'name': 'text' };
const typed = convertRowTypes([row], columnTypes);
// typed[0] should equal [42, true, 'Alice']

// NULL handling
convertValue('', 'text')             // null
convertValue('   ', 'integer')       // null
```

### 9. Query History Tests (`queryHistory.test.ts`)

Tests query history storage, retrieval, and management.

**Coverage:**
- Query recording and persistence
- History limit enforcement
- Search functionality (query text, connection name)
- Filtering by connection
- History clearing (all or per-connection)
- Entry deletion
- Persistence across sessions
- Timestamp and metadata tracking

**Key Test Cases:**
```typescript
// Recording queries
await history.addQuery('SELECT * FROM users', 'conn-1', 'dev-db');
const entries = history.getHistory();
// entries should have length 1

// History limit
for (let i = 0; i < 10; i++) {
    await history.addQuery(`Query ${i}`, 'conn-1', 'dev-db');
}
const limited = new QueryHistory(context, 5);
// Should only keep 5 most recent

// Search functionality
history.search('users');  // Finds all queries mentioning 'users'
history.getByConnection('conn-1');  // Finds all queries from connection
```

## Troubleshooting

### Common Issues

**Issue: Jest tests fail with TypeScript errors**
```bash
# Solution: Ensure ts-jest is installed
npm install --save-dev ts-jest @types/jest
```

**Issue: Cannot find module errors**
```bash
# Solution: Check tsconfig.json includes test directory
{
  "include": ["src/**/*", "test/**/*"]
}
```

**Issue: Integration tests hang**
```bash
# Solution: Increase timeout in test suite
suite('My Tests', function() {
    this.timeout(30000);  // 30 seconds
    // tests...
});
```

**Issue: Database connection fails in tests**
```bash
# Solution: Use mock connections or test database
# Set environment variables:
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432
export TEST_DB_NAME=postgresheets_test
```

## Manual Testing Checklist

See `docs/phase6-testing-plan.md` for comprehensive manual testing checklist covering:

- Platform testing (Windows, macOS, Linux)
- Theme testing (Light, Dark, High Contrast)
- Accessibility testing
- Performance testing
- Error scenarios
- Data integrity verification

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Mocha Documentation](https://mochajs.org/)
- [PostgreSQL Test Database Setup](https://www.postgresql.org/docs/current/regress.html)

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure tests pass locally
3. Run full test suite before committing
4. Update this documentation if adding new test categories
5. Maintain >80% coverage for new code

## Questions?

For questions about testing:
- Check existing test files for examples
- Review `docs/phase6-testing-plan.md`
- Open an issue on GitHub
