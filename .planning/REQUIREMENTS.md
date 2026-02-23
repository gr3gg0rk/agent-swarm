# Requirements: OpenClaw Swarm v1.1

**Defined:** 2026-02-22
**Core Value:** Minerva can assign a task to any agent in the swarm and get a result back

## v1.1 Requirements

Requirements for enhanced coordination capabilities. Each maps to roadmap phases.

### Advanced Routing (ROUT)

- [x] **ROUT-01**: Router selects least-loaded agent matching required capability using heartbeat CPU/memory data
- [ ] **ROUT-02**: Workers report load metrics (CPU, memory, active task count) every 5 seconds via MQTT retained messages
- [x] **ROUT-03**: Router implements weighted scoring (70% load score + 30% historical performance)
- [ ] **ROUT-04**: Agents can reject tasks when overloaded (CPU or memory above 85% threshold)
- [ ] **ROUT-05**: Router retries rejected tasks with exponential backoff (2^n × 100ms, max 5s)
- [ ] **ROUT-06**: Router implements circuit breaker — stops routing to agent after 3 consecutive rejections

### Optimization (OPTI)

- [x] **OPTI-01**: Message batching layer buffers high-frequency messages (progress, metrics, heartbeats)
- [x] **OPTI-02**: Batching uses per-type thresholds (tasks=10ms, status=50ms, heartbeats=100ms)
- [x] **OPTI-03**: MQTT connection pooling reuses connections (2-4 per agent based on hardware)
- [x] **OPTI-04**: Connection pool limits respect hardware (Pi 2B=3, Pi 5=5, Beelink=10)
- [ ] **OPTI-05**: Context references pass IDs for payloads >10KB instead of full content
- [ ] **OPTI-06**: Context manager stores large contexts in SQLite with hash for deduplication

### Checkpointing (CHKP)

- [ ] **CHKP-01**: Checkpoint writes use atomic pattern (temp file + rename) to prevent corruption
- [ ] **CHKP-02**: System keeps last 3 checkpoints for fallback on corruption
- [ ] **CHKP-03**: Checkpoint metadata includes CRC32 checksum validated on recovery
- [ ] **CHKP-04**: Recovery reconciles checkpoint with current state (merge, not overwrite)
- [ ] **CHKP-05**: Vector clocks track checkpoint ordering to tolerate clock skew

### Visualization (VIZ)

- [ ] **VIZ-01**: Dashboard displays agent status list (online/offline, CPU, memory, last heartbeat)
- [ ] **VIZ-02**: Dashboard displays active task progress (task ID, agent, status, % complete)
- [ ] **VIZ-03**: Dashboard displays system metrics overview (total agents, active tasks, queue depth)
- [ ] **VIZ-04**: Dashboard uses lightweight stack (Vite + Alpine.js + Chart.js, ~50MB)
- [ ] **VIZ-05**: Real-time updates via SSE (Server-Sent Events) throttled to 10 updates/second
- [ ] **VIZ-06**: Dashboard deploys on griak-brain only, not Pi 2B workers

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Routing v2

- **ROUT-07**: Multi-capability AND logic — task requires "typescript AND testing"
- **ROUT-08**: Dynamic capability declaration at runtime via MQTT retained messages
- **ROUT-09**: Explainable routing with reasoning reports (TCAR pattern)

### Optimization v2

- **OPTI-07**: Adaptive batching with dynamic window scaling based on load
- **OPTI-08**: Intelligent context caching (LRU with invalidation on change)
- **OPTI-09**: Topic alias optimization for long MQTT topic names

### Checkpointing v2

- **CHKP-06**: Checkpoint compression with gzip for reduced storage
- **CHKP-07**: Incremental checkpoints (only dirty state, not full dumps)
- **CHKP-08**: Rollback to previous checkpoint (time travel capability)

### Visualization v2

- **VIZ-07**: Progress timeline — Gantt chart showing task execution over time
- **VIZ-08**: Capability matrix — visual agent-capability intersections
- **VIZ-09**: Real-time message flow graph (agent-to-agent communication)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time video streaming | Extreme bandwidth/CPU overhead on Pi 2B; no operational value |
| Next.js/React dashboard | 300MB-10GB memory usage; documented leaks in v16.1.0; exceeds 50MB budget |
| WebSocket for dashboard updates | SSE is lighter (~14KB savings) and sufficient for read-only updates |
| External load balancing libraries | generic-proxy, node-http-proxy designed for HTTP, not MQTT |
| Bull/BullMQ for message queuing | Requires Redis (~50MB+ memory); MQTT provides reliability |
| Redis for state or caching | 50-100MB+ RAM; SQLite sufficient for v1.1 scale |
| Browser-based agent control on Pi 2B | Adds entire web stack to constrained hardware |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROUT-01 | Phase 6 | Complete |
| ROUT-02 | Phase 6 | Pending |
| ROUT-03 | Phase 6 | Complete |
| ROUT-04 | Phase 6 | Pending |
| ROUT-05 | Phase 6 | Pending |
| ROUT-06 | Phase 6 | Pending |
| OPTI-01 | Phase 7 | Complete |
| OPTI-02 | Phase 7 | Complete |
| OPTI-03 | Phase 7 | Complete |
| OPTI-04 | Phase 7 | Complete |
| OPTI-05 | Phase 7 | Pending |
| OPTI-06 | Phase 7 | Pending |
| CHKP-01 | Phase 8 | Pending |
| CHKP-02 | Phase 8 | Pending |
| CHKP-03 | Phase 8 | Pending |
| CHKP-04 | Phase 8 | Pending |
| CHKP-05 | Phase 8 | Pending |
| VIZ-01 | Phase 9 | Pending |
| VIZ-02 | Phase 9 | Pending |
| VIZ-03 | Phase 9 | Pending |
| VIZ-04 | Phase 9 | Pending |
| VIZ-05 | Phase 9 | Pending |
| VIZ-06 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

**Phase Mappings:**
- Phase 6 (Advanced Routing): 6 requirements (ROUT-01 through ROUT-06)
- Phase 7 (Optimization): 6 requirements (OPTI-01 through OPTI-06)
- Phase 8 (Checkpointing Gaps): 5 requirements (CHKP-01 through CHKP-05)
- Phase 9 (Visualization): 6 requirements (VIZ-01 through VIZ-06)

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation*
