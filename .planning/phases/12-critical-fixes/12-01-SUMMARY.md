---
phase: 12-critical-fixes
plan: 01
subsystem: coordination/communication
tags: [msgpackr, build-fix, types]
dependency_graph:
  requires: []
  provides: [msgpackr-types]
  affects: [codec-exports]
tech_stack:
  added:
    - "packages/coordination/src/types/msgpackr.d.ts (type declarations)"
  patterns:
    - "Functional API for msgpackr (pack/unpack instead of class)"
    - "Local type declarations to work around package.json exports limitations"
key_files:
  created:
    - "packages/coordination/src/types/msgpackr.d.ts"
  modified:
    - "packages/coordination/src/communication/codec.ts"
decisions: []
metrics:
  duration: "160 seconds"
  completed_date: "2026-02-23"
---

# Phase 12 Plan 01: Fix msgpackr Imports Summary

Fix msgpackr imports to use the correct functional API (pack/unpack) instead of the non-existent MessagePack class, enabling successful package installation and build.

## One-Liner

Replaced MessagePack class with pack/unpack functions from msgpackr 0.6.0, removing @ts-ignore comments and adding local type declarations to resolve Node16 module resolution issues.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added local type declaration file**
- **Found during:** Task 1
- **Issue:** msgpackr 0.6.0's package.json lacks "types" in exports field, causing TypeScript Node16 module resolution to fail with "Could not find a declaration file" error
- **Fix:** Created `packages/coordination/src/types/msgpackr.d.ts` with type declarations for pack/unpack functions
- **Files modified:** Created new type declaration file
- **Commit:** c079bff

**Rationale:** The plan specified using pack/unpack functions instead of MessagePack class, but didn't account for the Node16 module resolution issue. Adding a local type declaration file is the minimal fix that doesn't require changing dependencies (architectural change) or modifying tsconfig (affects entire project).

## Execution Summary

### Tasks Completed

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Replace MessagePack class with pack/unpack functions | c079bff | packages/coordination/src/communication/codec.ts, packages/coordination/src/types/msgpackr.d.ts |

### Changes Made

1. **codec.ts import statement**: Changed from `import { MessagePack }` to `import { pack, unpack }`
2. **encodeMessage function**: Replaced `MessagePack.encode(codecEnvelope)` with `pack(codecEnvelope)`
3. **decodeMessage function**: Replaced `MessagePack.decode(buffer)` with `unpack(buffer)` (2 occurrences)
4. **Type declaration file**: Created `src/types/msgpackr.d.ts` to provide missing type information for msgpackr 0.6.0
5. **Removed @ts-ignore comment**: No longer needed with proper type declarations

### Verification Results

- Build succeeds: `cd packages/coordination && npm run build` returns exit code 0
- No @ts-ignore in codec.ts: `grep -n "@ts-ignore" packages/coordination/src/communication/codec.ts` returns empty
- Correct imports: `grep "import.*pack.*unpack.*from 'msgpackr'"` finds the import line
- pack() used: Found in encodeMessage (line 68)
- unpack() used: Found in decodeMessage (lines 95, 107)

## Requirements Satisfied

- CRIT-01: Developer can run `npm install && npm run build` without import errors
- CRIT-02: msgpackr imports use correct API (pack/unpack functions, not MessagePack class)

## Technical Notes

The msgpackr 0.6.0 package exports pack/unpack functions (verified in index.js), but its package.json lacks the "types" field in the exports object. This causes TypeScript's Node16 module resolution to fail even though type definitions exist at index.d.ts. The local type declaration file provides the missing type information without requiring dependency upgrades or tsconfig changes.

## Self-Check: PASSED

- [x] Created file exists: packages/coordination/src/types/msgpackr.d.ts
- [x] Modified file exists: packages/coordination/src/communication/codec.ts
- [x] Commit exists: c079bff
- [x] Build passes without errors
- [x] No @ts-ignore comments remain
- [x] pack() and unpack() functions are used

---

*Plan completed: 2026-02-23*
*Duration: 160 seconds*
*Next: 12-02-PLAN.md (Add missing optimization module exports)*
