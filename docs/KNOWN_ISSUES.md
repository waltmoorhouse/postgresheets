# Known Issues and Limitations

## Current Known Issues

### Limited Array Type Support

**Issue:** PostgreSQL array types (e.g., `TEXT[]`, `INTEGER[]`) are displayed as JSON strings in the data grid.

**Impact:** 
- Arrays cannot be edited directly in grid
- Visual distinction between arrays and other JSON types is unclear

**Workaround:** Use manual SQL to update array columns.

**Priority:** Low

**Status:** Accepted limitation for current version

### Custom Enum Type Display

**Issue:** Custom ENUM types show as their string values without indication of valid options.

**Impact:** 
- Users may enter invalid enum values
- No autocomplete for valid enum values

**Workaround:** Refer to database schema for valid enum values.

**Priority:** Low

**Status:** Accepted limitation - may add in future version

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
