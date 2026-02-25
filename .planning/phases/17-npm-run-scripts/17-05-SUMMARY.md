---
phase: 17-npm-run-scripts
plan: 05
subsystem: npm-scripts
tags: [npm, workspaces, vite, dashboard, minimist, zx]

# Dependency graph
requires:
  - phase: 17-03
    provides: dashboard config file (config/dashboard.json) and vite configuration
provides:
  - npm run dashboard command with dev/production mode selection
  - start-dashboard.mjs script with CLI flag parsing
affects: [18-systemd-services, documentation]

# Tech tracking
tech-stack:
  added: [minimist (via transitive dependency)]
  patterns: [npm workspace script delegation, zx-based CLI tools, CLI flag parsing with minimist]

key-files:
  created: [scripts/start-dashboard.mjs]
  modified: [package.json]

key-decisions:
  - 'Used minimist for CLI flag parsing (available via transitive dependency)'
  - 'Flag name: --production (not --prod) per 17-RESEARCH.md Open Question 2'

patterns-established:
  - 'Pattern 1: npm workspace script delegation - root scripts delegate to workspace-specific commands'
  - 'Pattern 2: ZX script with CLI flags - using zx for shell operations with minimist argument parsing'
  - 'Pattern 3: Structured logging - using chalk for colored output with configurable log levels'

requirements-completed: [SCRIPT-03]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 17 Plan 05: Dashboard Runner Summary

**npm run dashboard command with Vite dev server HMR and production preview mode using zx workspace delegation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T04:42:08Z
- **Completed:** 2026-02-25T04:47:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created start-dashboard.mjs script with mode detection (dev/production)
- Added npm run dashboard entry point in root package.json
- Implemented CLI flag parsing with minimist (--production, --config, -q, -v)
- Config loading from config/dashboard.json with fallback to port 5173
- Workspace command execution for @openclaw-swarm/dashboard package

## Task Commits

Each task was committed atomically:

1. **Task 1: Create start-dashboard.mjs script** - `ea4ccc9` (feat)
2. **Task 2: Add npm run dashboard script to package.json** - `f6baf83` (feat)

**Plan metadata:** `f6baf83` (docs: complete plan)

## Files Created/Modified

- `scripts/start-dashboard.mjs` - Dashboard runner with mode detection, config loading, and Vite startup
- `package.json` - Added "dashboard" and "api" npm script entry points

## Decisions Made

- Used minimist for CLI flag parsing (available as transitive dependency via better-sqlite3)
- Flag name: --production (not --prod) per 17-RESEARCH.md Open Question 2
- Dev mode: `npm run dev --workspace=@openclaw-swarm/dashboard` (Vite HMR enabled)
- Production mode: `npm run build --workspace=@openclaw-swarm/dashboard` + `npm run preview --workspace=@openclaw-swarm/dashboard`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added missing api script to package.json**

- **Found during:** Task 2 (Add npm run dashboard script to package.json)
- **Issue:** The start-api.mjs script existed from previous plan but the npm script entry point was missing from package.json
- **Fix:** Added "api": "node scripts/start-api.mjs" to package.json alongside the dashboard script
- **Files modified:** package.json
- **Verification:** npm run api launches start-api.mjs script
- **Committed in:** f6baf83 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix necessary for consistency - api script should have been added in 17-02. No scope creep.

## Issues Encountered

None - all tasks completed as specified.

## User Setup Required

None - no external service configuration required. Dashboard uses Vite dev server with HMR and vite preview for production mode.

## Next Phase Readiness

- Plan 17-05 complete, SCRIPT-03 requirement satisfied
- All npm run scripts (agent, api, dashboard) now available
- Ready for Phase 18: systemd service deployment
- No blockers or concerns

---

_Phase: 17-npm-run-scripts_
_Completed: 2026-02-25_
