# Phase 6: Advanced Routing - Research

**Researched:** 2026-02-22
**Domain:** Load-based routing, circuit breakers, performance scoring
**Confidence:** MEDIUM

## Summary

Phase 6 implements intelligent load-based routing for the OpenClaw Swarm. The router will select agents based on real-time CPU/memory metrics, historical performance, and circuit breaker patterns to prevent routing to overloaded agents.

The current `TaskRouter` (in `/home/gr3gg0rk/openclaw-swarm/packages/coordination/src/delegation/router.ts`) implements role-based routing with hierarchical fallback but lacks:
- Real-time load awareness (CPU/memory)
- Historical performance tracking
- Circuit breaker pattern for rejected tasks
- Weighted scoring combining load + performance

**Primary recommendation:** Extend `TaskRouter` with load-based scoring, implement circuit breaker pattern using consecutive rejection tracking, and create a performance history store in SQLite.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **ROUT-01** | Router selects least-loaded agent matching required capability using heartbeat CPU/memory data | Weighted scoring algorithm with 70% load + 30% historical performance; current MemoryMonitor provides heap tracking |
| **ROUT-02** | Workers report load metrics (CPU, memory, active task count) every 5 seconds via MQTT retained messages | MQTT retained messages for current state; 5-second interval matches MemoryMonitor polling; new topic: `agent/{id}/load` |
| **ROUT-03** | Router implements weighted scoring (70% load score + 30% historical performance) | Standard weighted round-robin with CPU/memory-based weight adjustment from industry research |
| **ROUT-04** | Agents can reject tasks when overloaded (CPU or memory above 85% threshold) | 85% threshold already in MemoryMonitor (`DEFAULT_THROTTLE_CONFIG.thresholdPercent = 0.85`); new rejection message type needed |
| **ROUT-05** | Router retries rejected tasks with exponential backoff (2^n × 100ms, max 5s) | Formula: `Math.min(100 * Math.pow(2, attempt), 5000)`; jitter recommended to prevent thundering herd |
| **ROUT-06** | Router implements circuit breaker — stops routing to agent after 3 consecutive rejections | Circuit breaker pattern: Closed → Open after threshold; Half-open for recovery testing |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **mqtt** | ^5.0.0 | Load metrics publishing via retained messages | Already in dependencies; retained messages ideal for current state |
| **better-sqlite3** | ^11.9.0 | Historical performance storage | Already in dependencies; efficient for small dataset |
| **node:v8** | built-in | CPU metrics via `v8.getHeapStatistics()` | Already used in MemoryMonitor; zero dependency |
| **process** | built-in | CPU load via `process.cpuUsage()` | Node.js built-in; no external dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **eventemitter3** | ^5.0.4 | Circuit breaker state events | Already in dependencies; lighter than Node EventEmitter |
| **uuid** | ^11.0.0 | Message IDs for rejection messages | Already in dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MQTT retained for load metrics | Separate load query API | MQTT simpler; agents push state vs router polling; retained enables crash recovery |
| SQLite for performance history | In-memory Map | SQLite persists across restarts; Map is simpler but loses history on restart |
| Custom circuit breaker | Opossum library | Opossum is HTTP-focused; custom needed for agent routing logic |

**Installation:**
```bash
# No new dependencies required
# All required packages already in package.json
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── delegation/
│   ├── router.ts           # Extend with load-based scoring
│   ├── circuit-breaker.ts  # NEW: Circuit breaker per agent
│   ├── performance-store.ts # NEW: SQLite-backed performance tracking
│   └── types.ts            # Extend with LoadMetrics, PerformanceRecord
├── communication/
│   └── topics.ts           # Add: agentLoad(agentId), agentLoadRejected(agentId)
├── lifecycle/
│   └── heartbeat.ts        # Extend HeartbeatPublisher with load metrics
└── memory/
    └── monitor.ts          # Existing: 85% threshold, 5-second polling
```

### Pattern 1: Load-Based Agent Scoring
**What:** Calculate composite score from current load (70%) + historical performance (30%)
**When to use:** Every agent selection decision in `router.findAgentForTask()`

