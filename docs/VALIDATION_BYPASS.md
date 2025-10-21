# Validation Bypass Feature

## Overview

The validation bypass feature allows users to skip client-side and server-side validation checks and let the PostgreSQL database enforce constraints directly. This is useful when:

- The client-side validators are too strict for legitimate edge cases
- You're importing data with unusual but valid formats
- You trust the database constraints and want to skip intermediate checks
- You need to test how the database handles certain values

## How It Works

### Client-Side Validation

By default, the data editor performs basic validation on cell values:
- **Integers**: Must match `/^-?\d+$/`
- **Floats/Numerics**: Must match `/^-?\d+(?:\.\d+)?$/`
- **Enums**: Must be one of the allowed labels
- **Arrays of enums**: Each element must be a valid enum label

When validation errors exist, the UI:
- Shows a ⚠ icon in the affected cell
- Adds `aria-invalid` attribute for accessibility
- Disables the Execute and Preview buttons
- Displays an error message

### Server-Side Validation

Before executing changes, the extension validates data against the database schema:
- Queries `pg_attribute` and `pg_type` to understand column types
- Queries `pg_enum` to fetch valid enum labels
- Validates:
  - Integer columns (must be numeric without decimals)
  - Numeric/float columns (must be valid numbers)
  - Boolean columns (must parse to true/false)
  - Enum columns (must match one of the defined labels)
  - Array-of-enum columns (each element must be a valid label)
  - Date/timestamp columns (basic ISO-like format check)
  - UUID columns (basic format check via regex)

## Using the Bypass

### Enable Bypass

1. Open the data editor for any table
2. In the toolbar, find the **"Bypass validation"** checkbox
3. Check the box to enable bypass mode

### Behavior When Enabled

**Client-side:**
- Validation still runs and shows ⚠ icons for reference
- Execute and Preview buttons are **enabled** even with validation errors
- Changes can be submitted to the server

**Server-side:**
- The server **skips** the validation step entirely
- SQL is generated and executed directly
- The database enforces constraints (if the data violates constraints, PostgreSQL will return an error)

### Error Handling

When bypass is enabled and you execute invalid data:
- The extension attempts to execute the SQL
- PostgreSQL rejects invalid data with a database error
- The error is shown in the UI with the exact database message
- No data is modified (transactions are rolled back on error in batch mode)

## Safety Considerations

### When to Use Bypass

✅ **Safe to use when:**
- You understand the database constraints and trust them
- You're inserting data that client validation rejects but the database will accept
- You're testing edge cases or database behavior
- You have a backup and can recover if needed

### When NOT to Use Bypass

⚠️ **Avoid bypass when:**
- You're unsure of the data format requirements
- You don't have database constraints defined (e.g., missing NOT NULL, CHECK constraints)
- You're batch-inserting large amounts of data without reviewing
- You're not familiar with PostgreSQL error messages

### Best Practices

1. **Review SQL Preview**: Always preview the SQL before executing with bypass enabled
2. **Use Batch Mode**: Keep batch mode enabled so changes roll back on error
3. **Test First**: Try a small change before bulk operations
4. **Have Backups**: Ensure you can restore data if needed
5. **Understand Constraints**: Know which database constraints exist on the table

## Examples

### Example 1: Strict Client Validation

**Scenario**: You want to insert a very large integer that the client regex doesn't handle correctly.

```
Value: 999999999999999999999 (21 digits)
Client validation: ❌ May reject as invalid format
Database: ✅ Accepts if column is NUMERIC or BIGINT
```

**Solution**: Enable bypass, preview SQL, execute. The database will accept or reject based on column type.

### Example 2: Custom Date Format

**Scenario**: You have a date string that doesn't match the strict ISO format the client expects.

```
Value: "2025-10-21T10:30:00.123456+00:00"
Client validation: ❌ May reject complex timestamp
Database: ✅ PostgreSQL parses it correctly
```

**Solution**: Enable bypass to let PostgreSQL's date parser handle it.

### Example 3: Testing Enum Constraints

**Scenario**: You want to test how the database handles an invalid enum value.

```
Value: "invalid_status"
Client validation: ❌ Rejects (not in enum labels)
Database: ❌ Will reject with ENUM constraint error
```

**Solution**: Enable bypass, execute, observe the database error message.

## Technical Details

### Message Protocol

When bypass is enabled, the webview includes a `bypassValidation` flag in messages:

```typescript
// Preview SQL
{
  command: 'previewSql',
  payload: {
    changes: [...],
    primaryKey: [...],
    bypassValidation: true
  }
}

// Execute Changes
{
  command: 'executeChanges',
  payload: {
    changes: [...],
    batchMode: true,
    bypassValidation: true
  }
}
```

### Server-Side Logic

```typescript
// In dataEditor.ts executeChanges()
if (!bypassValidation) {
  const validationErrors = await validateChangesAgainstSchema(
    client,
    schemaName,
    tableName,
    changes
  );
  if (validationErrors.length > 0) {
    // Return error, prevent execution
  }
}
// Proceed with SQL execution
```

### Caching

The extension caches schema metadata per panel to improve performance:
- Cache key: `connectionId:schema.table`
- Cached data: column info, type OIDs, enum labels
- Cache is cleared when the panel is closed

## Testing

The feature includes comprehensive tests:

### Client-Side Tests (`test/webviewBypass.spec.ts`)
- ✅ Buttons disabled when errors exist and bypass is off
- ✅ Buttons enabled when bypass is on despite errors
- ✅ `bypassValidation` flag included in messages

### Server-Side Tests (`test/dataEditor.bypass.test.ts`)
- ✅ Validator skipped when `bypassValidation` is true
- ✅ Validator called when `bypassValidation` is false

## FAQ

**Q: Will bypass disable ALL validation?**  
A: Yes, both client-side heuristics and server-side pre-checks are skipped. Only the database enforces constraints.

**Q: Can I use bypass for bulk operations?**  
A: Yes, but preview the SQL first and ensure batch mode is enabled for automatic rollback on errors.

**Q: Does bypass affect other users?**  
A: No, it's a per-session UI setting that only affects your current data editor panel.

**Q: What if I forget bypass is enabled?**  
A: The checkbox state is visible in the toolbar. Consider disabling it after use to avoid accidental unvalidated changes.

**Q: Will bypass improve performance?**  
A: Slightly, by skipping validation queries. The main performance factor is still database execution time.

## Related Documentation

- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) - Lists resolved validation issues
- [TESTING.md](./TESTING.md) - Test coverage including bypass tests
- [MANUAL_TESTING_CHECKLIST.md](./MANUAL_TESTING_CHECKLIST.md) - Manual test scenarios
