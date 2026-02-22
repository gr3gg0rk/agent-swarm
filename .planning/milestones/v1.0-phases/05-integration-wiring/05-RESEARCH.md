# Phase 5: Integration Wiring - Research

**Researched:** 2026-02-22
**Domain:** Cross-phase integration wiring
**Confidence:** HIGH

## Summary

Phase 5 is a **gap closure phase** that completes three cross-phase integrations identified during v1.0 verification audits. Unlike previous phases which implemented new features, this phase wires together existing components that were intentionally left as TODO stubs due to lack of dependent implementations.

The three integration gaps are:

1. **WorkerTaskExecutor paused task handling** - ThrottleController sets task status to 'paused', but WorkerTaskExecutor doesn't handle this status during task execution
2. **GuidanceRequest connection to worker error handling** - GuidanceRequest class exists and is fully implemented, but WorkerTaskExecutor.requestGuidanceIfNeeded() has TODO comments instead of actual integration
3. **Minerva notification on retry exhaustion** - RetryManager.notifyExhausted() logs errors instead of sending proper notifications to Minerva via MQTT

**Primary recommendation:** This phase requires minimal new code. Focus on removing TODO stubs and wiring existing components together using established patterns from Phase 3 (delegation) and Phase 4 (memory throttling). All three integrations follow the same pattern: instantiate the component in constructor, call methods in appropriate lifecycle handlers, publish messages via MQTT topics.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HARD-04 | System functions on griak-worker-2 (Pi 2B, 1GB RAM) without OOM | Memory throttling integration prevents OOM via pause handling |
| ERRO-05 | Agents can request guidance from Minerva when encountering ambiguous situations | GuidanceRequest class exists, needs worker integration |
| ERRO-04 | Minerva is notified when task fails after exhausting retries | RetryManager needs MQTT notification instead of console.log |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >=22.0.0 | Runtime environment | Required by OpenClaw |
| MQTT.js | ^5.0.0 | Message bus for all integrations | Already used for task delegation, guidance topics exist |
| uuid | ^11.0.0 | Message ID generation | Already used throughout coordination package |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | No new libraries needed | All components exist; this is wiring only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct instantiation | Dependency injection | Current pattern uses constructor injection, maintain consistency |

**Installation:**
```bash
# No new dependencies needed - all existing packages in coordination package
```

## Architecture Patterns

### Recommended Project Structure
```
packages/coordination/src/delegation/worker.ts  # Modify: wire pause handling, GuidanceRequest
packages/coordination/src/delegation/retry.ts    # Modify: wire Minerva notification
packages/coordination/src/communication/topics.ts # Reference: topic patterns for notifications
```

### Pattern 1: Status-Based Task Flow Control
**What:** WorkerTaskExecutor checks task status before and during execution, handling 'paused' status explicitly
**When to use:** Memory throttling scenarios where ThrottleController pauses tasks externally
**Example:**
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/worker.ts lines 202-314
private async executeTask(command: TaskCommandPayload): Promise<void> {
  const { taskId, payload, timeoutMs, maxRetries = 3 } = command;

  // NEW: Check if task is paused before starting execution
  const task = this.taskQueue.getTask(taskId);
  if (task?.status === 'paused') {
    console.info(`Task ${taskId} is paused, skipping execution`);
    return;
  }

  // During execution: monitor for pause status
  // If memory pressure triggers ThrottleController, task status changes to 'paused'
  // Worker should check status periodically and abort if paused

  const checkInterval = setInterval(() => {
    const currentTask = this.taskQueue.getTask(taskId);
    if (currentTask?.status === 'paused') {
      clearInterval(checkInterval);
      throw new Error('Task paused by memory throttle controller');
    }
  }, 1000);
}
```

### Pattern 2: Agent-to-Minerva Guidance Request
**What:** WorkerTaskExecutor instantiates GuidanceRequest and calls requestGuidance() for ambiguous errors
**When to use:** Error messages contain ambiguous patterns (unclear, uncertain, multiple options)
**Example:**
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/guidance.ts lines 139-195
async requestGuidanceIfNeeded(error: Error, taskId: string): Promise<void> {
  const ambiguousPatterns = [
    /ambiguous/i, /unclear/i, /multiple options/i, /guidance/i, /uncertain/i
  ];

  const isAmbiguous = ambiguousPatterns.some(p => p.test(error.message));
  if (!isAmbiguous) return;

  // NEW: Create GuidanceRequest and call requestGuidance()
  const requestId = await this.guidanceRequest.requestGuidance(
    taskId,
    `Ambiguous situation: ${error.message}`,
    // Optional: extract options from error context
  );

  console.log(`Guidance requested for task ${taskId}, request ID: ${requestId}`);
}
```

