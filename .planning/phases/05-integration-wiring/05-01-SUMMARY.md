---
phase: 05-integration-wiring
plan: 01
subsystem: Delegation
tags: [pause-handling, guidance-request, minerva-notification, retry-exhaustion]
requirements_met: [HARD-04, ERRO-05, ERRO-04]

dependency_graph:
  provides:
    - component: "WorkerTaskExecutor"
      interfaces: ["pause status monitoring", "guidance request integration"]
    - component: "RetryManager"
      interfaces: ["Minerva MQTT notification"]
  requires:
    - component: "TaskQueue"
      interfaces: ["getTask", "task.status"]
    - component: "GuidanceRequest"
      interfaces: ["requestGuidance"]
    - component: "MqttClient"
      interfaces: ["publish"]
    - component: "Topics"
      interfaces: ["guidanceRequest"]
  affects:
    - "packages/coordination/src/delegation/worker.ts"
    - "packages/coordination/src/delegation/retry.ts"

tech_stack:
  added: []
  patterns:
    - "Pause status polling with setInterval (1 second interval)"
    - "Guidance request timeout handling (30s timeout, empty string on timeout)"
    - "MQTT notification with MessageEnvelope (QoS 1 for at-least-once delivery)"

key_files:
  created: []
  modified:
    - path: "packages/coordination/src/delegation/worker.ts"
      changes:
        - "Added pauseCheckIntervals map to track pause monitoring intervals"
        - "Added pause status check at start of executeTask()"
        - "Added setInterval to monitor task status every 1 second during execution"
        - "Added cleanup of pause check interval in all code paths"
        - "Added guidanceRequest field to WorkerTaskExecutorOptions interface"
        - "Added guidanceRequest field to WorkerTaskExecutor class"
        - "Implemented requestGuidanceIfNeeded() to call GuidanceRequest.requestGuidance()"
        - "Added call to requestGuidanceIfNeeded() in handleFailure()"
        - "Added Minerva notification via MQTT in handleTimeout()"
    - path: "packages/coordination/src/delegation/retry.ts"
      changes:
        - "Added MqttClient, Topics, and MessageEnvelope imports"
        - "Added mqttClient parameter to RetryManager constructor"
        - "Updated createRetryManager function to accept and pass mqttClient"
        - "Replaced console.error with MQTT publish in notifyExhausted()"
        - "Created MessageEnvelope with 'task_failed' type for Minerva notification"

decisions: []
metrics:
  duration: 67 seconds
  completed_date: "2026-02-22"
  tasks_completed: 3
  files_modified: 2
  deviations: 1
---

# Phase 05 Plan 01: Integration Wiring Summary

## One-Liner
Implemented pause handling for memory throttling, GuidanceRequest integration for ambiguous errors, and Minerva notification via MQTT for retry exhaustion - closing all three integration gaps from the v1.0 audit.

## Summary

This plan completed the three cross-phase integrations identified in the v1.0 audit:

1. **Pause Handling (HARD-04)**: WorkerTaskExecutor now checks task status at start and during execution, aborting when the task status becomes 'paused' (set by ThrottleController for memory throttling).

2. **GuidanceRequest Integration (ERRO-05)**: WorkerTaskExecutor now integrates with GuidanceRequest to request guidance from Minerva when encountering ambiguous errors. The integration includes timeout handling (30s) and graceful fallback behavior.

3. **Minerva Notification (ERRO-04)**: RetryManager now sends structured MQTT notifications to Minerva when tasks exhaust all retries. WorkerTaskExecutor.handleTimeout() also sends notifications for timeout exhaustion (discovered during execution).

## Changes Made

### worker.ts

1. **Pause Status Handling**:
   - Added `pauseCheckIntervals: Map<string, NodeJS.Timeout>` field
   - Added pause check at start of `executeTask()` - returns early if task.status === 'paused'
   - Added `setInterval` to monitor task status every 1 second during execution
   - Added cleanup of pause check interval in all code paths (success, retry, failure)

2. **GuidanceRequest Integration**:
   - Added `guidanceRequest?: GuidanceRequest` to `WorkerTaskExecutorOptions` interface
   - Added `protected guidanceRequest?: GuidanceRequest` field to class
   - Updated constructor to accept and store `guidanceRequest` parameter
   - Implemented `requestGuidanceIfNeeded()` to call `GuidanceRequest.requestGuidance()`
   - Added call to `requestGuidanceIfNeeded()` in `handleFailure()` before retry decision
   - Handles timeout case (empty string) and errors gracefully

3. **Minerva Notification (Bonus)**:
   - Added MQTT notification in `handleTimeout()` for consistency with RetryManager

### retry.ts

1. **Minerva Notification**:
   - Added `MqttClient`, `Topics`, and `MessageEnvelope` imports
   - Added `private mqttClient: MqttClient` parameter to constructor
   - Updated `createRetryManager()` function to accept and pass `mqttClient`
   - Replaced `console.error` with MQTT publish in `notifyExhausted()`
   - Created `MessageEnvelope` with 'task_failed' type for Minerva notification
   - Published to `Topics.guidanceRequest()` topic with QoS 1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Added Minerva notification for timeout exhaustion in handleTimeout()**
- **Found during:** Task 3 verification
- **Issue:** TODO comment in `handleTimeout()` method for Minerva notification, inconsistent with `notifyExhausted()` implementation
- **Fix:** Replaced `console.error` with MQTT publish using MessageEnvelope, published to `Topics.guidanceRequest()` topic
- **Files modified:** `packages/coordination/src/delegation/worker.ts`
- **Commit:** eed490b

This deviation was necessary for consistency - both paths that exhaust retries (RetryManager.notifyExhausted and WorkerTaskExecutor.handleTimeout) should notify Minerva via MQTT.

## Verification Results

All verification checks passed:

1. **Pause Handling Integration (HARD-04)**:
   - `grep -n "paused"` shows 4 matches
   - executeTask checks status at start (line 266)
   - setInterval monitors status during execution (line 306)
   - Cleanup in all code paths (lines 325-329, 387-391, 419-423)

2. **GuidanceRequest Integration (ERRO-05)**:
   - `grep -n "guidanceRequest"` shows 7 matches
   - Constructor accepts parameter (line 159)
   - requestGuidanceIfNeeded() calls GuidanceRequest.requestGuidance() (line 476)
   - No TODO stubs related to guidance

3. **Minerva Notification (ERRO-04)**:
   - `grep -n "mqttClient.publish"` shows matches
   - notifyExhausted() publishes MQTT message (line 291)
   - handleTimeout() publishes MQTT message (line 543)
   - No TODO stubs related to Minerva notification

4. **No TODO Stub Check**:
   - `grep -rn "TODO.*GuidanceRequest\|TODO.*Minerva\|TODO.*pause"` returns empty
   - All TODOs resolved

## Technical Notes

### Pause Monitoring Pattern
The pause monitoring uses a 1-second polling interval to check task status. This is a simple but effective approach:
- Minimal overhead (1 check per second per active task)
- Immediate response to pause status changes
- Cleanup in all code paths prevents memory leaks

### Guidance Request Timeout
The GuidanceRequest integration handles the 30-second timeout gracefully:
- Empty string returned on timeout
- Proceeds with default behavior on timeout
- Logs warning for visibility

### MQTT Notification Format
Both RetryManager and WorkerTaskExecutor use the same notification format:
- MessageEnvelope with type 'task_failed'
- Published to Topics.guidanceRequest()
- QoS 1 for at-least-once delivery
- Includes taskId, agentId, error type, message, and reason
