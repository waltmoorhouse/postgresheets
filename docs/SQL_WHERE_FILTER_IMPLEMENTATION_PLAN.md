# SQL WHERE Clause Filtering - Implementation Plan

## Overview
Add the ability for users to apply custom SQL WHERE clauses to filter table data in the Data Editor, and enable opening Query History entries directly in the Data Editor with the WHERE clause prefilled.

## Feature 1: Custom WHERE Clause in Data Editor

### Architecture Changes

#### 1. State Management (dataEditor.ts)
**What**: Extend `PanelState` interface to store custom WHERE clause  
**How**: Add new `customWhereClause` property to `PanelState` interface and update default state creation  
**Integration**: Works alongside existing `filters` and `searchTerm` state properties  

#### 2. Message Protocol (types.ts)
**What**: Add new message types for WHERE clause communication  
**How**: Extend `WebviewToExtensionMessage` union type with new command for applying WHERE clause  
**Integration**: Similar pattern to existing `applyFilters` and `search` commands  

#### 3. Query Building (dataEditor.ts - buildWhereClause)
**What**: Modify query construction to incorporate custom WHERE clause  
**How**: Update `buildWhereClause` method to append user-provided WHERE clause to generated filters  
**Integration**: Combine column filters, search term, and custom WHERE using AND logic  
**Validation**: Parse and validate WHERE clause syntax before execution to prevent SQL injection  

#### 4. Message Handler (dataEditor.ts - handleMessage)
**What**: Add handler for new WHERE clause command  
**How**: Create new case in switch statement to process WHERE clause updates  
**Integration**: Reset page to 0 and reload data when WHERE clause changes, similar to filter/search behavior  

### UI Components (Webview)

#### 5. WHERE Clause Input Field
**What**: Add text input or textarea for entering WHERE clause  
**How**: Place input field in filter/search toolbar area of data editor webview  
**Accessibility**: Ensure keyboard navigation, ARIA labels, and screen reader support  
**Integration**: Position near existing search/filter controls  

#### 6. Convert Filters to WHERE Button
**What**: Add button that converts current column filter values into a WHERE clause  
**How**: Generate SQL conditions from active filters (e.g., `name = 'Admin'`), append to or update WHERE clause input, then clear the column filters  
**UX Flow**: User sets column filters → clicks "Convert to WHERE" → filters become WHERE clause → column filters cleared  
**Benefits**: Allows users to test filters visually, then convert to SQL for more complex queries  
**Integration**: Works with existing filter state, generates SQL-safe quoted strings  

#### 7. Clear/Reset Button
**What**: Add button to clear custom WHERE clause  
**How**: Place button adjacent to WHERE input field  
**Accessibility**: Proper button labeling and keyboard access  

#### 8. Preview/Validation Feedback
**What**: Show SQL preview with WHERE clause applied  
**How**: Display constructed SQL in preview modal when user clicks preview button  
**Integration**: Extends existing SQL preview functionality  

#### 9. Error Display
**What**: Show validation errors for invalid WHERE syntax  
**How**: Display error messages near WHERE input field  
**UX**: Clear, actionable error messages guiding users to fix syntax  

### Data Flow

#### 10. Filter to WHERE Conversion Flow
**Flow**: User sets column filters → clicks "Convert to WHERE" → webview generates SQL conditions → sends to extension → extension updates PanelState WHERE clause → clears column filters → reloads data  
**SQL Generation**: Convert filter values to proper SQL syntax with quoted strings and proper escaping  
**Combination**: If WHERE clause already exists, append with AND; if empty, create new  
#### 12. Extension → Database
**Flow**: Extension receives WHERE clause → combines with existing filters → builds parameterized query → executes via ConnectionManager  
**Safety**: Use parameterized queries or escape special characters to prevent injection  

#### 13. Results → Webview
#### 10. Extension → Database
**Flow**: Extension receives WHERE clause → combines with existing filters → builds parameterized query → executes via ConnectionManager  
**Safety**: Use parameterized queries or escape special characters to prevent injection  

