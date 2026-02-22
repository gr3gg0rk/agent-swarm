# Roadmap: OpenClaw Swarm

**Created:** 2026-02-22
**Depth:** Standard
**Milestone:** v1.1 Enhancements

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-02-22)
- 🚧 **v1.1 Enhancements** - Phases 6-9 (in progress)
- 📋 **v2.0 Advanced** - Future (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-02-22</summary>

### Phase 1: Communication & Discovery ✓
**Goal:** Agents can discover each other and exchange messages reliably across machines
**Plans:** 3 plans

### Phase 2: Shared State & Lifecycle ✓
**Goal:** All agents share consistent view of system state and agent health
**Plans:** 3 plans

### Phase 3: Task Delegation ✓
**Goal:** Minerva can assign tasks to agents and receive results back
**Plans:** 3 plans

### Phase 4: Error Handling & Recovery ✓
**Goal:** System handles failures gracefully and recovers from crashes
**Plans:** 2 plans

### Phase 5: Integration Wiring ✓
**Goal:** Complete all cross-phase integrations identified in v1.0 audit
**Plans:** 1 plan

</details>

### 🚧 v1.1 Enhancements (In Progress)

**Milestone Goal:** Advanced routing, optimization, checkpointing robustness, and operational visibility

- [ ] **Phase 6: Advanced Routing** - Load-aware routing, dynamic capabilities, task rejection
- [ ] **Phase 7: Optimization** - Message batching, connection pooling, context references
- [ ] **Phase 8: Checkpointing Gaps** - Atomic writes, corruption recovery, cross-machine ordering
- [ ] **Phase 9: Visualization** - Web dashboard for agent status, task progress, metrics

## Phase Details

### Phase 6: Advanced Routing
**Goal:** Router intelligently selects agents based on real-time load, capabilities, and historical performance
**Depends on:** Phase 5 (v1.0 Integration Wiring)
**Requirements:** ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05, ROUT-06
**Success Criteria** (what must be TRUE):
  1. Router assigns task to least-loaded agent matching required capability using heartbeat CPU/memory data
  2. Worker can reject task when overloaded (CPU or memory above 85%) and router retries with exponential backoff
  3. Router stops routing to agent after 3 consecutive rejections (circuit breaker pattern)
  4. Workers report load metrics every 5 seconds via MQTT retained messages
  5. Router uses weighted scoring (70% load + 30% historical performance) for agent selection
**Plans:** 3 plans

Plans:
- [ ] 06-01: Load metrics collection and MQTT heartbeat reporting (ROUT-02)
- [ ] 06-02: Load-aware routing algorithm with weighted scoring (ROUT-01, ROUT-03)
- [ ] 06-03: Task rejection, exponential backoff, and circuit breaker (ROUT-04, ROUT-05, ROUT-06)

### Phase 7: Optimization
**Goal:** Message throughput improved 10x through batching, connection pooling, and context reference passing
**Depends on:** Phase 6 (routing metrics provide batching data)
**Requirements:** OPTI-01, OPTI-02, OPTI-03, OPTI-04, OPTI-05, OPTI-06
**Success Criteria** (what must be TRUE):
  1. High-frequency messages (progress, metrics, heartbeats) are buffered and sent in batches
  2. MQTT connections are reused via connection pools (hardware-aware: Pi 2B=3, Pi 5=5, Beelink=10)
  3. Context payloads larger than 10KB are passed by reference ID instead of full content
  4. Context manager stores large contexts in SQLite with hash-based deduplication
  5. Batching uses per-type thresholds (tasks=10ms, status=50ms, heartbeats=100ms)
**Plans:** TBD

Plans:
- [ ] 07-01: Message batching layer with per-type thresholds
- [ ] 07-02: MQTT connection pooling with hardware-aware limits
- [ ] 07-03: Context reference passing and SQLite-based context manager

### Phase 8: Checkpointing Gaps
**Goal:** System recovers from corruption and cross-machine failures without data loss
**Depends on:** Phase 7 (optimization frees memory for robustness features)
**Requirements:** CHKP-01, CHKP-02, CHKP-03, CHKP-04, CHKP-05
**Success Criteria** (what must be TRUE):
  1. Checkpoint writes are atomic (temp file + rename pattern) to prevent corruption
  2. System keeps last 3 checkpoints for fallback on corruption detection
  3. Checkpoint metadata includes CRC32 checksum validated on recovery
  4. Recovery merges checkpoint state with current state (reconciliation, not overwrite)
  5. Vector clocks track checkpoint ordering to tolerate clock skew across machines
**Plans:** TBD

Plans:
- [ ] 08-01: Atomic checkpoint writes with CRC32 checksums
- [ ] 08-02: Multi-checkpoint retention with fallback recovery
- [ ] 08-03: State reconciliation and vector clock ordering

### Phase 9: Visualization
**Goal:** Minerva can view real-time swarm status via lightweight web dashboard
**Depends on:** Phase 6 (routing metrics), Phase 7 (optimized message flow)
**Requirements:** VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-06
**Success Criteria** (what must be TRUE):
  1. Dashboard displays agent status list (online/offline, CPU, memory, last heartbeat)
  2. Dashboard displays active task progress (task ID, agent, status, % complete)
  3. Dashboard displays system metrics overview (total agents, active tasks, queue depth)
  4. Dashboard receives real-time updates via SSE throttled to 10 updates/second
  5. Dashboard runs on griak-brain only (NOT on Pi 2B workers) using Vite + Alpine.js + Chart.js (~50MB)
**Plans:** TBD

Plans:
- [ ] 09-01: Dashboard foundation with Vite + Alpine.js + Chart.js stack
- [ ] 09-02: Agent status, task progress, and metrics views
- [ ] 09-03: SSE real-time updates with throttling

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Communication & Discovery | v1.0 | 3/3 | Complete | 2026-02-21 |
| 2. Shared State & Lifecycle | v1.0 | 3/3 | Complete | 2026-02-21 |
| 3. Task Delegation | v1.0 | 3/3 | Complete | 2026-02-21 |
| 4. Error Handling & Recovery | v1.0 | 2/2 | Complete | 2026-02-22 |
| 5. Integration Wiring | v1.0 | 1/1 | Complete | 2026-02-22 |
| 6. Advanced Routing | v1.1 | 0/3 | Not started | - |
| 7. Optimization | v1.1 | 0/3 | Not started | - |
| 8. Checkpointing Gaps | v1.1 | 0/3 | Not started | - |
| 9. Visualization | v1.1 | 0/3 | Not started | - |

## Dependencies

```
Phase 5: Integration Wiring (v1.0 COMPLETE)
    |
    v
Phase 6: Advanced Routing (load metrics for dashboard)
    |
    v
Phase 7: Optimization (independent, immediate gains)
    |
    v
Phase 8: Checkpointing Gaps (critical reliability)
    |
    v
Phase 9: Visualization (consumes routing + optimization data)
```

## Coverage Summary

| Phase | Requirements | Coverage |
|-------|--------------|----------|
| 6 | 6 | ROUT-01 through ROUT-06 (Advanced Routing) |
| 7 | 6 | OPTI-01 through OPTI-06 (Optimization) |
| 8 | 5 | CHKP-01 through CHKP-05 (Checkpointing) |
| 9 | 6 | VIZ-01 through VIZ-06 (Visualization) |

**Total:** 23 v1.1 requirements mapped
**Unmapped:** 0
**Coverage:** 100%

---
*Roadmap created: 2026-02-22*
*Milestone: v1.1 Enhancements*