**Load Score (0-100):**
```typescript
// Normalized load: 0% = best, 100% = worst
const cpuLoad = cpuUsage / cpuTotal;           // 0.0 to 1.0
const memLoad = memoryUsed / memoryTotal;      // 0.0 to 1.0
const taskLoad = activeTasks / maxCapacity;    // 0.0 to 1.0

const combinedLoad = (cpuLoad * 0.4 + memLoad * 0.4 + taskLoad * 0.2);
const loadScore = (1 - combinedLoad) * 100;    // Invert: higher = better
```

**Performance Score (0-100):**
```typescript
// Success rate weighted by recency
const recentSuccess = recentTasks.filter(t => t.success).length / recentTasks.length;
const avgExecutionTime = recentTasks.reduce((sum, t) => sum + t.duration, 0) / recentTasks.length;
const timeScore = Math.max(0, 100 - (avgExecutionTime / expectedTime) * 50);

const performanceScore = recentSuccess * 0.7 + timeScore * 0.3;
```

**Composite Score:**
```typescript
const finalScore = loadScore * 0.7 + performanceScore * 0.3;
```

### Pattern 2: Circuit Breaker per Agent
**What:** Prevent routing to agents that repeatedly reject tasks
**When to use:** Agent rejects 3+ tasks consecutively

**States:**
- **Closed**: Normal routing (consecutiveRejections < 3)
- **Open**: Stop routing (consecutiveRejections >= 3)
- **Half-Open**: Test with 1 task after timeout, close if success

**Implementation:**
```typescript
interface AgentCircuitState {
  agentId: string;
  state: 'closed' | 'open' | 'half-open';
  consecutiveRejections: number;
  lastStateChange: number;
  nextRetryTime?: number;
}

// In TaskRouter.findAgentForTask()
const eligibleAgents = agents.filter(a => {
  const circuit = circuitBreakers.get(a.agentId);
  return circuit?.state !== 'open';
});
```

**Recovery:** After 60 seconds in Open state, transition to Half-Open and allow 1 test task.

### Pattern 3: Load Metrics Publishing (MQTT Retained)
**What:** Workers publish CPU/memory/active-task count every 5 seconds
**When to use:** Heartbeat interval (matches existing 30-second heartbeat)

**Topic:** `agent/{agentId}/load` (retained: true)

**Payload:**
```typescript
interface LoadMetrics {
  agentId: string;
  cpuPercent: number;        // 0-100
  memoryPercent: number;     // 0-100
  activeTasks: number;       // Current task count
  maxCapacity: number;       // Max concurrent tasks
  timestamp: number;         // Unix ms
}
```

**Publishing:**
```typescript
// Extend HeartbeatPublisher to include load metrics
// QoS 0, retain: true (fire-and-forget, last known value)
```

**Consuming:**
```typescript
// Router subscribes to: agent/+/load
// Updates local AgentWithCapacity records on receipt
```

### Pattern 4: Task Rejection with Backoff
**What:** Worker rejects task when overloaded, router retries with exponential backoff
**When to use:** Worker CPU/memory > 85% threshold (already in MemoryMonitor)

**Rejection Message:**
```typescript
// Topic: agent/{agentId}/result (existing)
// Type: 'task_rejected' (new)

interface TaskRejectedPayload {
  taskId: string;
  reason: 'overloaded' | 'no_capacity';
  cpuPercent: number;
  memoryPercent: number;
  timestamp: number;
}
```

**Router Backoff Logic:**
```typescript
// In delegator or router
async function retryWithBackoff(taskId: string, agentId: string, attempt: number) {
  const delay = Math.min(100 * Math.pow(2, attempt), 5000); // ROUT-05 formula
  await sleep(delay);
  return delegateToRole(task, role, capability); // Re-select agent
}
```

