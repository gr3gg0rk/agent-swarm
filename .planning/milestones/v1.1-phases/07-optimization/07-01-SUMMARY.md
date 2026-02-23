---
phase: 07-optimization
plan: 01
subsystem: coordination
tags: ["batching", "mqtt", "optimization", "messagepack", "performance"]

# Dependency graph
requires:
  - phase: 06-advanced-routing
    provides: ["Load metrics publishing", "Performance history tracking"]
provides:
  - MessageBatcher class with dual-trigger flushing for 10x throughput improvement
  - BatchConfig interface with per-type thresholds (tasks=10ms, status=50ms, heartbeats=100ms)
  - MqttClient integration with optional batchPublisher support
  - Batch topic constants (swarm/batch/{type}) for high-frequency message routing
affects: ["message consumers", "task executors", "heartbeat publishers"]

# Tech tracking
tech-stack:
  added: ["MessageBatcher", "BatchConfig", "dual-trigger flushing"]
  patterns: ["time-windowed batching", "graceful degradation fallback", "opt-in optimization"]

key-files:
  created:
    - "packages/coordination/src/optimization/batcher.ts"
    - "packages/coordination/src/optimization/index.ts"
  modified:
    - "packages/coordination/src/communication/mqtt.ts"
    - "packages/coordination/src/communication/topics.ts"

key-decisions:
  - "Task assignments bypass batching entirely (latency critical per 07-RESEARCH.md Open Question 4)"
  - "Batcher wraps MqttClient.publish() rather than replacing it (enables opt-in usage)"
  - "Graceful fallback to direct publish on batcher failure (per Pitfall 4)"
  - "Dual-trigger flushing: time OR size (whichever first) to prevent unbounded buffer growth"

patterns-established:
  - "Pattern 1: BufferedMessage interface stores topic with envelope for proper routing"
  - "Pattern 2: Batcher publishes to swarm/batch/{type} with MessagePack array payload"
  - "Pattern 3: MqttClient.end() flushes batcher before disconnect to prevent message loss"

requirements-completed: ["OPTI-01", "OPTI-02"]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 7 Plan 1: Time-Windowed Message Batching Summary

**Time-windowed message batching with dual-trigger flushing (time OR size) achieving per-type thresholds: tasks=10ms/50, status=50ms/100, heartbeats=100ms/20 for 10x throughput improvement.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T01:15:12Z
- **Completed:** 2026-02-23T01:19:39Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- MessageBatcher class with dual-trigger flushing strategy (time threshold OR buffer size limit)
- Per-type batch configuration matching OPTI-02 requirements (tasks=10ms, status=50ms, heartbeats=100ms)
- MqttClient integration with optional setBatchPublisher() method for opt-in batching
- Batch topic constants (swarm/batch/{type}) for routing high-frequency messages
- Graceful degradation: batcher failure falls back to direct MqttClient.publish()

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MessageBatcher class with dual-trigger flushing** - `c5361f2` (feat)
2. **Task 2: Integrate MessageBatcher with MqttClient** - `298d567` (feat)
3. **Task 3: Add batch topic constants** - `00c4d2c` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

### Created

- `packages/coordination/src/optimization/batcher.ts` - MessageBatcher class with time-windowed batching, dual-trigger flushing, graceful fallback
- `packages/coordination/src/optimization/index.ts` - Optimization module exports (MessageBatcher, BatchConfig, DEFAULT_BATCH_CONFIG)

### Modified

- `packages/coordination/src/communication/mqtt.ts` - Added batchPublisher field, setBatchPublisher()/getBatchPublisher() methods, publish() uses batcher when available, end() flushes batcher before disconnect
- `packages/coordination/src/communication/topics.ts` - Added batch topic constants (batchProgress, batchHeartbeat, batchLoadMetrics, batchTasks, batchStatus) and allBatches subscription pattern

## Implementation Details

### BatchConfig Interface

