# Requirements: OpenClaw Swarm

**Defined:** 2026-02-21
**Core Value:** Minerva can assign a task to any agent in the swarm and get a result back

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Communication

- [x] **COMM-01**: Agents can discover each other across machines using MQTT retained messages
- [x] **COMM-02**: Agents can send messages to specific agents by ID using MQTT pub/sub
- [x] **COMM-03**: Agents can broadcast status updates to all interested parties via MQTT topics
- [x] **COMM-04**: All task-related messages use idempotency keys (UUIDs) to prevent duplicate processing
- [x] **COMM-05**: Message broker (Mosquitto) runs with <10MB RAM footprint on constrained hardware
- [x] **COMM-06**: MQTT QoS 1 is used for task assignments and results (at-least-once delivery)
- [x] **COMM-07**: MQTT QoS 0 is used for heartbeats and non-critical status updates

### Agent Discovery

- [x] **DISC-01**: Agents register themselves on startup with their ID, role, and capabilities
- [x] **DISC-02**: Minerva can query which agents are currently available and their capabilities
- [x] **DISC-03**: Agent registration is persisted in retained MQTT messages for crash recovery
- [x] **DISC-04**: Agents are marked offline after missing 4 consecutive heartbeats (2-minute timeout at 30s intervals)
- [x] **DISC-05**: Static configuration file defines the 4 known machines (griak-brain, griak-server, griak-worker-1, griak-worker-2)

### Task Delegation

- [x] **TASK-01**: Minerva can delegate a task to a specific agent by agent ID
- [x] **TASK-02**: Minerva can delegate a task to any agent with a specific role (e.g., "builder", "debugger")
- [ ] **TASK-03**: Tasks include unique IDs, capability requirements, priority, and context
- [ ] **TASK-04**: Tasks have explicit timeout values (default 2 minutes) that trigger escalation
- [ ] **TASK-05**: Minerva can cancel in-progress tasks and workers acknowledge cancellation
- [x] **TASK-06**: Task dependencies are tracked (Task B depends on Task A completing first)

### Status Reporting

- [x] **STAT-01**: Agents publish heartbeat messages every 30 seconds with status (idle/busy/error)
- [ ] **STAT-02**: Agents publish progress updates when working on long-running tasks
- [ ] **STAT-03**: Agents publish completion results when tasks finish (success or failure)
- [x] **STAT-04**: Minerva maintains real-time view of all agent statuses
- [x] **STAT-05**: Status history is persisted for debugging and audit purposes

### Shared State

- [x] **STATE-01**: Shared state is stored in SQLite database on griak-brain
- [x] **STATE-02**: Task queue is queryable by all agents (pending, in-progress, completed)
- [x] **STATE-03**: Project context is stored centrally and accessible to agents on request
- [x] **STATE-04**: State updates use WAL mode for concurrent read/write access
- [x] **STATE-05**: Database file stays under 50MB with automatic cleanup of old completed tasks

### Error Handling

- [x] **ERRO-01**: Failed tasks are automatically retried with exponential backoff (max 3 retries)
- [x] **ERRO-02**: Errors are classified as retryable (network timeout) vs abort (invalid input)
- [x] **ERRO-03**: All errors are logged with full context (task ID, agent, timestamp, stack trace)
- [x] **ERRO-04**: Minerva is notified when a task fails after exhausting retries
- [x] **ERRO-05**: Agents can request guidance from Minerva when encountering ambiguous situations

### Agent Lifecycle

- [x] **LIFE-01**: Agents start automatically on machine boot via supervisor script
- [x] **LIFE-02**: Agents that crash are automatically restarted by supervisor
- [x] **LIFE-03**: Agents gracefully shutdown on SIGTERM, completing current task if possible
- [x] **LIFE-04**: Agent restart preserves in-progress task state via checkpointing
- [x] **LIFE-05**: Health check endpoint verifies agent is responsive (not just running)

### Hardware Constraints

- [x] **HARD-01**: Coordination layer (minus agent work) uses <100MB RAM per machine
- [x] **HARD-02**: MQTT broker uses <10MB RAM on Pi 2B
- [x] **HARD-03**: SQLite state store uses <15MB RAM on Pi 2B
- [x] **HARD-04**: System functions on griak-worker-2 (Pi 2B, 1GB RAM) without OOM
- [x] **HARD-05**: Message payloads over 1KB are serialized with MessagePack for efficiency

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Routing

