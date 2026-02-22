# Phase 3: Task Delegation - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Minerva assigns tasks to agents (by ID or role), workers execute them and report back, with timeout handling, dependencies, and retry logic. Task creation and cancellation are in scope. Agent supervision and checkpointing are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Task routing
- Role-based routing: match agents by role with hierarchical fallback (e.g., senior-builder can do builder tasks)
- Strict priority dispatch: highest priority tasks always dispatched first, even if waiting for specific agent
- Multi-task agents: workers can handle multiple tasks concurrently up to declared capacity
- Agent-declared capacity: each agent sets its own max concurrent tasks at registration
- Rejection allowed: workers reject tasks only if at capacity
- Re-queue at front: rejected tasks go to front of queue for immediate re-dispatch

### Result reporting
- Periodic progress updates: workers send updates at fixed intervals (every 10% or 30s)
- Structured JSON output: task results include success/failure + structured data object
- Keep partial results: failed tasks can return partial results for debugging or resumption
- Hybrid storage: structured results in SQLite, large outputs in shared filesystem

### Timeout & retry
- Default + override: 2-minute default timeout, task creator can override per-task
- Auto-retry first: timed out tasks automatically retry with exponential backoff + jitter
- Minerva notified after exhaustion: orchestrator only notified after max retries exhausted
- Per-task retry limit: task creator sets max retries at delegation (no fixed limit)

### Dependency management
- Fail on prereq failure: dependent task fails if prerequisite fails
- Explicit dependency declaration: dependencies set at task creation time
- Claude's discretion: circular dependency handling approach (reject at creation vs runtime detection)

### Claude's Discretion
- Exact progress update interval (10% vs 30s vs other)
- Circular dependency detection approach
- Backoff jitter implementation details
- File storage path structure for large results

</decisions>

<specifics>
## Specific Ideas

- "Based on agent's role, ability, and tools/permissions — primarily role"
- Hierarchical roles allow flexible fallback (senior-builder → builder)
- Partial results preserved for debugging failed tasks
- Exponential backoff with jitter prevents thundering herd on retries

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-task-delegation*
*Context gathered: 2026-02-21*
