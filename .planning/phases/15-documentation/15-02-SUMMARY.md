---
phase: 15-documentation
plan: 02
title: "Role-Specific Configs and Actionable Error Messages"
oneLiner: "Created three annotated config files (minerva, vulcan, worker) and added Fix: suggestions to MQTT and database error messages"
subsystem: "Documentation"
status: "complete"
tags: ["documentation", "configuration", "error-handling"]
dependencyGraph:
  requires:
    - "phase-15-plan-01" (README restructuring)
  provides:
    - "examples/configs/*.yaml" (Role-specific configuration reference)
    - "Enhanced error messages" (Actionable troubleshooting guidance)
  affects:
    - "Developer onboarding experience"
    - "Error self-service resolution"
techStack:
  added: []
  patterns:
    - "Annotated full-file configuration pattern"
    - "Fix: section in error messages pattern"
keyFiles:
  created:
    - "examples/configs/minerva.config.yaml"
    - "examples/configs/vulcan.config.yaml"
    - "examples/configs/worker.config.yaml"
  modified:
    - "packages/coordination/src/communication/mqtt.ts"
    - "packages/coordination/src/state/database.ts"
decisions: []
metrics:
  duration: "3 minutes"
  completedDate: "2026-02-24T03:21:00Z"
  tasksCompleted: 3
  filesCreated: 3
  filesModified: 2
---

# Phase 15 Plan 02: Role-Specific Configs and Actionable Error Messages - Summary

## Objective

Create role-specific annotated configuration files and add actionable "Fix:" suggestions to common error messages.

**Purpose:** Per DOCS-03, developers need full example configs for each agent role. Per DOCS-04, error messages should include actionable "Fix:" sections with specific commands.

**Output:** Three annotated config files (minerva, vulcan, worker) in examples/configs/, plus enhanced error messages in key code paths.

## Execution Summary

**Duration:** ~3 minutes
**Tasks Completed:** 3/3
**Commits:** 3
**Status:** COMPLETE

### Tasks Executed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create role-specific annotated config files | 2a57ba7 | examples/configs/*.yaml (3 files) |
| 2 | Add "Fix:" suggestions to MQTT connection errors | e5322c5 | packages/coordination/src/communication/mqtt.ts |
| 3 | Add "Fix:" suggestions to database errors | 4a3cd18 | packages/coordination/src/state/database.ts |

## Artifacts Created

### 1. Role-Specific Configuration Files

**examples/configs/minerva.config.yaml** (Orchestrator Role)
- Agent ID: minerva
- Role: orchestrator
- Capabilities: code, test, debug, plan
- Includes full documentation of all options
- Copy-pasteable (no placeholder values)
- Documents Mosquitto persistence warning
- Documents optimization feature flags (SWARM_BATCHING_ENABLED, SWARM_POOLING_ENABLED)

**examples/configs/vulcan.config.yaml** (Builder Role)
- Agent ID: vulcan
- Role: worker
- Capabilities: code, test, build
- Focused on code execution and testing
- References minerva.config.yaml for full flag documentation

**examples/configs/worker.config.yaml** (Flexible Worker)
- Agent ID: worker-1 (with guidance for worker-2, etc.)
- Role: worker
- Capabilities: code, test, debug
- Includes guidance for edge network heartbeat intervals
- References minerva.config.yaml for full flag documentation

### 2. Enhanced Error Messages

**MQTT Connection Errors** (packages/coordination/src/communication/mqtt.ts)
- **Connection failure:** Includes systemctl and Docker start commands, verification with mosquitto_sub
- **Publish failure:** Includes broker verification steps, topic permission checks
- **Subscribe failure:** Includes topic permission and format guidance

**Database Errors** (packages/coordination/src/state/database.ts)
- **Database open failure:** Includes chmod, ls, df, lsof commands for permission/filesystem issues
- **WAL mode failure:** Includes numbered fix steps, filesystem type checking
- **Database not open:** Includes example usage pattern