### Pattern 3: MQTT Notification for Retry Exhaustion
**What:** RetryManager publishes 'task_failed' message to Minerva topic after max retries
**When to use:** Task fails permanently or exhausts retry budget
**Example:**
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/retry.ts lines 259-284
private async notifyExhausted(taskId: string, error: Error): Promise<void> {
  const task = this.taskQueue.getTask(taskId);
  const errorType = classifyError(error);

  // NEW: Publish MQTT message instead of console.error
  const envelope: MessageEnvelope = {
    messageId: uuidv4(),
    idempotencyKey: uuidv4(),
    from: 'retry-manager',
    to: 'minerva',
    type: 'task_failed',
    timestamp: Date.now(),
    payload: {
      taskId,
      agentId: task?.assignedAgent,
      error: {
        type: errorType,
        message: error.message,
        reason: `Task failed after ${task?.maxRetries ?? 3} retries`
      }
    },
    qos: 1, // At-least-once delivery
    retain: false
  };

  // Publish to Minerva notification topic
  const topic = Topics.taskFailed(); // or Topics.minervaNotification()
  await this.mqttClient.publish(topic, envelope);
}
```

### Anti-Patterns to Avoid
- **Direct console.log in production code**: Use structured logging or MQTT messages instead
- **Silent failures**: Always notify Minerva or log errors explicitly, don't swallow errors
- **TODO comments in shipped code**: Remove all TODO stubs before completing phase

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Guidance request system | Custom MQTT message format | GuidanceRequest class (already implemented) | Request/response pattern with timeout handling already exists |
| Task status monitoring | Polling taskQueue.getTask() manually | ThrottleController.pausedTasks Set | ThrottleController already tracks paused tasks |
| Minerva notification topics | Custom topic names | Topics.taskFailed() or Topics.minervaNotification() | Consistent topic naming convention |

**Key insight:** All three integrations wire existing components. No new classes or patterns needed. Focus on removing TODO stubs and calling existing methods.

## Common Pitfalls

### Pitfall 1: Race Condition in Pause Detection
**What goes wrong:** WorkerTaskExecutor starts task before ThrottleController updates status to 'paused', causing task to run when it shouldn't
**Why it happens:** MemoryMonitor polling (5s interval) may not detect memory pressure before task starts
**How to avoid:** Check task status immediately at start of executeTask(), then monitor during execution with 1-second interval
**Warning signs:** Tasks running during memory pressure, OOM errors despite ThrottleController

### Pitfall 2: Blocking on Guidance Request
**What goes wrong:** WorkerTaskExecutor blocks indefinitely waiting for Minerva guidance response
**Why it happens:** GuidanceRequest.requestGuidance() has 30-second timeout, but worker doesn't handle timeout case
**How to avoid:** Check if guidance response is empty (timeout), then proceed with default behavior or abort task
**Warning signs:** Tasks hanging for 30 seconds, backlog building up

### Pitfall 3: Duplicate Minerva Notifications
**What goes wrong:** Minerva receives multiple notifications for the same task failure
**Why it happens:** RetryManager.notifyExhausted() called from both handleFailure() and handleTimeout()
**How to avoid:** Check task status before notifying, only send if status transitions to 'failed'
**Warning signs:** Minerva log showing duplicate task_failed messages for same taskId

## Code Examples

Verified patterns from existing codebase:

### Pause Status Check (from ThrottleController)
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/memory/throttle.ts lines 67-145
async throttle(stats: MemoryStats): Promise<void> {
  const inProgressTasks = this.taskQueue.getTasks({ status: 'in_progress' });

  for (const task of inProgressTasks) {
    if (task.priority < this.config.priorityThreshold) {
      // Update task status to paused
      this.taskQueue.updateTaskStatus(task.id, 'paused');
      this.pausedTasks.add(task.id);
    }
  }
}
```

