---
phase: 13-setup-validation
plan: 03
subsystem: developer-tooling
tags: [zx, chalk, cli-table3, setup-script, environment-validation, mosquitto]

# Dependency graph
requires:
  - phase: 13-02
    provides: extended health check endpoint, auto-loading agent registry
provides:
  - Environment validation script (scripts/setup.mjs)
  - Node.js version check (>=22.0.0 requirement)
  - Workspace link verification
  - Database accessibility check
  - Mosquitto persistence detection with snap compatibility warning
  - Database schema initialization via initializeSchema
affects: [phase-14-run-scripts, phase-15-documentation]

# Tech tracking
tech-stack:
  added: [zx ^8.8.5, chalk ^5.6.2, cli-table3 ^0.6.5, ora ^9.3.0]
  patterns: [table-formatted CLI output, fail-fast validation, non-blocking warnings, dynamic ES module imports]

key-files:
  created: [scripts/setup.mjs, scripts/utils/env-check.mjs, scripts/utils/mqtt-check.mjs]
  modified: [package.json, package-lock.json]

key-decisions:
  - "Used zx for shell scripting instead of bash - TypeScript-friendly, cross-platform, better error handling"
  - "Table-formatted output with pass/fail icons - visual clarity for developers"
  - "Fail-fast on critical errors (Node version, workspaces, database) - prevents cascade of confusing failures"
  - "Non-blocking Mosquitto warning - allows snap-installed Mosquitto to work with visible guidance"
  - "Dynamic imports for utility modules - allows path construction before ESM import resolution"

patterns-established:
  - "Setup script pattern: validate → warn → initialize → report"
  - "Structured check result: { pass: boolean, message: string, fix?: string }"
  - "Table-based CLI output for multi-step validation"

requirements-completed: [SETUP-02, SETUP-04]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 13 Plan 03: Create setup script for environment validation and database initialization

**Setup script with table-formatted validation, fail-fast error handling, and Mosquitto persistence warning for snap compatibility**

## Performance

- **Duration:** 3 minutes
- **Started:** 2026-02-24T01:15:42Z
- **Completed:** 2026-02-24T01:18:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created setup script (scripts/setup.mjs) that validates environment and initializes database
- Implemented environment validation utilities (Node.js version, workspace links, database access)
- Added Mosquitto persistence detection with snap compatibility warning
- Installed zx, chalk, cli-table3, ora as dev dependencies for CLI tooling
- Table-formatted output with pass/fail icons for visual clarity

## Task Commits

Each task was committed atomically:

1. **Task 1: Create setup utilities directory structure** - `30de617` (feat)
2. **Task 2: Install setup script dependencies** - `b0876d4` (chore)
3. **Fix: Dynamic import syntax in setup script** - `67bb9e6` (fix)

**Plan metadata:** None (SUMMARY created after plan completion)

## Files Created/Modified

- `scripts/setup.mjs` - Main setup script with environment validation and database initialization
- `scripts/utils/env-check.mjs` - Environment validation functions (Node version, workspaces, database)
- `scripts/utils/mqtt-check.mjs` - Mosquitto persistence detection for snap compatibility warning
- `package.json` - Added zx, chalk, cli-table3, ora as dev dependencies
- `package-lock.json` - Dependency lockfile updated

## Decisions Made

- **zx for shell scripting** - TypeScript-native, cross-platform alternative to bash with better error handling
- **Table-formatted output** - cli-table3 provides structured, visually scannable validation results
- **Fail-fast on errors** - Stops immediately on Node version, workspace, or database failures with clear "Fix:" messages
- **Non-blocking Mosquitto warning** - Allows system to proceed when Mosquitto persistence is disabled (common with snap installs)
- **Dynamic imports** - Required because ES modules don't support template literals in static import statements

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid ES module import syntax**
- **Found during:** Task 1 verification (setup script test run)
- **Issue:** Template literals used in static import statements (`from `${utilsPath}/env-check.mjs``) caused SyntaxError
- **Fix:** Changed to dynamic imports using `import()` function with path constructed via `path.join()`
- **Files modified:** scripts/setup.mjs
- **Verification:** `npm run setup` now executes successfully, displaying table-formatted validation results
- **Committed in:** `67bb9e6` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix was necessary for setup script to execute. No scope creep.

## Issues Encountered

- **Invalid import syntax in plan specification** - The plan specified template literals in static import statements which is invalid ES module syntax. Fixed by using dynamic imports.

## User Setup Required

None - no external service configuration required. Setup script validates local environment only.

## Verification Results

Setup script tested with `npm run setup`:

```
=== OpenClaw Swarm Setup ===

┌───────────────────────┬────────┬─────────────────────┐
│ Check                 │ Status │ Details             │
├───────────────────────┼────────┼─────────────────────┤
│ Node.js version       │ ✓      │ Node.js 24.11.0     │
├───────────────────────┼────────┼─────────────────────┤
│ Workspace links       │ ✓      │ All packages linked │
├───────────────────────┼────────┼─────────────────────┤
│ Database              │ ✓      │ Accessible          │
├───────────────────────┼────────┼─────────────────────┤
│ Mosquitto persistence │ ⚠      │ Not configured      │
└───────────────────────┴────────┴─────────────────────┘

⚠ Mosquitto configuration not found. Is MQTT broker installed?

[Database schema initialization fails as expected - coordination package not built yet]
```

Expected behavior per plan:
- Node.js version check passes (24.11.0 >= 22.0.0)
- Workspace links verified
- Database accessible
- Mosquitto warning displayed (non-blocking)
- Schema initialization fails with "Run npm run build first" message

## Next Phase Readiness

- Setup script ready for use in Phase 14 (run scripts and services)
- Mosquitto persistence warning addresses SETUP-04 requirement
- Environment validation addresses SETUP-02 requirement
- No blockers - Phase 13 near completion (13-02 should be executed next)

---
*Phase: 13-setup-validation*
*Plan: 03*
*Completed: 2026-02-24*