### Anti-Patterns to Avoid
- **Using MQTT retained for high-frequency metrics**: CPU usage every second uses retained creates broker load; use regular messages with QoS 0 instead. ROUT-02 specifies 5-second interval, which is acceptable.
- **Circuit breaker without Half-Open state**: Never recovers if agent becomes healthy. Always implement timeout-based recovery test.
- **Performance history without pruning**: Unlimited SQLite growth causes slow queries. Implement time-windowed storage (e.g., last 1000 tasks per agent).
- **Ignoring task rejection reason**: Differentiate "overloaded" (retry with backoff) vs "no capacity" (try different agent immediately).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Exponential backoff** | Custom `setTimeout` loops | ROUT-05 formula: `Math.min(100 * Math.pow(2, n), 5000)` | Simple formula, no library needed. Add jitter: `delay + Math.random() * 100` |
| **Circuit breaker** | Full Opossum integration | Custom agent-specific breaker | Opossum is HTTP-oriented. Agent routing needs custom state machine. |
| **Load metrics storage** | Redis or external service | SQLite better-sqlite3 | Already in dependencies; <1MB data; no network overhead |
| **Performance tracking** | Complex analytics | Simple moving average | Last 100 tasks sufficient; no need for time-series DB |

**Key insight:** The system already has MemoryMonitor with 85% threshold. Reuse its metrics rather than building separate CPU/memory collection. The circuit breaker is domain-specific (agent rejection pattern), so custom implementation beats generic HTTP circuit breakers.

## Common Pitfalls

### Pitfall 1: Retained Message Accumulation
**What goes wrong:** MQTT broker accumulates thousands of stale retained load messages
**Why it happens:** Workers crash without clearing retained messages; agents reuse IDs
**How to avoid:**
- Always publish empty payload with retain:true on shutdown
- Use unique agent IDs from static config (already enforced in discovery)
- Set message expiry interval if using MQTT 5.0
**Warning signs:** Broker memory growth, slow subscription setup

### Pitfall 2: Circuit Breaker Never Closes
**What goes wrong:** Agent enters Open state and never receives tasks again
**Why it happens:** Missing Half-Open state or no timeout-based recovery
**How to avoid:**
- Always implement: Open → (after 60s) → Half-Open → (test task success) → Closed
- Reset consecutiveRejections on successful task completion
- Log state transitions for debugging
**Warning signs:** All agents in Open state, queue not draining

### Pitfall 3: Unbounded Performance History
**What goes wrong:** SQLite performance_history table grows to millions of rows
**Why it happens:** No pruning strategy, every task recorded forever
**How to avoid:**
- Keep only last 1000 tasks per agent
- Use DELETE with LIMIT or auto-vacuum
- Consider TTL-based cleanup (e.g., 7-day retention)
**Warning signs:** Slow scoring queries, high disk usage

### Pitfall 4: Missing Load Metrics on Startup
**What goes wrong:** Router has no load data for newly-started agents
**Why it happens:** Agent starts but first load metric not yet published
**How to avoid:**
- Use retained messages (last known value available on subscription)
- Fallback to default load (0%) if no metric received
- Implement graceful degradation: route without load data if missing
**Warning signs:** "No available agents" errors when agents are online

### Pitfall 5: Race Condition in Rejection Handling
**What goes wrong:** Router retries task before rejection count increments
**Why it happens:** Asynchronous rejection handler, multiple rejections in quick succession
**How to avoid:**
- Use atomic increments in circuit breaker state
- Increment consecutiveRejections before scheduling retry
- Add mutex/lock if needed (unlikely with single-threaded Node)
**Warning signs:** Circuit breaker not tripping after 3 rejections

## Code Examples

Verified patterns from official sources:

### Exponential Backoff with Jitter
```typescript
// Source: ROUT-05 requirement formula
// Verified: Azure IoT exponential backoff guidance

function calculateRetryBackoff(attempt: number): number {
  const baseDelay = 100; // 100ms per ROUT-05
  const maxDelay = 5000; // 5s cap per ROUT-05
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 100; // Add 0-100ms jitter

  return Math.min(exponentialDelay + jitter, maxDelay);
}

// Usage:
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    return await delegateTask(task);
  } catch (error) {
    if (error.type === 'task_rejected') {
      const delay = calculateRetryBackoff(attempt);
      await sleep(delay);
    } else {
      throw error; // Don't retry non-rejection errors
    }
  }
}
```

