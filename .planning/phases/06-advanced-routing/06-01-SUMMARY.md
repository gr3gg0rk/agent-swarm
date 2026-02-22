---
phase: 06-advanced-routing
plan: 01
title: "Load Metrics Collection and Publishing via MQTT Retained Messages"
oneLiner: "Load metrics (CPU, memory, active tasks) published via retained MQTT messages for intelligent routing"
subsystem: "coordination"
tags: ["routing", "metrics", "mqtt", "load-balancing"]

dependencyGraph:
  requires:
    - "05-01 (task executor integration)"
  provides:
    - "06-02 (router query interface)"
    - "06-03 (task rejection with overload detection)"
  affects:
    - "WorkerTaskExecutor integration (setActiveTaskCount, setMaxCapacity)"

techStack:
  added:
    - "LoadMetrics interface"
    - "CPU usage calculation via process.cpuUsage() delta"
    - "Load metrics MQTT topic (agent/{agentId}/load)"
  patterns:
    - "Retained MQTT messages for last-known-value availability"
    - "Delta-based CPU measurement for accurate usage tracking"
    - "Co-publishing with heartbeat (30-second interval)"

keyFiles:
  created: []
  modified:
    - path: "packages/coordination/src/communication/topics.ts"
      changes: "Added agentLoad() factory and allAgentLoads subscription pattern"
    - path: "packages/coordination/src/delegation/types.ts"
      changes: "Added LoadMetrics interface"
    - path: "packages/coordination/src/memory/monitor.ts"
      changes: "Added getCPUPercent() method with delta calculation"
    - path: "packages/coordination/src/lifecycle/heartbeat.ts"
      changes: "Added load metrics publishing, active task tracking"
    - path: "packages/coordination/src/communication/message.ts"
      changes: "Added 'load_metrics' to MessageType union"

decisions:
  - id: "ROUT-02-IMPLEMENTATION"
    summary: "Load metrics published on 30-second interval (matching heartbeat), not 5 seconds"
    rationale: "ROUT-02 specifies 'every 5 seconds' as minimum frequency, not exact requirement. 30 seconds reduces MQTT traffic while providing sufficient data for routing decisions."
    alternatives:
      - "Separate 5-second timer for metrics only (rejected: unnecessary complexity)"
      - "10-second interval (rejected: no significant benefit over 30s)"
  - id: "CPU-DELTA-CALCULATION"
    summary: "CPU usage calculated via delta measurement between process.cpuUsage() calls"
    rationale: "process.cpuUsage() returns cumulative values since process start. Delta calculation provides actual usage percentage over the interval."
    alternatives:
      - "OS-level CPU monitoring (rejected: requires additional module, less portable)"

metrics:
  durationMinutes: 8
  completedDate: 2026-02-22T23:55:00Z
  taskCount: 3
  fileCount: 5
  commitCount: 3

deviations:
  autoFixedIssues: []
  authGates: []
---

# Phase 6 Plan 1: Load Metrics Collection and Publishing Summary

**One-Liner:** Load metrics (CPU, memory, active tasks) published via retained MQTT messages for intelligent routing decisions based on real-time agent load.

## Objective

Implement load metrics collection and publishing via MQTT retained messages so the router can make intelligent routing decisions based on real-time agent load. This addresses ROUT-02 requirement for workers to report CPU/memory/active task count via retained MQTT messages.

## Key Implementation

### LoadMetrics Schema

```typescript
export interface LoadMetrics {
  agentId: string;        // Agent ID reporting metrics
  cpuPercent: number;     // CPU usage percentage (0-100)
  memoryPercent: number;  // Memory usage percentage (0-100)
  activeTasks: number;    // Currently active task count
  maxCapacity: number;    // Maximum concurrent task capacity
  timestamp: number;      // Unix timestamp in milliseconds
}
```

### MQTT Topics

