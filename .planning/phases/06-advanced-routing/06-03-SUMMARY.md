# Plan 06-03: Circuit Breaker, Task Rejection & Exponential Backoff

**Status:** Complete
**Phase:** 06-advanced-routing
**Requirements:** ROUT-04, ROUT-05, ROUT-06

---

## Summary

Implemented circuit breaker pattern, task rejection when overloaded, and exponential backoff retry logic for robust task delegation.

---

## Tasks Completed

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Create circuit breaker implementation with state machine | ✓ | 3195439 |
| 2 | Add task rejection check to WorkerTaskExecutor | ✓ | a6af5b0 |
| 3 | Implement exponential backoff retry in TaskDelegator | ✓ | 7cea00e |
| 4 | Human verification checkpoint | ✓ | - |
| - | Type fixes for circular dependency | ✓ | 9ae6c92 |

---

## Files Modified

### Created
- `packages/coordination/src/delegation/circuit-breaker.ts` - Circuit breaker state machine

### Modified
- `packages/coordination/src/delegation/types.ts`
  - Added `AgentWithCapacity` interface (moved from router.ts to resolve circular dep)
  - Added `CircuitBreakerState` interface
  - Added `TaskRejectedPayload` interface

- `packages/coordination/src/delegation/router.ts`
  - Made `findAgentForTask` generic to accept both `AgentWithCapacity` and `AgentWithLoadMetrics`
  - Added fallback scoring when load metrics not available
  - Import `AgentWithCapacity` from types.ts

- `packages/coordination/src/delegation/worker.ts`
  - Added `isOverloaded()` method - checks CPU/memory >= 85%
  - Added `sendRejection()` method - publishes task_rejected messages
  - Added overload check at start of `executeTask()`

- `packages/coordination/src/delegation/delegator.ts`
  - Added `calculateBackoff()` - 2^n × 100ms, max 5s, with jitter
  - Added `handleTaskRejection()` - handles rejection with circuit breaker tracking
  - Added `retryTask()` - re-selects agent after backoff delay
  - Added `setupRejectionHandler()` - subscribes to task_rejected messages

- `packages/coordination/src/communication/message.ts`
  - Added `'task_rejected'` to MessageType union

---

## Implementation Details

### Circuit Breaker State Machine

```
Closed (normal) --[3 rejections]--> Open (stop routing)
Open --[60s timeout]--> Half-Open (test with 1 task)
Half-Open --[success]--> Closed
Half-Open --[rejection]--> Open
```

- `AgentCircuitBreaker` class manages state per agent
- `CircuitBreakerRegistry` manages breakers for all agents
- Router filters out agents in Open state during selection

### Task Rejection Flow

1. Worker receives task command
2. Checks `isOverloaded()` (CPU or memory >= 85%)
3. If overloaded, publishes `task_rejected` message and returns
4. Delegator receives rejection, records in circuit breaker
5. Calculates backoff delay with jitter
6. Re-selects agent using router (excludes Open agents)
7. Retries delegation

### Exponential Backoff Formula

```
delay = min(2^n × 100ms + random(0-100ms), 5000ms)
```

- n = retry attempt number (0-indexed)
- Jitter prevents thundering herd
- Max 5 retries before notifying Minerva of failure

---

## Key Links

| From | To | Via |
|------|-----|-----|
| worker.ts | memory/monitor.ts | `getMemoryStats()` for overload check |
| worker.ts | agent/{id}/result | `task_rejected` message type |
| delegator.ts | circuit-breaker.ts | `circuitBreakers.recordRejection()` |
| delegator.ts | router.ts | `router.findAgentForTask()` for retry |

---

## Deviations

- Moved `AgentWithCapacity` from router.ts to types.ts to resolve circular dependency
- Made router generic to accept agents with or without load metrics

---

## Requirements Satisfied

- **ROUT-04:** Workers reject tasks when CPU/memory > 85%
- **ROUT-05:** Router retries with exponential backoff (2^n × 100ms, max 5s)
- **ROUT-06:** Circuit breaker stops routing after 3 consecutive rejections

---

## Verification

TypeScript compilation passes:
```bash
npx tsc --noEmit -p packages/coordination/tsconfig.json
# No errors
```