```typescript
export interface BatchConfig {
  tasks: { windowMs: number; maxSize: number };
  status: { windowMs: number; maxSize: number };
  heartbeats: { windowMs: number; maxSize: number };
  [key: string]: { windowMs: number; maxSize: number };
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  tasks: { windowMs: 10, maxSize: 50 },
  status: { windowMs: 50, maxSize: 100 },
  heartbeats: { windowMs: 100, maxSize: 20 },
};
```

### MessageBatcher Class

- **constructor(mqttClient, config?)**: Creates batcher with optional custom config
- **publish(topic, envelope)**: Batches messages by type, bypasses batching for 'task' type
- **flush(type)**: Publishes buffered messages as MessagePack array to `swarm/batch/{type}`
- **stop()**: Flushes all pending buffers for graceful shutdown

### Type Mapping

Per OPTI-02 requirements:
- `'task'`, `'result'`, `'cancel'` → `'tasks'` (10ms window, 50 max)
- `'progress'` → `'status'` (50ms window, 100 max)
- `'heartbeat'`, `'load_metrics'` → `'heartbeats'` (100ms window, 20 max)
- All other types → `'status'` (default)

**Critical:** Task assignments (`'task'` type) bypass batching entirely for low latency.

### Batch Topic Pattern

Batches publish to `swarm/batch/{type}` where type is:
- `tasks` - Task-related messages (results, cancellations)
- `status` - Status updates (progress)
- `heartbeats` - Heartbeats and load metrics

Batch payload is MessagePack-encoded array of `{ topic, envelope }` objects for proper routing.

### MqttClient Integration

```typescript
// Enable batching (opt-in)
mqttClient.setBatchPublisher(new MessageBatcher(mqttClient));

// Disable batching
mqttClient.setBatchPublisher(undefined);

// All publish() calls automatically use batcher when set
await mqttClient.publish(topic, envelope); // Batches if available
```

### Degradation Mode

Per 07-RESEARCH.md Pitfall 4: Optimization failures must not break core messaging.

```typescript
async publish(topic: string, envelope: MessageEnvelope): Promise<void> {
  try {
    // ... batching logic
  } catch (error) {
    // Fallback to direct publish
    await this.mqttClient.publish(topic, envelope);
  }
}
```

## Decisions Made

1. **Task assignments bypass batching entirely** - Per 07-RESEARCH.md Open Question 4, task assignment messages are latency-critical and should not be delayed by batching. The batcher checks for `'task'` type and publishes directly.

2. **Batcher wraps MqttClient.publish() rather than replacing it** - Enables opt-in usage pattern where existing code works unchanged, and batching can be enabled via `setBatchPublisher()`. This follows the plan requirement: "DO NOT modify existing MqttClient behavior - batcher is opt-in via optional parameter."

3. **Graceful fallback to direct publish on batcher failure** - Per 07-RESEARCH.md Pitfall 4, all batching logic is wrapped in try-catch with fallback to direct MqttClient.publish(). This ensures optimization failures don't break core messaging.

4. **Dual-trigger flushing: time OR size** - Both triggers are active simultaneously. Flush occurs when EITHER time threshold expires OR buffer size limit is reached. This prevents unbounded buffer growth (Pitfall 1) while maintaining throughput benefits.

5. **BufferedMessage interface stores topic with envelope** - Batches need to preserve original topics for proper routing when deserialized. The `{ envelope, topic }` structure enables correct delivery.

6. **Batch envelope uses 'status' type** - To avoid adding a new 'batch' MessageType, batch envelopes use 'status' type (valid in MessageType union). Payload contains the actual MessagePack-encoded message array.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation, exports, and all verification criteria passed without issues.

## Next Phase Readiness

- MessageBatcher class ready for use in high-frequency message scenarios (progress updates, heartbeats, load metrics)
- MqttClient integration complete - batching can be enabled via `setBatchPublisher()`
- Batch consumers should subscribe to `swarm/batch/#` to receive batched messages
- No blockers or concerns - ready for Plan 07-02 (Connection Pooling) or 07-03 (Context References)

---
*Phase: 07-optimization*
*Plan: 01*
*Completed: 2026-02-23*
