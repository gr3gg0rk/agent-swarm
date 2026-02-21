# Project Research Summary

**Project:** OpenClaw Swarm - Lightweight Agent Coordination System
**Domain:** Distributed Agent Swarm Coordination Systems
**Researched:** 2026-02-21
**Confidence:** HIGH

## Executive Summary

OpenClaw Swarm is a distributed agent coordination system designed for extreme resource constraints (Raspberry Pi 2B with 1GB RAM). Expert-built systems in this domain use a **hybrid hierarchical architecture** combining centralized orchestration (Minerva) with decentralized worker execution, connected by lightweight message brokers (MQTT) rather than heavy infrastructure (Kafka, Kubernetes). Research confirms this approach: 2026 industry trends favor lightweight edge-capable swarms over cloud-heavy architectures, with successful implementations like PicoClaw achieving sub-10MB RAM footprints.

The recommended approach prioritizes **constrained-hardware-first design**: use MQTT (Mosquitto, ~10MB) for messaging instead of Kafka (500MB+), Better-SQLite3 (~15MB) for state instead of Redis (100MB+), and MessagePack serialization for efficiency. The coordination layer should consume <100MB total per agent, leaving 600MB+ for actual work. Critical risks include communication overload (message storms can cause 3x slowdown), distributed memory desynchronization, and resource exhaustion on Pi 2B. Mitigation strategies include: idempotent task processing with UUIDs, centralized shared state with proper synchronization, resource budgets monitored from Phase 1, and AP-focused agent discovery using gossip protocols for partition tolerance.

## Key Findings

### Recommended Stack

Research confirms a lightweight Node.js stack optimized for 1GB RAM constraints, with MQTT as the message bus and Better-SQLite3 for persistence. This combination leaves 600MB+ headroom for agent work while providing reliable coordination.

**Core technologies:**
- **Node.js (>=22.0.0)**: Runtime required by OpenClaw gateway; async I/O ideal for coordination — ~50-100MB baseline
- **MQTT (Mosquitto 2.0.x)**: Message broker for agent communication — ~3-10MB RAM, industry IoT standard with QoS support and retained messages for discovery
- **Better-SQLite3 (^9.0.0)**: Shared state persistence — ~5-15MB RAM with ACID transactions, WAL mode for concurrency
- **MQTT.js (^5.0.0)**: MQTT client for Node.js agents — ~2-5MB RAM, mature with WebSocket support

**Supporting libraries:**
- **msgpackr (^0.6.0)**: Binary serialization — 3.5x faster than JSON, 15-50% smaller payloads
- **uuid (^11.0.0)**: Agent and task ID generation — distributed unique identifiers
- **p-queue (^8.0.0)**: In-memory task queue — local queuing before MQTT publishing
- **eventemitter3 (^6.0.0)**: Async event handling — decoupling without heavy frameworks

### Expected Features

Research identifies clear table stakes for agent swarms, with differentiators focused on edge capability.

**Must have (table stakes):**
- **Agent Discovery & Registration** — Agents must find each other to coordinate; static config for 4 known machines sufficient for v1
- **Inter-Agent Communication** — Essential for coordination; basic HTTP/JSON messaging adequate
- **Task Delegation & Routing** — Core value; Minerva assigns tasks to capable agents by role
- **Status Reporting & Health Monitoring** — Orchestrator needs visibility; heartbeat every 30s with idle/busy/error status
- **Error Handling & Retry** — Network failures inevitable; three-layer defense (proactive, reactive, recovery)
- **Basic Shared State** — Task queue and progress tracking must be accessible; SQLite on brain machine
- **Agent Lifecycle Management** — Agents crash; supervisor pattern with auto-restart required

**Should have (competitive):**
- **Role-Based Capability Routing** — Agents declare capabilities ("I can debug"), Minerva routes by matching
- **Incremental Checkpointing** — Agents save state periodically; can resume after crash
- **Context Sharing by Reference** — Pass context IDs not full content; reduces bandwidth
- **Sub-10MB Memory Footprint** — Runs on Pi 2B where heavier swarms can't; major competitive moat

**Defer (v2+):**
- **Hybrid Hierarchy with Self-Organization** — Workers self-organize subtasks without Minerva micromanaging
- **Stigmergy-Based Coordination** — Environment-based coordination for massive scale (100+ agents)
- **Autonomous Problem Resolution** — Agents self-heal without human intervention

