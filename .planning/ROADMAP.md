# Roadmap: OpenClaw Swarm

**Created:** 2026-02-21
**Depth:** Comprehensive
**Phases:** 4

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Communication & Discovery | 3/3 | Ready to execute | - |
| 2. Shared State & Lifecycle | 0/3 | Not started | - |
| 3. Task Delegation | 0/3 | Not started | - |
| 4. Error Handling & Recovery | 0/2 | Not started | - |

## Phases

- [ ] **Phase 1: Communication & Discovery** - Message bus, MQTT implementation, agent registration
- [ ] **Phase 2: Shared State & Lifecycle** - State persistence, heartbeat monitoring, agent supervision
- [ ] **Phase 3: Task Delegation** - Task queue, orchestrator delegation, worker execution
- [ ] **Phase 4: Error Handling & Recovery** - Retry logic, checkpointing, graceful degradation

## Phase Details

### Phase 1: Communication & Discovery

**Goal:** Agents can discover each other and exchange messages reliably across machines

**Depends on:** Nothing (first phase)

**Requirements:** COMM-01, COMM-02, COMM-03, COMM-04, COMM-05, COMM-06, COMM-07, DISC-01, DISC-02, DISC-03, DISC-05, ERRO-03, HARD-01, HARD-02, HARD-05

**Success Criteria** (what must be TRUE):
1. Agent starting on any machine can discover other agents via MQTT retained messages
2. Agent can send a message to a specific agent by ID and receive confirmation
3. Agent can broadcast status updates that all other agents receive
4. Duplicate messages are detected and discarded using idempotency keys
5. MQTT broker runs on Pi 2B with <10MB RAM footprint

**Plans:**
- [ ] 01-01-PLAN.md — MQTT message bus with QoS levels and message envelope structure
- [ ] 01-02-PLAN.md — Agent discovery using retained MQTT messages with duplicate rejection
- [ ] 01-03-PLAN.md — Idempotency, error logging, and complete example agent

---

### Phase 2: Shared State & Lifecycle

**Goal:** All agents share consistent view of system state and agent health

**Depends on:** Phase 1 (communication layer)

**Requirements:** DISC-04, LIFE-01, LIFE-02, LIFE-03, LIFE-05, STAT-01, STAT-04, STAT-05, STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, HARD-03

**Success Criteria** (what must be TRUE):
1. Minerva can query and see real-time status of all agents (idle/busy/error)
2. Shared task queue is accessible to all agents and supports concurrent read/write
3. Agent that crashes is automatically restarted and rejoins the swarm
4. Agent missing 4 consecutive heartbeats is marked offline
5. State persists across agent restarts without data loss

**Plans:** TBD

---

### Phase 3: Task Delegation

**Goal:** Minerva can assign tasks to agents and receive results back

**Depends on:** Phase 2 (state and lifecycle)

**Requirements:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, STAT-02, STAT-03, ERRO-01, ERRO-02, ERRO-04, ERRO-05

**Success Criteria** (what must be TRUE):
1. Minerva can delegate a task to a specific agent by agent ID and receive result
2. Minerva can delegate a task to any agent with a specific role
3. Worker agent receives task, executes it, and publishes completion result
4. Task that times out triggers escalation notification to Minerva
5. Task with dependency waits for prerequisite task to complete first

**Plans:** TBD

---

### Phase 4: Error Handling & Recovery

**Goal:** System handles failures gracefully and recovers from crashes

**Depends on:** Phase 3 (task execution)

**Requirements:** LIFE-04, HARD-04

**Success Criteria** (what must be TRUE):
1. Agent that crashes during task execution resumes from last checkpoint after restart
2. System runs on griak-worker-2 (Pi 2B, 1GB RAM) without OOM errors

**Plans:** TBD

---

## Dependencies

```
Phase 1: Communication & Discovery
    |
    v
Phase 2: Shared State & Lifecycle
    |
    v
Phase 3: Task Delegation
    |
    v
Phase 4: Error Handling & Recovery
```

## Coverage Summary

| Phase | Requirements | Coverage |
|-------|--------------|----------|
| 1 | 15 | COMM (7), DISC (4 of 5), ERRO (1), HARD (3) |
| 2 | 14 | DISC (1), LIFE (4 of 5), STAT (3), STATE (5), HARD (1) |
| 3 | 12 | TASK (6), STAT (2), ERRO (4) |
| 4 | 1 | LIFE (1), HARD (1 continuous) |

**Total:** 42 v1 requirements mapped
**Unmapped:** 0
**Coverage:** 100%

---
*Roadmap created: 2026-02-21*
