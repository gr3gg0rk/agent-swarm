# Phase 12: Critical Fixes - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix build-time and import issues that block installation. Six specific issues: msgpackr import errors, missing optimization exports, missing schema exports, database pragma return types, and SQL placeholder count bugs.

This phase delivers a working `npm install && npm run build` experience. New capabilities belong in other phases.

</domain>

<decisions>
## Implementation Decisions

### Fix Verification Approach
- Unit tests for each of the 6 critical fix requirements
- Verification bar: build passes + affected import works + no new errors
- Run smoke tests before merging (agent starts, API responds, dashboard loads)
- Add 6 targeted tests to protect against regression (not deferred to Phase 16)

### Error Handling Style
- Throw descriptive errors when pragma returns unexpected type (e.g., "Pragma journal_mode failed: expected WAL, got null")
- Let imports fail natively with Node's module not found error
- Throw immediately with details on SQL placeholder mismatch (expected vs actual count)
- Include actionable "Fix:" suggestions in error messages

### Backward Compatibility
- Clean break acceptable - remove `@ts-ignore`, use only `pack`/`unpack` functions
- No support for old import paths - fix exports to be correct
- Schema changes: Claude's discretion (preserve existing data if possible)
- Version as minor or patch (these are bug fixes)

### Fix Scope Boundary
- Strict scope: fix only CRIT-01 through CRIT-06
- File discovered non-critical issues for later (don't expand scope)
- Minimal changes only - no refactoring nearby code
- Fix symptoms (e.g., add missing export) not root causes

### Claude's Discretion
- Exact test structure for the 6 targeted tests
- Which smoke tests to run before merge
- Database schema adjustments if needed for INSERT fix
- Error message wording (as long as it includes Fix: hint)

</decisions>

<specifics>
## Specific Ideas

- Error messages should follow pattern: `[Problem description]. Fix: [actionable command or config change]`
- Build+import verification should be automatable (not manual inspection)

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope. Discovered issues during fix work should be filed for later, not added to this phase.

</deferred>

---

*Phase: 12-critical-fixes*
*Context gathered: 2026-02-23*