### Architecture Approach

Research supports a hybrid hierarchical architecture: Minerva (orchestrator) maintains project context and delegates tasks, while worker agents execute independently. Communication flows through a lightweight message bus (MQTT) with shared state persisted centrally.

**Major components:**
1. **Orchestrator (Minerva)** — Maintains project context, delegates tasks to agents, monitors progress, aggregates results
2. **Agent Registry** — Tracks available agents, their capabilities, current status, and machine assignments
3. **Task Queue** — Shared state for pending/in-progress/completed tasks with dependency tracking
4. **Message Bus (MQTT)** — Transports messages between agents, handles routing, provides pub/sub and request/reply
5. **Worker Agents** — Execute assigned tasks, report status, request guidance when needed
6. **State Store** — Maintains shared project state accessible to all instances (SQLite)

**Key patterns:**
- **Actor Model** — Each agent processes messages asynchronously with private state
- **Master-Worker with Task Queue** — Central orchestrator assigns tasks based on capabilities
- **Publish-Subscribe** — Decoupled event broadcasting for status updates
- **Request-Reply** — Synchronous queries for guidance and registry lookups

### Critical Pitfalls

Research from UC Berkeley and Microsoft Azure SRE reveals multi-agent systems have 41-86.7% failure rates without proper precautions.

1. **Communication Overload and Message Storms** — Poor delegation causes exponential message growth; multi-agent systems run 3x slower due to coordination overhead. Avoid with async queues, message batching, and deduplication from Phase 1.

2. **Distributed Memory Desynchronization** — Separate memory banks cause inconsistent state and lost context. Avoid with centralized context store, event-driven synchronization, and commutative state updates.

3. **Agent Coordination Deadlocks and Livelocks** — Circular wait conditions or excessive retry politeness cause system-wide stalls. Avoid with DAG task dependencies, timeout-based escalation, exponential backoff with jitter.

4. **Resource Exhaustion on Constrained Hardware** — Pi 2B (1GB RAM) crashes when agents exceed 75%+ utilization. Avoid by targeting Pi 2B as baseline, keeping utilization below 50-60%, using lightweight OS variants, and enabling ZRAM.