### GuidanceRequest Instantiation Pattern
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/guidance.ts lines 114-123
constructor(
  private agentId: string,
  private mqttClient: MqttClient,
  options: GuidanceRequestOptions = {}
) {
  this.responseTimeoutMs = options.responseTimeoutMs ?? 30000;
  this.setupResponseHandler();
}
```

### MQTT Message Publishing Pattern
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/worker.ts lines 472-487
private async sendResult(taskId: string, result: TaskResultPayload): Promise<void> {
  const envelope: MessageEnvelope = {
    messageId: uuidv4(),
    idempotencyKey: uuidv4(),
    from: this.agentId,
    type: 'result',
    timestamp: Date.now(),
    payload: result,
    qos: 1,
    retain: false,
  };

  const topic = Topics.taskResult(this.agentId);
  await this.mqttClient.publish(topic, envelope);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TODO stub for pause handling | Explicit status check + monitoring | Phase 5 | Worker respects ThrottleController pauses |
| TODO stub for guidance | GuidanceRequest integration | Phase 5 | Agents can request Minerva guidance for ambiguous errors |
| console.error for exhaustion | MQTT notification to Minerva | Phase 5 | Minerva receives structured failure notifications |

**Deprecated/outdated:**
- TODO comments in WorkerTaskExecutor.requestGuidanceIfNeeded() (line 426)
- TODO comments in WorkerTaskExecutor.handleTimeout() (line 456)
- TODO comments in RetryManager.notifyExhausted() (line 276)

## Open Questions

1. **Minerva notification topic naming**
   - What we know: Topics.taskFailed() exists, Topics.guidanceRequest() exists
   - What's unclear: Should retry exhaustion use dedicated topic or re-use task_failed?
   - Recommendation: Create Topics.minervaNotification() for clarity, or use 'task_failed' type with exhausted retry reason

2. **Guidance timeout handling**
   - What we know: GuidanceRequest has 30-second timeout, returns empty string on timeout
   - What's unclear: Should worker abort task or proceed with default behavior on timeout?
   - Recommendation: Log warning and proceed with default behavior (don't block indefinite)

3. **Pause check interval**
   - What we know: MemoryMonitor polls every 5 seconds
   - What's unclear: How frequently should WorkerTaskExecutor check for pause status?
   - Recommendation: Check at task start, then every 1 second during execution (catches pause quickly without overhead)

## Sources

### Primary (HIGH confidence)
- /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/worker.ts - WorkerTaskExecutor implementation with TODO stubs
- /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/guidance.ts - GuidanceRequest class (fully implemented)
- /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/retry.ts - RetryManager with notifyExhausted() TODO
- /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/memory/throttle.ts - ThrottleController pause implementation
- /home/gr3gg0rk/openclaw-swarm/.planning/phases/04-error-handling-recovery/04-02-PLAN.md - Memory throttling requirements
- /home/gr3gg0rk/openclaw-swarm/.planning/phases/03-task-delegation/03-03-PLAN.md - Error handling requirements
- /home/gr3gg0rk/openclaw-swarm/.planning/REQUIREMENTS.md - ERRO-04, ERRO-05, HARD-04 requirements

### Secondary (MEDIUM confidence)
- /home/gr3gg0rk/openclaw-swarm/.planning/phases/03-task-delegation/03-VERIFICATION.md - TODO stub documentation (lines 107-109)
- /home/gr3gg0rk/openclaw-swarm/.planning/phases/04-error-handling-recovery/04-VERIFICATION.md - Gap analysis (lines 173-179)

### Tertiary (LOW confidence)
- None - all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed, all existing components verified
- Architecture: HIGH - Integration patterns follow existing Phase 3/4 patterns
- Pitfalls: HIGH - Race conditions and blocking issues well-understood from similar integrations

**Research date:** 2026-02-22
**Valid until:** 30 days (stable integration phase, no external dependencies)

## Key Integration Points

### Integration 1: Pause Handling (HARD-04)
**Files to modify:**
- `packages/coordination/src/delegation/worker.ts` - WorkerTaskExecutor.executeTask()
- `packages/coordination/src/delegation/worker.ts` - WorkerTaskExecutor.requestGuidanceIfNeeded()

**Changes:**
1. Add GuidanceRequest to constructor (optional parameter)
2. Check task status at start of executeTask()
3. Monitor task status during execution (1-second interval)
4. Abort if task status becomes 'paused'

### Integration 2: Guidance Request (ERRO-05)
**Files to modify:**
- `packages/coordination/src/delegation/worker.ts` - WorkerTaskExecutor.requestGuidanceIfNeeded()

**Changes:**
1. Import GuidanceRequest class
2. Add guidanceRequest field to class
3. Replace TODO with actual guidanceRequest.requestGuidance() call
4. Handle timeout case (empty response)

### Integration 3: Minerva Notification (ERRO-04)
**Files to modify:**
- `packages/coordination/src/delegation/retry.ts` - RetryManager.notifyExhausted()

**Changes:**
1. Import MqttClient and MessageEnvelope (already imported)
2. Import Topics (already imported)
3. Replace console.error with MQTT message publish
4. Create task_failed envelope with retry exhaustion details
5. Publish to Minerva topic

## Testing Recommendations

1. **Pause handling test:** Simulate memory pressure, verify worker aborts paused tasks
2. **Guidance request test:** Inject ambiguous error, verify GuidanceRequest called
3. **Retry exhaustion test:** Force task to fail 4 times, verify Minerva notification sent
4. **Integration test:** Full scenario with memory pressure + guidance + retry exhaustion
