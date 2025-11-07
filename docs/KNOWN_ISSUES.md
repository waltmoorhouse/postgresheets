# Known Issues and Limitations

## Current Known Issues

### Expanded Databases Reconnect on Close

**Issue:** Not Collapsing connection tree items before disconnecting causes an immediate auto-reconnect when a tree was expanded — the disconnect command should collapses the connection node first to avoid triggering the expansion-driven connect path.

**Workaround:** Collapse the tree manually before clicking Disconnect

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

### Medium Priority

6. **ER Diagram View**
   - Status: Not implemented
   - Impact: Must use external tools to visualize relationships
   - Effort: Large (1-2 weeks)

7. **Visual Query Builder**
   - Status: Not implemented
   - Impact: Complex queries require SQL knowledge
   - Effort: Large (2-3 weeks)

12. **Stored Procedure Editor**
    - Status: Not implemented
    - Impact: Must use external editor for procedures/functions
    - Effort: Medium (1 week)

### Low Priority

13. **Custom Theme Support**
    - Status: Uses VS Code themes only
    - Impact: Limited customization
    - Effort: Medium (3-5 days)

14. **Saved Queries/Snippets**
    - Status: Not implemented
    - Impact: Must re-type common queries
    - Effort: Small (2-3 days)

15. **Data Visualization Charts**
    - Status: Not implemented
    - Impact: Must export to create visualizations
    - Effort: Large (2-3 weeks)

16. **Schema Comparison Tool**
    - Status: Not implemented
    - Impact: Must manually compare schemas
    - Effort: Large (1-2 weeks)

17. **Migration Generator**
    - Status: Not implemented
    - Impact: Must write migrations manually
    - Effort: Large (2-3 weeks)

18. **Multi-Connection Comparison**
    - Status: Not implemented
    - Impact: Cannot compare across connections
    - Effort: Large (1-2 weeks)

## Technical Debt

### Code Quality

1. **Improve Type Safety in Message Passing** ✅ COMPLETED
   - **Status:** Implemented
   - **Changes:** Created discriminated union types for webview messages (`WebviewToExtensionMessage` and `ExtensionToWebviewMessage`) in `src/types.ts`. Added type guards (`isWebviewToExtension()`) to safely validate messages. All webview communication is now fully typed.
   - **Impact:** Type safety improved from `any` types to discriminated unions. Type errors caught at compile time instead of runtime.

2. **Error Boundaries in Svelte** ✅ COMPLETED
   - **Status:** Implemented
   - **Changes:** Created `ErrorBoundary.svelte` component that catches uncaught JavaScript errors and unhandled promise rejections. Component displays graceful error UI with recovery options ("Try Again" and "Reload Page"). Errors are reported to the extension for logging.
   - **Impact:** Webview no longer crashes on JavaScript errors. Users can recover gracefully instead of needing to restart the extension.

3. **Reduce Bundle Size**
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
