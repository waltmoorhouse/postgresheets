# Test Directory

This directory contains the comprehensive test suite for PostgreSheets, covering backend logic, SQL generation, special character handling, and integration scenarios.

## Quick Start

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --verbose

# Run specific test file
npm test -- specialCharacters.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Test Files

### Backend Unit Tests (Jest)

#### `sqlGenerator.test.ts`
Basic SQL generation tests for INSERT, UPDATE, DELETE operations.

**Coverage:**
- Parameterized query generation
- Basic CRUD operations
- Value handling

#### `specialCharacters.test.ts` ⭐
Comprehensive special character handling tests (35+ tests).

**Coverage:**
- Single quotes: `O'Hara`, `It's`
- Double quotes: `"hello"`
- Backticks: `` `code` ``
- Mixed quotes: `O'Brien said "hi" with `code``
- Unicode: `José García`, `Müller`
- Emoji: `🎉✨🚀😀`
- Newlines and tabs
- NULL vs empty string
- JSON/JSONB values
- SQL injection prevention
- Backslashes and escape sequences

#### `dataEditor.integration.test.ts` ⭐
Grid operations and CRUD integration tests (25+ tests).

**Coverage:**
- INSERT with various data types
- UPDATE with composite primary keys
- DELETE with multiple WHERE conditions
- Batch operations
- Reserved SQL keywords as column names
- Column names with spaces/special characters
- Schema/table names with quotes
- Boolean, numeric, array handling
- Empty and edge case values

#### `schemaDesigner.test.ts` ⭐
ALTER TABLE and CREATE TABLE tests (30+ tests).

**Coverage:**
- ADD COLUMN operations
- DROP COLUMN
- ALTER COLUMN (TYPE, SET/DROP NOT NULL, SET/DROP DEFAULT)
- RENAME COLUMN
- ADD/DROP constraints (PK, FK, UNIQUE, CHECK)
- Identifier quoting and escaping
- CREATE TABLE statement generation
- Validation warnings

#### `tableSqlBuilder.test.ts`
Table SQL builder utility tests.

**Coverage:**
- CREATE TABLE construction
- ALTER TABLE construction
- DROP TABLE with CASCADE
- Identifier quoting

#### `phase6.additional.test.ts`
Additional validation and edge case tests.

**Coverage:**
- formatSqlWithValues with special characters
- buildCreateTableStatements warnings

#### `webviewUpdate.test.ts`
Webview utility function tests.

**Coverage:**
- HTML generation with proper escaping
- NULL rendering

### Integration Tests (Future)

#### `integration/`
VS Code extension integration tests (infrastructure ready, requires setup).

**Files:**
- `runTest.ts` - Test runner setup
- `suite/index.ts` - Mocha configuration
- `suite/connectionManager.test.ts` - Connection lifecycle tests
- `suite/dataEditor.test.ts` - Webview integration tests

**Setup Required:**
```bash
npm install --save-dev @vscode/test-electron @types/mocha mocha glob
npm run test:integration
```

## Test Statistics

```
Test Suites: 7 passed, 7 total
Tests:       74 passed, 74 total
Time:        ~5 seconds
```

**By Category:**
- SQL Generation: 8 tests ✅
- Special Characters: 35 tests ✅
- Data Editor Integration: 25 tests ✅
- Schema Designer: 30 tests ✅
- Table SQL Builder: 6 tests ✅
- Additional Tests: 2 tests ✅
- Webview Utils: 1 test ✅

## Configuration

### Jest Configuration (package.json)
```json
{
  "jest": {
    "transform": {
      "^.+\\.tsx?$": "ts-jest"
    },
    "testEnvironment": "node",
    "testPathIgnorePatterns": [
      "/node_modules/",
      "/out/",
      "/test/integration/"
    ]
  }
}
```

## Writing Tests

### Template
```typescript
import { SqlGenerator } from '../src/sqlGenerator';

describe('Feature Name', () => {
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
```

### Best Practices
1. Use descriptive test names
2. Follow Arrange-Act-Assert pattern
3. Test one thing per test
4. Include edge cases
5. Test error scenarios

## Test Data

### Special Characters Dataset
See `docs/TESTING.md` for SQL scripts to create test databases with:
- Various quote types
- Unicode and emoji
- Newlines and tabs
- JSON/JSONB data
- Reserved keywords
- Composite keys

## Documentation

For comprehensive testing information, see:
- **`docs/TESTING.md`** - Complete testing guide
- **`docs/phase6-testing-plan.md`** - Detailed test plan
- **`docs/MANUAL_TESTING_CHECKLIST.md`** - Manual QA checklist
- **`docs/KNOWN_ISSUES.md`** - Known issues and limitations
- **`docs/phase6-completion-summary.md`** - Phase 6 summary

## CI/CD

Example GitHub Actions workflow in `docs/TESTING.md`.

## Questions?

- Review existing test files for examples
- Check `docs/TESTING.md` for detailed guide
- Open an issue on GitHub