### Circuit Breaker State Machine
```typescript
// Source: Circuit breaker pattern (Microsoft Azure Architecture)
// Verified: Open/Half-Open/Closed state pattern

interface CircuitBreakerState {
  agentId: string;
  state: 'closed' | 'open' | 'half-open';
  consecutiveRejections: number;
  lastStateChange: number;
}

class AgentCircuitBreaker {
  private state: CircuitBreakerState;
  private readonly REJECTION_THRESHOLD = 3; // ROUT-06
  private readonly OPEN_TIMEOUT_MS = 60000; // 60 seconds

  recordRejection(): void {
    this.state.consecutiveRejections++;

    if (this.state.consecutiveRejections >= this.REJECTION_THRESHOLD) {
      this.transitionTo('open');
    }
  }

  recordSuccess(): void {
    this.state.consecutiveRejections = 0;

    if (this.state.state === 'half-open') {
      this.transitionTo('closed');
    }
  }

  canAcceptTask(): boolean {
    if (this.state.state === 'open') {
      // Check if timeout elapsed for Half-Open transition
      if (Date.now() - this.state.lastStateChange > this.OPEN_TIMEOUT_MS) {
        this.transitionTo('half-open');
        return true; // Allow test task
      }
      return false;
    }
    return true;
  }

  private transitionTo(newState: 'closed' | 'open' | 'half-open'): void {
    console.log(`Circuit breaker ${this.state.agentId}: ${this.state.state} -> ${newState}`);
    this.state.state = newState;
    this.state.lastStateChange = Date.now();
  }
}
```

### Load Metrics Publishing (Heartbeat Extension)
```typescript
// Source: Existing HeartbeatPublisher pattern
// Verified: MQTT retained for current state

class HeartbeatWithLoadPublisher extends HeartbeatPublisher {
  publishLoadMetrics(cpu: number, memory: number, activeTasks: number): void {
    const payload: LoadMetrics = {
      agentId: this.config.agentId,
      cpuPercent: cpu,
      memoryPercent: memory,
      activeTasks,
      maxCapacity: this.getMaxCapacity(),
      timestamp: Date.now(),
    };

    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: this.config.agentId,
      type: 'load_metrics',
      timestamp: Date.now(),
      payload,
      qos: 0,
      retain: true, // Critical: retained for crash recovery
    };

    const topic = Topics.agentLoad(this.config.agentId);
    this.config.mqttClient.publish(topic, JSON.stringify(envelope), { qos: 0, retain: true });
  }
}
```