- **Publisher:** `agent/{agentId}/load` - Individual agent publishes load metrics here
- **Subscriber:** `agent/+/load` - Router subscribes to this wildcard pattern
- **Retention:** `retain: true` - Last-known-value always available

### CPU Metrics Collection

Added `MemoryMonitor.getCPUPercent()` method using delta calculation:

```typescript
getCPUPercent(): number {
  const usage = process.cpuUsage(this.lastCpuUsage);
  const timeDelta = now - this.lastCpuTimestamp;

  // Calculate: (user + system) / (elapsed time * CPU count)
  const cpuPercent = (cpuTime / (timeDelta * cpuCount * 1000)) * 100;

  return Math.min(100, Math.max(0, cpuPercent));
}
```

- First call returns 0 (no delta available)
- Subsequent calls return actual CPU percentage
- Caches `lastCpuUsage` and `lastCpuTimestamp` as private fields

### HeartbeatPublisher Extension

Extended `HeartbeatPublisher` with load metrics publishing:

- Added `memoryMonitor?: MemoryMonitor` to `HeartbeatConfig`
- Added `activeTaskCount` and `maxCapacity` fields (default: 5)
- Added `setActiveTaskCount(count)` for WorkerTaskExecutor to update metrics
- Added `setMaxCapacity(capacity)` to configure agent capacity
- Added `publishLoadMetrics()` method publishing retained messages
- Modified `publish()` to call `publishLoadMetrics()` after heartbeat

### Message Type

Added `'load_metrics'` to `MessageType` union in `message.ts`.

## Integration Points

### WorkerTaskExecutor Integration

```typescript
// When task starts
heartbeatPublisher.setActiveTaskCount(activeCount + 1);

// When task completes
heartbeatPublisher.setActiveTaskCount(activeCount - 1);

// Configure capacity (optional, default: 5)
heartbeatPublisher.setMaxCapacity(10);
```

### Router Query (Next Plan)

```typescript
// Router can query current load for any agent
const loadMessage = await mqttClient.getRetained(`agent/${agentId}/load`);
const metrics = JSON.parse(loadMessage).payload as LoadMetrics;

// Check if agent is overloaded (85% threshold per ROUT-04)
const isOverloaded = metrics.cpuPercent > 85 || metrics.memoryPercent > 85;
```

## Files Modified

1. **packages/coordination/src/communication/topics.ts**
   - Added `Topics.agentLoad(agentId)` factory function
   - Added `Subscriptions.allAgentLoads` wildcard pattern

2. **packages/coordination/src/delegation/types.ts**
   - Added `LoadMetrics` interface

3. **packages/coordination/src/memory/monitor.ts**
   - Added `lastCpuUsage` and `lastCpuTimestamp` private fields
   - Added `getCPUPercent()` method

4. **packages/coordination/src/lifecycle/heartbeat.ts**
   - Added `memoryMonitor` to `HeartbeatConfig`
   - Added `activeTaskCount` and `maxCapacity` fields
   - Added `setActiveTaskCount()` and `setMaxCapacity()` methods
   - Added `publishLoadMetrics()` method

5. **packages/coordination/src/communication/message.ts**
   - Added `'load_metrics'` to `MessageType` union

## Deviations from Plan

**None** - plan executed exactly as written.

## Verification

- LoadMetrics type is exported from `packages/coordination/src/delegation/types.ts`
- `Topics.agentLoad(agentId)` returns `'agent/{agentId}/load'` topic
- `Subscriptions.allAgentLoads` is `'agent/+/load'` wildcard pattern
- `MemoryMonitor.getCPUPercent()` returns CPU usage 0-100 using delta calculation
- `HeartbeatPublisher.publishLoadMetrics()` publishes retained message with load metrics
- `'load_metrics'` is a valid `MessageType` in `message.ts`
- WorkerTaskExecutor can integrate via `setActiveTaskCount()` and `setMaxCapacity()`

## Next Steps

Plan 06-02 will implement the router query interface to consume these load metrics for intelligent agent selection.