5. **Message Delivery Misconceptions** — "Exactly-once" delivery is impossible at network layer; design for at-least-once + idempotent processing using UUIDs and idempotency keys.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Communication Foundation
**Rationale:** Communication overload (Pitfall #1) and message delivery issues (Pitfall #5) must be addressed first; everything depends on reliable messaging. Research shows message storms can cause 3x slowdown if not designed properly from the start.

**Delivers:** Message bus abstraction, MQTT implementation, protocol definitions, agent discovery with gossip protocol, idempotent task processing

**Addresses:** Agent Discovery & Registration, Inter-Agent Communication (from FEATURES.md)

**Avoids:** Communication overload, message delivery misconceptions, discovery failures during network partitions

**Stack used:** MQTT.js, Mosquitto, uuid (for idempotency), eventemitter3

### Phase 2: Shared State and Agent Core
**Rationale:** Memory desynchronization (Pitfall #2) and network partition handling (Pitfall #9) require centralized state before task delegation begins. Agent core with lifecycle management enables supervision.

**Delivers:** Agent base implementation with lifecycle, heartbeat monitoring, shared state store (SQLite), agent registry with capability tracking

**Uses:** Better-SQLite3, p-queue (for local queuing)

**Implements:** Orchestrator registry, state management components (from ARCHITECTURE.md)

**Addresses:** Basic Shared State, Health Monitoring, Agent Lifecycle Management (from FEATURES.md)

**Avoids:** Distributed memory desynchronization, state inconsistency during partitions

### Phase 3: Task Coordination
**Rationale:** Deadlocks/livelocks (Pitfall #3) and lack of supervision (Pitfall #10) can only be addressed after task scheduling exists. DAG-based task dependencies require the communication and state foundations.

**Delivers:** Task queue implementation, orchestrator delegation logic, worker task execution wrapper, DAG-based scheduling with deadlock detection

**Implements:** Orchestrator (Minerva) task delegation logic, worker agents (from ARCHITECTURE.md)

**Addresses:** Task Delegation & Routing, Error Handling & Retry, Status Reporting (from FEATURES.md)

**Avoids:** Coordination deadlocks, error accumulation, lack of oversight

### Phase 4: Optimization and Differentiation
**Rationale:** Performance optimization and differentiating features should only be added after core coordination works reliably. Role-Based Capability Routing and Checkpointing build on solid foundations.

**Delivers:** Role-Based Capability Routing, Incremental Checkpointing, Context Sharing by Reference, Progress Visualization

**Addresses:** Differentiator features from FEATURES.md

**Uses:** msgpackr (for efficient context serialization)

### Phase 5: OpenClaw Integration
**Rationale:** Integration should happen last to avoid coupling internal design to gateway specifics. pkg/swarm client API provides clean boundary.

**Delivers:** pkg/swarm client API, gateway integration hooks, configuration management for all machine roles

**Implements:** Public API layer (from ARCHITECTURE.md)

### Phase Ordering Rationale

- **Dependencies first**: Communication enables everything; state enables delegation; scheduling enables optimization
- **Pitfall-driven**: Each phase addresses specific critical pitfalls before they can cascade
- **Hardware-aware**: Resource budgets and monitoring from Phase 1 prevent exhaustion on Pi 2B
- **Incremental validation**: Each phase produces testable artifacts before complexity increases

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Shared State):** SQLite schema design for agent/task state needs careful planning; concurrent access patterns on Pi 2B may need tuning
- **Phase 3 (Task Coordination):** DAG-based scheduling implementation has many edge cases; deadlock detection algorithms vary in complexity

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Communication):** MQTT with retained messages is well-documented; standard pub/sub patterns apply
- **Phase 5 (Integration):** Standard client library patterns; OpenClaw API should be straightforward

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | MQTT and SQLite choices validated by multiple official sources; memory footprints verified |
| Features | HIGH | Table stakes confirmed by Google Cloud, IBM, OpenAI sources; differentiators validated by PicoClaw |
| Architecture | MEDIUM | Hybrid hierarchy has strong support; specific project structure is opinionated but pattern-aligned |
| Pitfalls | HIGH | UC Berkeley and Microsoft Azure research provides empirical data; 86.7% failure rate well-documented |

**Overall confidence:** HIGH

### Gaps to Address

- **SQLite concurrency on Pi 2B:** WAL mode performance under concurrent writes needs validation during implementation; may need connection pooling tuning
- **MQTT retained message limits:** Mosquitto defaults may need adjustment for 4-agent swarm; verify during Phase 1 testing
- **MessagePack schema evolution:** No schema definition means careful versioning needed for protocol changes; document MessagePack structure explicitly
- **ZRAM effectiveness:** Claimed 40% memory improvement needs validation on Pi 2B specifically; measure during performance testing

## Sources

### Primary (HIGH confidence)
- MQTT.org official documentation — MQTT protocol specification, QoS levels, retained messages
- Mosquitto official docs — Broker configuration, memory footprint, performance characteristics
- SQLite about page — ACID transactions, WAL mode, concurrency guarantees
- better-sqlite3 GitHub — Node.js bindings, synchronous API performance, prebuilt binaries for ARM
- Google Cloud: Choose Design Pattern for Agentic AI — Swarm pattern guidance, anti-patterns
- OpenAI Swarm Wiki — Architecture patterns, handoff mechanisms
- UC Berkeley Research on Multi-Agent System Failures — 41-86.7% failure rate, 14 failure patterns

### Secondary (MEDIUM confidence)
- IBM 2026 AI and Technology Leader Resolutions — Governance and observability trends
- Agent Design Patterns: Routing (Tencent Cloud) — Router pattern for task delegation
- PicoClaw LinkedIn announcement — Sub-10MB RAM achievement validates edge feasibility
- HiveMQ: Why MQTT Outperforms NATS — MQTT vs NATS comparison with benchmarks
- msgpackr npm documentation and performance benchmarks — 1.5-2 GB/s throughput in Node.js
- SWIM protocol research — Scalable membership for agent discovery
- Consul service discovery documentation — Gossip protocol, AP-focused design

### Tertiary (LOW confidence)
- Various 2025-2026 Chinese blog posts (CSDN, Juejin) — Multi-agent design patterns, MQTT tutorials, edge computing case studies. Generally consistent with primary sources but lacking official verification.

---
*Research completed: 2026-02-21*
*Ready for roadmap: yes*
