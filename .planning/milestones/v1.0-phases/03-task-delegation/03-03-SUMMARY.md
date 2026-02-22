---
phase: 03-task-delegation
plan: 03
subsystem: task-delegation
tags: ["retry-logic", "error-handling", "guidance-request", "minerva-notification", "exponential-backoff"]

# Dependency graph
requires:
  - phase: "03-task-delegation"
    plan: "01"
    provides: "TimeoutMonitor with classifyError, TaskDelegator, WorkerTaskExecutor"
  - phase: "03-task-delegation"
    plan: "02"
    provides: "ProgressReporter, TaskCancellation"
  - phase: "02-shared-state-lifecycle"
    provides: "TaskQueue with better-sqlite3 database"
  - phase: "01-communication-discovery"
    provides: "MQTT message bus with MqttClient wrapper"

provides:
  - id: "retry-manager"
    description: "RetryManager class for automatic task retry with exponential backoff and jitter"
  - id: "guidance-request"
    description: "GuidanceRequest class for agent-to-Minerva guidance requests with 30s timeout"
  - id: "minerva-notification"
    description: "Minerva notification system for task failure after max retries exhausted"

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exponential backoff with jitter: 2^n * 1000ms + random(0-1000ms), capped at 30s"
    - "Error classification: transient vs permanent for retry decision"
    - "Request/response pattern for guidance with timeout handling"
    - "RetryManager delegates retry decision logic from WorkerTaskExecutor"

key-files:
  created:
    - path: "packages/coordination/src/delegation/retry.ts"
      lines: 341
      description: "RetryManager class with shouldRetry(), calculateBackoff(), scheduleRetry(), notifyExhausted()"
    - path: "packages/coordination/src/delegation/guidance.ts"
      lines: 336
      description: "GuidanceRequest class with requestGuidance(), provideGuidance(), setupResponseHandler()"
  modified:
    - path: "packages/coordination/src/delegation/delegator.ts"
      changes: "Added handleTimeout(), notifyMinerva(), retryManager parameter"
    - path: "packages/coordination/src/delegation/worker.ts"
      changes: "Added handleFailure(), requestGuidanceIfNeeded(), retryManager parameter, updated handleCancellation()"
    - path: "packages/coordination/src/communication/topics.ts"
      changes: "Added guidanceRequest() and guidanceResponse(agentId) topic factory functions"
    - path: "packages/coordination/src/communication/message.ts"
      changes: "Extended MessageType with 'guidance_request', 'guidance_response', 'task_failed'"
    - path: "packages/coordination/src/delegation/index.ts"
      changes: "Added exports for RetryManager, GuidanceRequest and their types"

key-decisions:
  - "RetryManager delegates retry logic - centralizes retry decision and scheduling"
  - "Guidance request uses request/response pattern with 30s timeout - agents proceed with default on timeout"
  - "Minerva notified after max retries exhausted via task_failed message type"
  - "handleFailure() consolidates error handling logic in WorkerTaskExecutor - easier to maintain"

patterns-established:
  - "Error classification: classifyError() from timeout.ts used by RetryManager for retry decision"
  - "Retry flow: handleFailure() -> classifyError() -> shouldRetry() -> scheduleRetry() or notifyMinerva()"
  - "Guidance flow: requestGuidance() -> publish to swarm/guidance/request -> provideGuidance() -> response on agent/{id}/guidance"
  - "Timeout handling: handleTimeout() in TaskDelegator delegates to retryManager.scheduleRetry() or notifyMinerva()"

requirements-completed: [ERRO-01, ERRO-02, ERRO-04, ERRO-05]

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 3 Plan 03: Error Handling with Retry and Guidance Summary

**RetryManager with exponential backoff for automatic task retry, error classification (transient vs permanent), Minerva notification on exhaustion, and GuidanceRequest for agent-to-Minerva ambiguous situation handling**

## Performance

- **Duration:** 6 min (372 seconds)
- **Started:** 2026-02-21T22:42:02Z
- **Completed:** 2026-02-21T22:48:14Z
- **Tasks:** 5
- **Files modified:** 6

## Accomplishments

- Implemented RetryManager for automatic task retry with exponential backoff and jitter (capped at 30s)
- Implemented GuidanceRequest for agent-to-Minerva guidance requests with 30-second timeout
- Extended TaskDelegator with handleTimeout() and notifyMinerva() methods
- Extended WorkerTaskExecutor with handleFailure() for error classification and retry integration
- Added requestGuidanceIfNeeded() for ambiguous situation detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement RetryManager for automatic task retry** - `ce68eec` (feat)
2. **Task 2: Implement GuidanceRequest for agent-to-Minerva guidance requests** - `3d10bee` (feat)
3. **Task 3: Extend TaskDelegator with retry handling and Minerva notification** - `3f40571` (feat)
4. **Task 4: Extend WorkerTaskExecutor with error classification and retry integration** - `c1b5514` (feat)
5. **Task 5: Export error handling classes and update package index** - `fd6b220` (feat)

## Files Created/Modified

### Created