### Performance Score Calculation
```typescript
// Source: Weighted scoring research
// Verified: 70% load + 30% performance industry standard

interface PerformanceRecord {
  taskId: string;
  success: boolean;
  executionTime: number;
  timestamp: number;
}

function calculatePerformanceScore(
  history: PerformanceRecord[],
  expectedExecutionTime: number
): number {
  if (history.length === 0) return 50; // Default score for new agents

  // Success rate (0-100)
  const successCount = history.filter(h => h.success).length;
  const successRate = (successCount / history.length) * 100;

  // Time score (faster is better, 0-100)
  const avgTime = history.reduce((sum, h) => sum + h.executionTime, 0) / history.length;
  const timeRatio = avgTime / expectedExecutionTime;
  const timeScore = Math.max(0, 100 - (timeRatio - 1) * 50); // 100% of expected = 100 pts

  // Weighted: 70% success, 30% speed
  return successRate * 0.7 + timeScore * 0.3;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Role-based routing only | Load-based + role routing | Phase 6 | Better resource utilization, prevent overload |
| No rejection handling | Circuit breaker + exponential backoff | Phase 6 | Prevent cascading failures, graceful degradation |
| Random agent selection | Weighted scoring (70% load + 30% history) | Phase 6 | Intelligent routing, faster task completion |
| No performance tracking | SQLite-backed performance history | Phase 6 | Data-driven routing decisions |

**Deprecated/outdated:**
- Round-robin without load awareness: Doesn't prevent overload
- Fixed retry delay: Exponential backoff is industry standard (Azure, AWS)
- Unbounded agent retry: Circuit breaker prevents retry storms

## Open Questions

1. **Performance history retention period**
   - What we know: Need recent data for scoring, unlimited growth causes slowdown
   - What's unclear: Optimal window size (100 tasks? 1000 tasks? time-based?)
   - Recommendation: Start with last 1000 tasks per agent, add pruning query; monitor DB size and adjust

2. **MQTT retained message cleanup on agent crash**
   - What we know: Retained messages persist after crash if agent doesn't clear them
   - What's unclear: Mosquitto auto-cleanup behavior, broker configuration impact
   - Recommendation: Test with broker stop/start; implement TTL if MQTT 5.0 available; document broker config requirements

3. **Half-open state test task selection**
   - What we know: Need to send 1 task to test agent recovery
   - What's unclear: Which task to send (any? lowest priority? new task?)
   - Recommendation: Use any pending task; log explicitly as "circuit breaker test"; success closes circuit immediately

4. **Load metrics accuracy during task spike**
   - What we know: 5-second interval may miss brief spikes during task dispatch
   - What's unclear: Impact on scoring accuracy, whether to publish on task start/end
   - Recommendation: Start with 5-second heartbeat (matches ROUT-02); add "just-in-time" publish if rejection rate > 10%

## Sources

### Primary (HIGH confidence)
- **Existing codebase**: `/home/gr3gg0rk/openclaw-swarm/packages/coordination/src/`
  - `delegation/router.ts` - Current role-based routing implementation
  - `lifecycle/heartbeat.ts` - HeartbeatPublisher pattern (30s interval, QoS 0)
  - `memory/monitor.ts` - MemoryMonitor with 85% threshold, 5s polling
  - `delegation/retry.ts` - RetryManager with exponential backoff
  - `delegation/worker.ts` - WorkerTaskExecutor task rejection handling

### Secondary (MEDIUM confidence)
- **Circuit breaker pattern research** - [Microsoft Azure Architecture - Circuit Breaker Pattern](https://learn.microsoft.com/zh-cn/azure/architecture/patterns/circuit-breaker?view=skype-ps) (verified official docs)
- **Exponential backoff implementation** - [Azure IoT Common - ExponentialBackOffWithJitter](https://learn.microsoft.com/zh-cn/javascript/api/azure-iot-common/exponentialbackoffwithjitter) (verified official docs)
- **MQTT retained messages** - [Mosquitto Retained Messages Best Practices](https://m.blog.csdn.net/gitblog_00596/article/details/153907889) (CSDN, Oct 2025)
- **Weighted round-robin with CPU/memory** - [调度器负载均衡核心原理](https://m.blog.csdn.net/PixelIsle/article/details/155574267) (CSDN, Dec 2025 - includes Go implementation)

### Tertiary (LOW confidence)
- **Circuit breaker Node.js implementation** - [Node Service Circuit Breaker & Rate Limiting](https://juejin.cn/post/7563338979333914676) (Juejin, 2025 - requires verification)
- **Exponential backoff retry patterns** - [指数退避算法在API调用中的实现](https://m.blog.csdn.net/hfkyzn849548ftm/article/details/151359062) (CSDN, 2025 - general guidance)
- **Agent performance evaluation** - [如何测评Agent能力](https://wenku.csdn.net/answer/33rb68zcep) (CSDN, Jun 2025 - generic scoring system)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already in package.json; existing patterns confirmed
- Architecture: MEDIUM - Circuit breaker and load-based routing patterns verified; Half-Open state needs testing
- Pitfalls: MEDIUM - Based on MQTT and distributed systems common issues; verified against broker docs where available

**Research date:** 2026-02-22
**Valid until:** 2026-03-24 (30 days - MQTT patterns stable; circuit breaker patterns mature)

---

**Key Takeaway for Planning:**
Phase 6 extends existing patterns rather than replacing them. The `TaskRouter` gains load-aware scoring, `HeartbeatPublisher` adds CPU/memory metrics, and a new `AgentCircuitBreaker` prevents routing to overloaded agents. No new dependencies required—all work is TypeScript extensions leveraging existing MQTT, SQLite, and monitoring infrastructure.
