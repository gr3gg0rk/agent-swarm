# Project State: OpenClaw Swarm

**Last updated:** 2026-02-22

## Project Reference

**Core Value:** Minerva can assign a task to any agent in the swarm and get a result back

**Current Focus:** Phase 4 Gap Closure

## Current Position

**Phase:** 4 - Error Handling & Recovery (GAP CLOSURE)
**Plan:** 3 of 3 (IN PROGRESS)
**Status:** Gap closure - CheckpointManager TaskQueue integration
**Progress:** [██████████] 100%

### Phase 4 Goal

System handles failures gracefully and recovers from crashes. Agents resume from last checkpoint after restart, and the system runs on constrained hardware (Pi 2B, 1GB RAM) without OOM errors.

## Performance Metrics

- **Requirements defined:** 42 v1 requirements
- **Phases planned:** 4 phases
- **Phase 1 requirements:** 15 requirements (COMPLETE)
- **Phase 2 requirements:** 14 requirements (8 COMPLETE - STATE-01 through STATE-05, HARD-03, STAT-04, STAT-05)
- **Phase 3 requirements:** 10 requirements (10 COMPLETE - TASK-01 through TASK-06, STAT-02, STAT-03, ERRO-01, ERRO-02, ERRO-04, ERRO-05)
- **Phase 4 requirements:** 3 requirements (3 COMPLETE - LIFE-04, HARD-04)
- **Phase 1 completion:** 2026-02-21 (3 plans, ~320s execution time)
- **Phase 2 Plan 01 completion:** 2026-02-21 (3 tasks, 201s execution time, 14 files created)
- **Phase 3 Plan 01 completion:** 2026-02-21 (5 tasks, 192s execution time, 5 files created)
- **Phase 3 Plan 02 completion:** 2026-02-21 (5 tasks, 234s execution time, 4 files created)
- **Phase 3 Plan 03 completion:** 2026-02-21 (5 tasks, 423s execution time, 6 files created)
- **Phase 3 completion:** 2026-02-21 (3 plans, ~849s total execution time)
- **Phase 4 Plan 01 completion:** 2026-02-22 (5 tasks, 334s execution time, 8 files created)
- **Phase 4 Plan 02 completion:** 2026-02-22 (4 tasks, 257s execution time, 10 files created)
- **Phase 4 completion:** 2026-02-22 (2 plans, ~591s total execution time)

## Accumulated Context

### Decisions Made

**2026-02-21: SQLite-based Shared State with REST API (Plan 02-01)**
- SQLite database with WAL mode for concurrent access (journal_mode=WAL, synchronous=NORMAL)
- Express REST API on port 3000 with 12 endpoints for task queue, status, and context
- TaskQueue class with prepared statements for CRUD operations
- ContextStore class for key-value project context storage with JSON serialization
- ArchiveManager with daily 2 AM cleanup cron job (tasks >7 days, statuses >30 days)
- Health check endpoint with database connectivity verification
- better-sqlite3@11.9.0 for synchronous database operations (11.7x faster than node-sqlite3)

**2026-02-21: Heartbeat Monitoring and Agent Supervision (Plan 02-02)**
- HeartbeatPublisher with 30-second interval (STAT-01) using QoS 0 per COMM-07
- HeartbeatTracker with 4-miss threshold for offline detection (DISC-04)
- systemd service template with exponential backoff (1s->2s->4s->8s->16s->30s max)
- GracefulShutdown with SIGTERM/SIGINT handlers and 30-second task completion timeout
- Used local Database interface instead of better-sqlite3 types for WSL compatibility

**2026-02-21: Idempotency, Logging, and Codec (Plan 01-03)**
- 5-minute deduplication window for idempotency tracker
- Emergency reset at 10000 entries prevents memory exhaustion
- Structured JSON logging with ErrorContext interface (taskId, agentId, messageId, timestamp, stack)
- 1KB threshold for MessagePack vs JSON selection
- MqttClientMinimal interface renamed to avoid collision with MqttClient class

**2026-02-21: Task Delegation Infrastructure (Plan 03-01)**
- Role-based task router with hierarchical fallback (senior-builder can do builder tasks)
- DAG-based dependency scheduler using Kahn's algorithm for O(V+E) cycle detection
- Timeout monitor with exponential backoff (2^n * 1000ms + jitter, capped at 30s)
- Error classification: transient vs permanent for retry decisions
- Extended Task schema with 7 new fields: dependencies, timeoutMs, retryCount, maxRetries, lastProgressAt, resultPayload, errorType

**2026-02-21: Task Delegation Execution (Plan 03-02)**
- ProgressReporter with 10% threshold AND 30s interval (both conditions apply)
- TaskDelegator with delegateToAgent(), delegateToRole(), cancelTask()
- WorkerTaskExecutor with command handler, timeout monitoring, progress tracking
- TaskCancellation with optimistic cancellation and 5-second acknowledgment timeout
- QoS 0 for progress updates (fire-and-forget), QoS 1 for tasks/results/cancellation (at-least-once)

**2026-02-21: Error Handling with Retry and Guidance (Plan 03-03)**
- RetryManager with shouldRetry(), calculateBackoff(), scheduleRetry()
- Exponential backoff with jitter: 2^n * 1000ms + random(0-1000ms), capped at 30s
- Error classification: transient (retryable) vs permanent (abort) via classifyError()
- GuidanceRequest for agent-to-Minerva guidance with 30s timeout
- TaskDelegator.handleTimeout() delegates to retryManager.scheduleRetry() or notifyMinerva()
- WorkerTaskExecutor.handleFailure() classifies errors, retries transient, aborts permanent
- Minerva notified after max retries exhausted via task_failed message type