- **ROUT-01**: Agents dynamically declare capabilities at runtime (not just config file)
- **ROUT-02**: Minerva routes tasks based on agent load (not just availability)
- **ROUT-03**: Tasks can specify multiple required capabilities (AND logic)
- **ROUT-04**: Workers can reject tasks if overloaded, triggering reassignment

### Checkpointing

- **CHKP-01**: Agents checkpoint task progress every 60 seconds
- **CHKP-02**: Checkpoints are stored in shared state for cross-machine recovery
- **CHKP-03**: Interrupted tasks resume from last checkpoint after agent restart
- **CHKP-04**: Checkpoint data includes partial results and working context

### Optimization

- **OPTI-01**: Context is shared by reference (IDs) rather than full content
- **OPTI-02**: Message batching reduces network overhead for high-frequency updates
- **OPTI-03**: Connection pooling for SQLite reduces concurrent access overhead
- **OPTI-04**: Memory usage stays under 50MB for coordination layer alone (without agent work)

### Visualization

- **VIS-01**: Web dashboard shows real-time agent status and task queue
- **VIS-02**: Task progress bars with percentage completion
- **VIS-03**: Historical task execution timeline
- **VIS-04**: Agent capability matrix visualization

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time chat between agents | Not core to coordination; adds complexity |
| Kubernetes orchestration | 512MB RAM minimum; too heavy for Pi 2B |
| Distributed consensus (Raft/Paxos) | Overkill for 4-machine swarm; single source of truth sufficient |
| Service mesh (Istio, Linkerd) | Hundreds of MB RAM; YAGNI for 4 agents |
| Auto-scaling agents | Fixed 4-machine inventory; no dynamic provisioning needed |
| Cloud-based message broker | Must be fully self-hosted on local machines |
| gRPC for communication | Heavier than MQTT; protobuf schemas add complexity |
| Redis for state | 50-100MB+ RAM; SQLite sufficient for v1 scale |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMM-01 | Phase 1 | Complete |
| COMM-02 | Phase 1 | Complete |
| COMM-03 | Phase 1 | Complete |
| COMM-04 | Phase 1 | Complete |
| COMM-05 | Phase 1 | Complete |
| COMM-06 | Phase 1 | Complete |
| COMM-07 | Phase 1 | Complete |
| DISC-01 | Phase 1 | Complete |
| DISC-02 | Phase 1 | Complete |
| DISC-03 | Phase 1 | Complete |
| DISC-04 | Phase 2 | Complete |
| DISC-05 | Phase 1 | Complete |
| TASK-01 | Phase 3 | Complete |
| TASK-02 | Phase 3 | Complete |
| TASK-03 | Phase 3 | Pending |
| TASK-04 | Phase 3 | Pending |
| TASK-05 | Phase 3 | Pending |
| TASK-06 | Phase 3 | Complete |
| STAT-01 | Phase 2 | Complete |
| STAT-02 | Phase 3 | Pending |
| STAT-03 | Phase 3 | Pending |
| STAT-04 | Phase 2 | Complete |
| STAT-05 | Phase 2 | Complete |
| STATE-01 | Phase 2 | Complete |
| STATE-02 | Phase 2 | Complete |
| STATE-03 | Phase 2 | Complete |
| STATE-04 | Phase 2 | Complete |
| STATE-05 | Phase 2 | Complete |
| ERRO-01 | Phase 3 | Complete |
| ERRO-02 | Phase 3 | Complete |
| ERRO-03 | Phase 1 | Complete |
| ERRO-04 | Phase 3 | Complete |
| ERRO-05 | Phase 3 | Complete |
| LIFE-01 | Phase 2 | Complete |
| LIFE-02 | Phase 2 | Complete |
| LIFE-03 | Phase 2 | Complete |
| LIFE-04 | Phase 4 | Complete |
| LIFE-05 | Phase 2 | Complete |
| HARD-01 | Phase 1 | Complete |
| HARD-02 | Phase 1 | Complete |
| HARD-03 | Phase 2 | Complete |
| HARD-04 | Phase 1, 2, 3, 4 | Complete |
| HARD-05 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after roadmap creation*