#### 11. Results → Webview
**Flow**: Query results returned → processed and normalized → sent to webview → displayed in grid  
**Consistency**: Pagination, sorting, and column filtering continue to work normally  

### Edge Cases & Safety

#### 14. WHERE Clause Validation
**Scenarios**:
- Empty/whitespace-only WHERE clause (treat as no filter)
- Invalid SQL syntax (show error, don't execute)
- Malicious SQL attempts (parameterize or sanitize)
- WHERE clauses referencing non-existent columns (validate against schema)

#### 15. Interaction with Existing Filters
**Behavior**: Custom WHERE AND column filters AND search term all combine with AND logic  
**UX**: Make it clear to users that all filters are additive  

#### 16. Filter to WHERE Conversion Edge Cases
**Empty Filters**: Button disabled or hidden when no filters are active  
**Special Characters**: Properly escape quotes, backslashes, and special characters in filter values  
**Multiple Filters**: Combine multiple column filters with AND logic  
**Existing WHERE Clause**: Append new conditions to existing WHERE clause with AND  
**SQL Injection**: Ensure generated SQL uses proper quoting to prevent injection  

#### 17. State Persistence
**Cons8deration**: Should WHERE clause persist when panel is hidden/restored?  
**Decision**: Yes, store in PanelState like other filter state  

## Feature 2: Open Query History in Data Editor

### Architecture Changes
9. New Command Registration (extension.ts)
**What**: Register new command to open table with WHERE clause  
**How**: Add command `postgres-editor.openTableWithWhere` that accepts connection, schema, table, and WHERE parameters  
**Integration**: DataEditor's `openTable` method needs to accept optional WHERE clause parameter  

#### 20. DataEditor.openTable Enhancement (dataEditor.ts)
**What**: Modify `openTable` method to accept optional WHERE clause  
**How**: Add optional parameter for WHERE clause and set in PanelState during initialization  
**Integration**: When opening existing panel, update WHERE clause if provided  

#### 21ration**: DataEditor's `openTable` method needs to accept optional WHERE clause parameter  

#### 17. DataEditor.openTable Enhancement (dataEditor.ts)
**What**: Modify `openTable` method to accept optional WHERE clause  
**How**: Add optional parameter for WHERE clause and set in PanelState during initialization  
**Integration**: When opening existing panel, update WHERE clause if provided  

#### 18. Query History View Enhancements (queryHistoryView.ts)
**What**: Add message handler for "Open in Editor" action  
**How**: Add new message type for opening in editor, parse query to extract details, invoke command  
**Integration**: Sends parsed connection, schema, table, and WHERE to extension command  

### UI Components (Query History View)

#### 22. "Open in Editor" Button
**What**: Add button next to Copy/Delete for eligible queries  
**How**: Show button only for simple SELECT queries that can be mapped to a table  
**Accessibility**: Proper button labeling and keyboard navigation  
**Visual**: Use appropriate icon (e.g., table icon or "open" icon)  

#### 23. Query Eligibility Indicator
**What**: Visual indication of which queries can be opened in editor  
**How**: Different styling or icon for openable queries  
**UX**: Users understand at a glance which queries support this feature  

### Data Flow

#### 24. User Interaction → Parsing
**Flow**: User clicks "Open in Editor" → extract query SQL → parse to identify table and WHERE → validate format  

#### 25. Command Invocation
**Flow**: Parsed query info → invoke VS Code command → pass connection ID, schema, table, WHERE clause → DataEditor opens/updates panel  

#### 26. Panel Initialization
**Flow**: DataEditor receives request → creates/reveals panel → sets WHERE clause in PanelState → loads data with filter applied  

### Edge Cases & Parsing

#### 27. Query Compatibility Detection
**Supported**: `SELECT * FROM schema.table WHERE condition`  
**Supported**: `SELECT col1, col2 FROM table WHERE condition`  
**Not Supported**: Queries with JOINs, subqueries, UNION, CTEs, etc.  
**Handling**: Only show "Open in Editor" for supported query patterns  

#### 28. Schema/Table Extraction
**Parsing**: Handle both qualified (schema.table) and unqualified (table) names  
**Resolution**: Use connection's default schema if not specified in query  

#### 29. WHERE Clause Extraction
**Parsing**: Extract everything after WHERE keyword up to ORDER BY, LIMIT, or end  
**Cleaning**: Remove ORDER BY, LIMIT, OFFSET clauses if present  

#### 30. Connection Context
**Requirement**: Query History entry contains connection ID and database name  
**Validation**: Ensure connection still exists before attempting to open  
**UX**: Show error if connection has been deleted  

## Testing Requirements

### 31. Manual Testing
- Test WHERE clause with various valid SQL conditions
- Test WHERE clause with column filters and search simultaneously
- Test invalid WHERE syntax shows appropriate errors
- Test "Open in Editor" with various SELECT query formats
- Test "Open in Editor" with deleted connections
- Test pagination/sorting works with custom WHERE clause
- Test "Convert to WHERE" button with single and multiple filters
- Test "Convert to WHERE" with special characters in filter values
- Test "Convert to WHERE" appending to existing WHERE clause

### 32. Automated Tests
- Unit tests for query parsing utility
- Unit tests for WHERE clause validation
- Integration tests for combined filters + WHERE clause
- Tests for SQL injection prevention
- Tests for Query History parsing edge cases
3. User Documentation
- Update README with WHERE clause feature description
- Add examples of valid WHERE clause syntax
- Document "Convert to WHERE" button workflow
- Document Query History "Open in Editor" feature
- Update KEYBOARD_SHORTCUTS if new shortcuts added

### 34ment Query History "Open in Editor" feature
- Update KEYBOARD_SHORTCUTS if new shortcuts added

### 31. Technical Documentation
- Update TESTING.md with new test requirements
- Update KNOWN_ISSUES.md if limitations discovered
- Update MANUAL_TESTING_CHECKLIST with WHERE clause scenarios
- Update CHANGELOG.md with feature additions

## Implementation Sequence

### Phase 1: Core WHERE Clause Support
1. Update PanelState interface
2. Add message types
3. Modify buildWhereClause method
4. Add message handler
5. Basic webview input field

### Phase 2: WHERE Clause UI
6. Complete webview UI with input, buttons, error display
7. Add validation feedback
8. Integrate with existing filters

### Phase 3: Query History Integration
9. Implement query parsing utility
10. Add openTableWithWhere command
11. Enhance DataEditor.openTable
12. Update Query History view with button

### Phase 4: Polish & Testing
13. Add comprehensive validation
14. Manual and automated testing
15. Documentation updates
16. Accessibility verification

## Security Considerations

### SQL Injection Prevention
- Use parameterized queries wherever possible
- Validate WHERE clause syntax before execution
- Escape special characters if dynamic SQL required
- Limit which SQL keywords are allowed in WHERE clause
- Consider using a SQL parser library for robust validation

### Permission Validation
- Respect existing database user permissions
- WHERE clause should not allow escalation of privileges
- Validate that user has SELECT permission on referenced columns

## Performance Considerations

### Query Optimization
- WHERE clause should not significantly degrade performance
- Consider adding query timeout for complex WHERE clauses
- Maintain pagination efficiency with custom WHERE

### State Management
- WHERE clause state stored efficiently in memory
- Cache validation results to avoid repeated parsing
- Clear cache when panel is closed

##"Convert to WHERE" button generates correct SQL from filters  
✅ "Convert to WHERE" properly clears column filters after conversion  
✅ Pagination, sorting, and editing still work with WHERE clause  
✅ Invalid WHERE syntax shows clear error messages  
✅ Special characters in filter values are properly escaped when converted
✅ Users can enter custom WHERE clauses in Data Editor  
✅ WHERE clause combines correctly with existing filters  
✅ Pagination, sorting, and editing still work with WHERE clause  
✅ Invalid WHERE syntax shows clear error messages  
✅ Query History shows "Open in Editor" for simple SELECT queries  
✅ Clicking "Open in Editor" opens table with WHERE clause applied  
✅ All existing functionality remains unaffected  
✅ Comprehensive test coverage for new features  
✅ Documentation updated with examples and limitations  
