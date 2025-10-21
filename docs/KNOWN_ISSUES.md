# Known Issues and Limitations

## Current Known Issues

### Colored Circles Not Good For Colorblind Users
**Issue:** Connection status in the tree used small colored circle indicators (🟢/🔴) which relied on color alone to convey state and were difficult for colorblind users to distinguish.

**Fix:** The tree view now uses a shape glyph plus short textual label for connection statuses (e.g. "✔ Connected", "✖ Disconnected", "⏳ Connecting"). The icon itself was kept as the standard database glyph and the status glyph/text is included in the item's description so it remains visible regardless of theme or color perception.

**Impact:**
- Colorblind users see a clear glyph (check/X/gear/hourglass) and short text which does not rely solely on color.
- Tooltips include an explicit plain-text status label for screen readers and clarity.

**Priority:** High (Accessibility improvement)

**Status:** Fixed

### Limited Array Type Support
**Issue (Resolved):** PostgreSQL array types (e.g., `TEXT[]`, `INTEGER[]`) used to be displayed as raw JSON/text in the grid which made editing awkward and indistinguishable from other string values.

**Fix:** The data editor now normalizes PostgreSQL array values into native JavaScript arrays before sending payloads to the webview. Arrays are presented in the grid using a compact JSON-like preview and can be edited in the modal JSON editor (open the cell's JSON editor to view/modify array contents). The extension also attempts to parse common driver-returned representations (JSON-like strings and PostgreSQL array literals).

**Impact (now):**
- Arrays are shown as JSON arrays (e.g. ["a","b"]) in the grid preview.
- Arrays can be edited via the JSON editor modal; changes are converted back into native arrays before execution.
- Parsing is best-effort for textual representations; very exotic array encodings may still require manual SQL.

**Workaround (deprecated):** Manual SQL is no longer required for many common array edits, but remains an option for complex/edge-case array manipulations.

**Priority:** Medium

**Status:** Fixed (see notes/caveats)

### Custom Enum Type Display
**Issue (Resolved):** Custom ENUM types were displayed as plain strings with no indication of the valid labels.

**Fix:** The extension now detects enum-typed columns and retrieves their allowed labels from PostgreSQL (`pg_type` / `pg_enum`). Enum metadata is sent to the webview and the data grid renders a native select control for enum columns, preventing invalid inputs and improving discoverability.

**Impact (now):**
- Enum columns display a dropdown with valid labels when edited inline.
- For array-of-enum columns the editor provides the enum's labels in the modal editor to make element editing easier.
- Server-side enforcement still applies; invalid enum values will be rejected by PostgreSQL at execution time.

**Workaround (deprecated):** Manual lookup is no longer necessary to discover valid values for standard enum types.

**Priority:** Low → Medium

**Status:** Fixed

### Pagination Performance with Large Offsets

**Issue:** Pagination using `OFFSET` becomes slower with very large offset values (10,000+ rows).

**Impact:** 
- Jumping to page 100+ in a million-row table is slow
- Performance degrades linearly with page number

**Workaround:** Use filtering or search to reduce result set.

**Priority:** Low

**Status:** Known PostgreSQL limitation - would require cursor-based pagination

### No Cross-Database Queries

**Issue:** Cannot query or compare data across multiple databases in the same connection.

**Impact:** 
- Must manually copy data between databases
- Cannot join tables from different databases

**Workaround:** Use multiple connections and manual comparison.

**Priority:** Low

**Status:** PostgreSQL architectural limitation

## Backlog Items

### High Priority

1. **CSV Import/Export**
   - Status: Not implemented
   - Impact: Users must use external tools for bulk data operations
   - Effort: Medium (2-3 days)

2. **Query History**
   - Status: Not implemented
   - Impact: Cannot review previous queries or changes
   - Effort: Small (1 day)

3. **Connection Pooling Configuration**
   - Status: Basic pooling exists but not configurable
   - Impact: Cannot tune for specific workloads
   - Effort: Small (1 day)

4. **Infinite Scroll Option**
   - Status: Only pagination available
   - Impact: Extra clicks for large datasets
   - Effort: Medium (2-3 days)

### Medium Priority

5. **ER Diagram View**
   - Status: Not implemented
   - Impact: Must use external tools to visualize relationships
   - Effort: Large (1-2 weeks)

6. **Visual Query Builder**
   - Status: Not implemented
   - Impact: Complex queries require SQL knowledge
   - Effort: Large (2-3 weeks)

7. **Index Management UI**
   - Status: Not implemented
   - Impact: Must use manual SQL for index operations
   - Effort: Medium (3-5 days)

8. **Database Backup/Restore**
   - Status: Not implemented
   - Impact: Must use `pg_dump`/`pg_restore` manually
   - Effort: Large (1-2 weeks)

9. **Permission/Role Management**
   - Status: Not implemented
   - Impact: Must use SQL for user/role management
   - Effort: Large (1-2 weeks)

10. **Table Statistics View**
    - Status: Not implemented
    - Impact: No visibility into table size, index usage, etc.
    - Effort: Small (2-3 days)

11. **Stored Procedure Editor**
    - Status: Not implemented
    - Impact: Must use external editor for procedures/functions
    - Effort: Medium (1 week)

### Low Priority

12. **Custom Theme Support**
    - Status: Uses VS Code themes only
    - Impact: Limited customization
    - Effort: Medium (3-5 days)

13. **Saved Queries/Snippets**
    - Status: Not implemented
    - Impact: Must re-type common queries
    - Effort: Small (2-3 days)

14. **Data Visualization Charts**
    - Status: Not implemented
    - Impact: Must export to create visualizations
    - Effort: Large (2-3 weeks)

15. **Schema Comparison Tool**
    - Status: Not implemented
    - Impact: Must manually compare schemas
    - Effort: Large (1-2 weeks)

16. **Migration Generator**
    - Status: Not implemented
    - Impact: Must write migrations manually
    - Effort: Large (2-3 weeks)

17. **Multi-Connection Comparison**
    - Status: Not implemented
    - Impact: Cannot compare across connections
    - Effort: Large (1-2 weeks)

## Technical Debt

### Code Quality

1. **Improve Type Safety in Message Passing**
   - Current: Some `any` types in webview messages
   - Goal: Full type safety with discriminated unions
   - Effort: Medium

2. **Error Boundaries in Svelte**
   - Current: JavaScript errors can crash webview
   - Goal: Graceful error handling with recovery
   - Effort: Small

3. **Refactor Connection Management**
   - Current: Map-based caching, no pooling config
   - Goal: Proper connection pool with health checks
   - Effort: Medium

4. **Reduce Bundle Size**
   - Current: ~500KB+ for webview bundles
   - Goal: Code splitting, lazy loading
   - Effort: Medium

### Testing

5. **Increase Test Coverage**
   - Current: ~85% backend, 0% frontend
   - Goal: >90% backend, >70% frontend
   - Effort: Large

6. **Add E2E Test Suite**
   - Current: Only unit and basic integration tests
   - Goal: Full E2E scenarios with real database
   - Effort: Large

7. **Performance Benchmarks**
   - Current: No automated performance testing
   - Goal: Benchmark suite for regressions
   - Effort: Medium

### Documentation

8. **API Documentation**
   - Current: Inline comments only
   - Goal: Generated API docs
   - Effort: Small

9. **Video Tutorials**
   - Current: Text documentation only
   - Goal: Video walkthroughs for common tasks
   - Effort: Medium

10. **Architecture Diagrams**
    - Current: Text descriptions in copilot-instructions.md
    - Goal: Visual architecture diagrams
    - Effort: Small

## Reporting Issues

If you encounter a bug or limitation not listed here:

1. Check [GitHub Issues](https://github.com/waltmoorhouse/postgresheets/issues)
2. If not reported, create a new issue with:
   - VS Code version
   - Extension version
   - PostgreSQL version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

## Version History

### Version 1.0.27 (Current)
- Phase 6 testing completion
- Comprehensive test suite
- Known issues documented

### Version 1.0.26
- Phase 5 complete (graphical workflows)
- Create Table Wizard
- Drop Table Wizard
- Schema Designer

### Version 1.0.20-1.0.25
- Phase 4 (Schema Designer)
- Phase 3 (Visual refinement)
- Phase 2 (Enhanced grid)
- Phase 1 (Svelte migration)

### Version 1.0.0 - 1.0.19
- Initial release
- Basic CRUD operations
- Tree view provider
- HTML-based webviews (pre-Svelte)