**2026-02-22: Incremental Checkpointing for Crash Recovery (Plan 04-01)**
- Hybrid checkpointing: local JSON files every 60 seconds for fast recovery, SQLite sync every 5 minutes for cross-machine recovery
- CheckpointManager with smart filtering: 2-minute minimum threshold, state change detection, active-only checkpointing
- LocalFileStore with atomic write pattern (temp file + rename) prevents corruption on crash
- SQLiteSync with prepared statements for fast checkpoint CRUD operations
- GracefulShutdown extended to sync checkpoints before process exit
- CheckpointTaskStatus renamed from TaskStatus to avoid naming conflict with state module

**2026-02-22: Checkpoint Resume and Memory Management (Plan 04-02)**
- ResumeLogic with checkpoint integrity validation (missing fields, clock skew, progress range, time invested)
- Task relevance checking (cancelled, completed, timeout, dependencies) before resuming
- MemoryMonitor polls process.memoryUsage() and v8.getHeapStatistics() every 5 seconds
- ThrottleController pauses non-critical tasks (priority < 100) at 85% memory, resumes below 80%
- Extended TaskStatus to include 'paused' for memory throttling
- WorkerTaskExecutor integrated with resume logic and memory monitoring

**2026-02-21: Agent Discovery (Plan 01-02)**
- Used Node.js built-in EventEmitter instead of eventemitter3 due to TypeScript typing issues
- eventemitter3@5.0.4 used (6.0.0 doesn't exist)
- MessagePack serialization for all messages (>1KB threshold implemented via @ts-ignore)
- QoS 1 for tasks/results, QoS 0 for heartbeats per COMM-06/COMM-07
- Mosquitto configured with 10MB memory limit for Pi 2B (HARD-02)
- Topic hierarchy: agent/{id}/command, agent/{id}/result, swarm/discovery, swarm/agents/{id}

**2026-02-21: Roadmap Structure**
- Organized into 4 phases based on natural delivery boundaries
- Communication first (enables everything else)
- Shared state second (prevents desynchronization)
- Task delegation third (core value delivery)
- Error handling fourth (robustness)
- [Phase 02-shared-state-lifecycle]: Per-agent HTTP health check server with /health endpoint returning 200/503 status codes for monitoring integration
- [Phase 03]: Task delegation infrastructure with role-based routing, DAG dependencies, exponential backoff timeout
- [Phase 04-error-handling-recovery]: TaskQueue made optional in CheckpointManagerOptions for backward compatibility
- [Phase 04-error-handling-recovery]: TaskStatus.paused mapped to CheckpointTaskStatus.idle for checkpointing decisions
- [Phase 04-error-handling-recovery]: MemoryMonitor.start() moved from constructor to start() method for clear lifecycle

### Key Technical Decisions

From research/SUMMARY.md:

**Stack Chosen:**
- Node.js (>=22.0.0) - Runtime required by OpenClaw
- MQTT (Mosquitto 2.0.x) - Message broker, ~3-10MB RAM
- Better-SQLite3 (^9.0.0) - State persistence, ~5-15MB RAM
- MQTT.js (^5.0.0) - MQTT client, ~2-5MB RAM
- msgpackr (^0.6.0) - Binary serialization
- uuid (^11.0.0) - Agent and task ID generation
- p-queue (^8.0.0) - In-memory task queue
- eventemitter3 (^5.0.4) - Async event handling (not used, migrated to Node.js EventEmitter)

**Architecture:**
- Hybrid hierarchical (Minerva orchestrates, workers execute)
- MQTT pub/sub for communication
- SQLite on griak-brain for shared state
- Agent registry with capability tracking

### Todos

**Immediate:**
1. Run `/gsd:plan-phase 2` to create Phase 2 plans (context gathered)
2. Implement SQLite-based shared state
3. Implement heartbeat monitoring

### Session Handoff

**Stopped at:** Completed 04-03-PLAN.md - Phase 4 complete
**Resume file:** None

### Blockers

None identified

### Risks

**High Priority:**
- SQLite concurrency on Pi 2B needs validation (WAL mode performance)
- MQTT retained message limits may need adjustment for 4-agent swarm

**Medium Priority:**
- MessagePack schema evolution requires careful versioning
- ZRAM effectiveness on Pi 2B needs validation

## Session Continuity

### Last Session (2026-02-21)

**Completed:**
- Project initialization
- Requirements definition (42 v1 requirements)
- Research phase completed (HIGH confidence)
- Roadmap created (4 phases, 100% coverage)
- Phase 1 complete: Communication & Discovery ✓
  - MQTT message bus foundation (01-01)
  - Agent discovery with retained messages (01-02)
  - Idempotency, logging, and codec (01-03)
- Verification passed (5/5 truths, 15/15 requirements)

**Next Session:**
- Run `/gsd:plan-phase 2` to begin Shared State & Lifecycle phase
- Implement SQLite-based shared state
- Implement heartbeat monitoring and agent supervision

### Context Handoff

New sessions should start by reviewing:
1. This STATE.md file
2. .planning/ROADMAP.md (phase structure)
3. .planning/REQUIREMENTS.md (full requirements list)
4. .planning/research/SUMMARY.md (research findings)

Then continue with next phase planning or execution.

---
*State initialized: 2026-02-21*
*Last session: Phase 1 Communication & Discovery complete - ready for Phase 2*