## Deviations from Plan

### Auto-fixed Issues

**Rule 2 - Missing Critical Functionality** - Git ignore issue with database.ts
- **Found during:** Task 3 commit
- **Issue:** `packages/coordination/src/state/database.ts` is ignored by .gitignore
- **Fix:** Used `git add -f` to force-add the file
- **Rationale:** The file was already tracked in git, but git add was refusing it due to .gitignore patterns
- **Impact:** None - file was successfully committed with force flag

## Implementation Details

### Configuration File Pattern

Per 15-RESEARCH.md Pattern 2 (Annotated Configuration Files):

```yaml
# =============================================================================
# Section Header with Role and Machine
# =============================================================================

# Option (required)
optionName: value  # Inline comment explaining purpose

# =============================================================================
# Subsection for warnings or feature flags
# =============================================================================
# Detailed multi-line documentation
```

**Key design decisions:**
- Every option is set with inline comment explaining its purpose
- Sections use comment separators (====) for visual organization
- Numeric options include range recommendations
- MQTT connection section documents local/remote/Docker scenarios
- Copy-pasteable (no "fill in this" placeholders - all values are reasonable defaults)

### Error Message Pattern

Per 15-RESEARCH.md Pattern 3 (Actionable Error Messages):

```
Error description with technical details

Fix: Action category:
  command1: actual command
  command2: alternative command

Additional context:
  - Cause 1
  - Cause 2
```

**Key design decisions:**
- Technical and concise tone
- Error message first, then "Fix:" section
- Specific commands, not vague advice
- Multiple alternatives when applicable (systemctl vs Docker)
- Verification steps included

## Commands Included in Fix: Suggestions

### MQTT Errors
- `sudo systemctl start mosquitto` - Start Mosquitto via systemd
- `docker run -p 1883:1883 eclipse-mosquitto` - Start Mosquitto via Docker
- `mosquitto_sub -h localhost -t '$SYS/#' -v` - Verify broker is running
- `mosquitto_sub -h localhost -t '$SYS/broker/version' -v` - Check broker version

### Database Errors
- `ls -la ${dir}` - Verify directory exists
- `ls -ld ${dir}` - Check directory permissions
- `chmod 755 ${dir}` - Fix directory permissions
- `df -h` - Check disk space
- `lsof ${dbPath}` - Check for database lock
- `df -T ${dir}` - Check filesystem type (NFS/CIFS warning)

## Success Criteria Verification

1. ✅ Developer can copy minerva.config.yaml and only change brokerUrl hostname to run orchestrator
2. ✅ Developer can copy vulcan.config.yaml or worker.config.yaml and only change agentId/brokerUrl to run worker
3. ✅ All common error paths (MQTT connection, database open, WAL mode) have actionable "Fix:" suggestions
4. ✅ Error messages include specific commands, not vague advice

## Requirements Satisfied

- **DOCS-03:** Example configs provided for each agent role (minerva, vulcan, worker) ✅
- **DOCS-04:** Error messages include actionable "Fix:" suggestions with specific commands ✅

## Next Steps

Phase 15-01 (README Quick Start restructure) should be executed next to complete the documentation phase. This plan will:
- Add 3-command quick start flow to README
- Add inline failure hints under each command
- Document Mosquitto persistence requirements prominently

---

*Summary created: 2026-02-24T03:21:00Z*
*Plan: 15-02*
*Phase: 15-documentation*

## Self-Check: PASSED

- ✅ examples/configs/minerva.config.yaml exists
- ✅ examples/configs/vulcan.config.yaml exists
- ✅ examples/configs/worker.config.yaml exists
- ✅ Commit 2a57ba7 exists (Task 1)
- ✅ Commit e5322c5 exists (Task 2)
- ✅ Commit 4a3cd18 exists (Task 3)
- ✅ 15-02-SUMMARY.md exists