- `packages/coordination/src/delegation/retry.ts` - RetryManager class with shouldRetry(), calculateBackoff(), scheduleRetry(), notifyExhausted()
- `packages/coordination/src/delegation/guidance.ts` - GuidanceRequest class with requestGuidance(), provideGuidance(), setupResponseHandler()

### Modified

- `packages/coordination/src/delegation/delegator.ts` - Added handleTimeout(), notifyMinerva(), retryManager parameter
- `packages/coordination/src/delegation/worker.ts` - Added handleFailure(), requestGuidanceIfNeeded(), retryManager parameter
- `packages/coordination/src/communication/topics.ts` - Added guidanceRequest() and guidanceResponse(agentId) topic factory functions
- `packages/coordination/src/communication/message.ts` - Extended MessageType with 'guidance_request', 'guidance_response', 'task_failed'
- `packages/coordination/src/delegation/index.ts` - Added exports for RetryManager, GuidanceRequest and their types

## Decisions Made

- **RetryManager delegates retry logic:** Centralizes retry decision (shouldRetry) and scheduling (scheduleRetry) in one class, used by both TaskDelegator and WorkerTaskExecutor
- **Guidance request with timeout:** Uses request/response pattern with 30-second timeout, agent proceeds with default behavior if no response
- **Minerva notification after exhaustion:** TaskDelegator.notifyMinerva() publishes failure notification only after max retries exhausted
- **handleFailure() consolidation:** Moved error handling logic from executeTask() catch block to dedicated handleFailure() method for better maintainability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended MessageType with 'guidance_request' and 'guidance_response'**
- **Found during:** Task 2 (GuidanceRequest compilation)
- **Issue:** GuidanceRequest uses 'guidance_request' and 'guidance_response' message types which weren't defined in MessageType enum
- **Fix:** Extended MessageType in communication/message.ts to include 'guidance_request' and 'guidance_response'
- **Files modified:** packages/coordination/src/communication/message.ts
- **Verification:** Build passes, GuidanceRequest compiles successfully
- **Committed in:** `3d10bee` (part of Task 2 commit)

**2. [Rule 3 - Blocking] Extended MessageType with 'task_failed'**
- **Found during:** Task 3 (TaskDelegator compilation)
- **Issue:** TaskDelegator.notifyMinerva() uses 'task_failed' message type which wasn't defined in MessageType enum
- **Fix:** Extended MessageType in communication/message.ts to include 'task_failed'
- **Files modified:** packages/coordination/src/communication/message.ts
- **Verification:** Build passes, TaskDelegator compiles successfully
- **Committed in:** `3f40571` (part of Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Auto-fixes were necessary for compilation (MessageType missing new types). No scope creep.

## Verification Results

- **Build:** PASS - TypeScript compilation successful with no errors
- **RetryManager:** PASS - shouldRetry() returns false for permanent errors, true for transient with retryCount < maxRetries
- **Backoff calculation:** PASS - calculateBackoff() produces delays: 1-2s, 2-3s, 4-5s, 8-9s with 1s jitter, capped at 30s
- **Error classification:** PASS - classifyError() returns 'transient' for network/timeout errors, 'permanent' for validation/permission errors
- **Guidance request:** PASS - requestGuidance() publishes to swarm/guidance/request, sets 30s response timeout
- **Exhaustion notification:** PASS - notifyMinerva() publishes failure notification after max retries exhausted
- **All classes exported:** PASS - RetryManager, GuidanceRequest accessible from coordination package

## Requirements Satisfied

- ERRO-01: Failed tasks automatically retried with exponential backoff (max 3 retries) - RetryManager.scheduleRetry()
- ERRO-02: Errors classified as retryable (network timeout) vs abort (invalid input) - classifyError() used by shouldRetry()
- ERRO-04: Minerva notified when task fails after exhausting retries - notifyMinerva() called after maxRetries
- ERRO-05: Agents can request guidance from Minerva when encountering ambiguous situations - GuidanceRequest.requestGuidance()

## Next Phase Readiness

- Phase 3 error handling infrastructure complete
- All Phase 3 task delegation requirements satisfied
- Retry logic in place for robust task execution
- Guidance request mechanism available for ambiguous situations
- Ready for Phase 4: Agent Supervision or next feature development

---

*Phase: 03-task-delegation*
*Plan: 03*
*Completed: 2026-02-21*

## Self-Check: PASSED

- [x] retry.ts created (341 lines)
- [x] guidance.ts created (336 lines)
- [x] delegator.ts modified (handleTimeout, notifyMinerva added)
- [x] worker.ts modified (handleFailure, requestGuidanceIfNeeded added)
- [x] topics.ts modified (guidanceRequest, guidanceResponse added)
- [x] message.ts modified (MessageType extended)
- [x] delegation/index.ts modified (exports added)
- [x] SUMMARY.md created
- [x] Commit ce68eec (Task 1)
- [x] Commit 3d10bee (Task 2)
- [x] Commit 3f40571 (Task 3)
- [x] Commit c1b5514 (Task 4)
- [x] Commit fd6b220 (Task 5)
