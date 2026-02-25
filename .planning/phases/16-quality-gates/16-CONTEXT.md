# Phase 16: Quality Gates - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

CI prevents broken code from being committed and verifies published package works. Automated quality checks run on every commit (pre-commit hooks) and on every push/PR (CI workflow).

</domain>

<decisions>
## Implementation Decisions

### CI Platform & Workflow
- CI runs on every push and PR
- CI blocks merges on failure (required check)
- CI runs all checks: build, verify exports, lint, typecheck, and integration tests

### Pre-commit Hooks
- Auto-install via postinstall (Husky)
- Hooks are blocking — commit fails if checks don't pass
- Hooks run 4 checks: format, lint, typecheck, import verification
- Developers can bypass with `git commit --no-verify` (documented in CONTRIBUTING.md)

### Lint/Typecheck Rules
- No explicit strictness preferences — defer to Claude's discretion

### Integration Tests
- Test scope follows QA-03 requirement: INSERT works, schema initialization succeeds, pragma calls return expected values

### Claude's Discretion
- CI platform choice (GitHub Actions recommended for npm package)
- CI environment (Node versions to test)
- TypeScript strict mode
- ESLint configuration preset vs custom
- Auto-fix behavior in lint hooks
- Prettier vs ESLint for formatting
- Test database: in-memory vs temp file
- MQTT inclusion in integration tests
- Test data cleanup strategy

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for quality gates in an open source npm package.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-quality-gates*
*Context gathered: 2026-02-24*
