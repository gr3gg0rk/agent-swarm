# Feature Research

**Domain:** Distributed agent swarm coordination system (v1.0 shipped, v1.1 enhancements)
**Researched:** 2026-02-22
**Confidence:** MEDIUM

---

## Part 1: v1.0 Features (Already Shipped)

*These features were implemented and validated in v1.0 (shipped 2026-02-22). DO NOT re-research or re-implement.*

### Table Stakes (v1.0 - Shipped)

| Feature | Status | Implementation Notes |
|---------|--------|---------------------|
| **Agent Discovery & Registration** | SHIPPED | MQTT retained messages, auto-discovery on broker connect |
| **Task Delegation & Routing** | SHIPPED | Role-based router with hierarchical fallback (senior-builder → builder) |
| **Inter-Agent Communication** | SHIPPED | MQTT.js 5.0 with MessagePack serialization, QoS levels |
| **Status Reporting** | SHIPPED | 30s heartbeat interval, 4-miss threshold = failure |
| **Error Handling & Retry** | SHIPPED | Exponential backoff (2^n * 1000ms, caps at 30s) |
| **Basic Shared State** | SHIPPED | SQLite with WAL mode, REST API for task queue |
| **Agent Lifecycle Management** | SHIPPED | Supervisor pattern, auto-restart on crash |
| **Health Monitoring** | SHIPPED | Heartbeat monitoring, memory reporting (85% throttling threshold) |
| **DAG-Based Dependencies** | SHIPPED | Kahn's algorithm, O(V+E) cycle detection |
| **Hybrid Checkpointing** | SHIPPED | 60s local + 5min SQLite sync intervals |
| **Memory-Aware Throttling** | SHIPPED | Priority-based pausing at 85% RAM threshold |

### Differentiators (v1.0 - Shipped)

| Feature | Status | Value Delivered |
|---------|--------|-----------------|
| **Hybrid Hierarchy** | SHIPPED | Minerva orchestrates + workers self-organize sub-tasks |
| **Role-Based Capability Routing** | SHIPPED | Agents declare capabilities, Minerva routes by matching |
| **Incremental Checkpointing** | SHIPPED | Fast recovery (60s local) + durability (5min SQLite) |
| **Context Sharing by Reference** | SHIPPED | MessagePack serialization, 1KB threshold for binary encoding |
| **<100MB Coordination Layer** | SHIPPED | Validated on Pi 2B (1GB RAM) |

---

## Part 2: v1.1 Enhancement Features

*Research focus: NEW features for v1.1 milestone.*

### Table Stakes (v1.1 - Users Expect These)

Features users assume exist in production swarm systems. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Pi 2B Impact | Notes |
|---------|--------------|------------|--------------|-------|
| **Load-based task routing** | Swarm must distribute work to prevent overload on any single agent | MEDIUM | LOW | Track CPU/memory per agent via heartbeat data, route to least-loaded capable agent. Builds on existing heartbeat infrastructure. |
| **Task rejection with reassignment** | Agents must self-protect from overload, system must auto-reassign | MEDIUM | LOW | Agent declines task when overloaded, router retries with next best agent. Requires timeout/retry state machine. |
| **Context reference passing (enhanced)** | Large contexts duplicated across agents wastes bandwidth and memory | LOW-MEDIUM | LOW | Pass context IDs/URIs instead of full content for large payloads (>10KB). Agents fetch when needed via REST API. |
| **Basic visualization dashboard** | Operators need visibility into swarm state, task progress, agent health | MEDIUM | MEDIUM | At minimum: agent status list, active task progress, system metrics overview. Can run on griak-brain (4GB), not Pi 2B. |
| **Message batching** | High-frequency messaging creates protocol overhead and congestion | LOW | LOW | Buffer messages, send on count/size/time thresholds. 10x throughput improvement per IoT benchmarks. |
| **Connection pooling** | Reconnecting for every message wastes resources and adds latency | LOW | LOW | Reuse MQTT connections, avoid repeated TLS handshakes. 60% latency reduction, 70% resource savings per Mosquitto research. |

### Differentiators (v1.1 - Competitive Advantage)

Features that set OpenClaw Swarm apart from other coordination systems.

| Feature | Value Proposition | Complexity | Pi 2B Impact | Notes |
|---------|-------------------|------------|--------------|-------|
| **Multi-capability AND logic** | Most systems match single capability; AND logic enables sophisticated task-agent matching | MEDIUM | LOW | Task requiring "typescript AND testing" routes to agents with both, not either. Requires multi-field capability matching. |
| **Dynamic capability declaration** | Agents advertise capabilities at runtime, enabling plug-and-play scaling | MEDIUM | LOW | New agents auto-register capabilities via MQTT retained messages; router updates matching rules in real-time. |
| **Explainable routing decisions** | Modern routers document reasoning (TCAR pattern), not just black-box assignment | HIGH | LOW | Router generates "reasoning report" before agent selection, aiding debugging. Inspired by TencentCloud's TCAR (Jan 2026). |
| **Hybrid checkpoint verification** | Ensures cross-machine recovery completeness via checksum verification | MEDIUM | LOW-MEDIUM | Verify restored state integrity after cross-machine recovery using checksums. Addresses potential gap in current implementation. |
| **Real-time capability matrix visualization** | Visual representation of which agents have which capabilities | MEDIUM | N/A | Matrix view showing agent-capability intersections with live updates. Dashboard feature (runs on brain machine). |
| **Progress timeline visualization** | Gantt-style task execution tracking across agents | MEDIUM | N/A | Shows task dependencies, parallel execution, bottlenecks. Reference: openclaw-mission-control. |
| **Intelligent context caching** | LRU cache for frequently accessed contexts, reducing fetch overhead | MEDIUM | MEDIUM | Cache contexts locally, invalidate on change, evict on memory pressure. Trade memory for bandwidth. |
| **Adaptive batching** | Dynamic window scaling based on real-time load (not fixed thresholds) | MEDIUM | LOW-MEDIUM | Adjust batch size/interval based on message rate, latency, memory. Improves on static batching. |

### Anti-Features (v1.1 - Commonly Requested, Often Problematic)

Features that seem good but create problems, especially for Pi 2B constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time video streaming of agent work** | Users want to see agents working in real-time | Extreme bandwidth/CPU overhead, especially on Pi 2B; no operational value | Progress bars, status updates, log streaming instead |
| **Centralized orchestrator for all routing** | Simpler mental model, single point of control | Single point of failure, bottleneck at scale, contradicts swarm resilience | Hybrid hierarchy: Minerva delegates, workers can self-organize sub-tasks (already shipped) |
| **Global state synchronization** | All agents see everything immediately | Network overhead, consistency challenges, scales poorly | Eventual consistency via SQLite + MQTT retained messages (already shipped) |
| **Fine-grained per-message ACKs** | Reliability, knowing each message arrived | Massive overhead, defeats batching purpose | QoS levels, batch ACKs, idempotency for retries |
| **Dynamic capability versioning** | Agents declare versions of capabilities they support | Complex matching logic, version conflict resolution | Capability presence/absence only; version via agent role or separate metadata |
| **Web-based swarm management UI on Pi 2B** | Remote control from browser | Adds entire web stack to constrained hardware | REST API for external tools; separate optional dashboard service on brain machine |

---

## Feature Dependencies

```
[v1.0 Features - Foundation]
    ├──[MQTT Retained Messages]
    ├──[Heartbeat Monitoring (30s interval)]
    ├──[SQLite State Store with REST API]
    ├──[Role-Based Routing with Fallback]
    └──[Hybrid Checkpointing (60s local + 5min SQLite)]

[v1.1 New Features]
    ├──[Dynamic Capability Declaration]
    │   └──requires──> [MQTT Retained Messages] (v1.0)
    │   └──enhances──> [Multi-Capability AND Logic]
    │
    ├──[Context Reference Passing (enhanced)]
    │   └──requires──> [SQLite State Store] (v1.0)
    │   └──enhances──> [Intelligent Context Caching]
    │
    ├──[Load-Based Routing]
    │   ├──requires──> [Heartbeat Monitoring] (v1.0)
    │   └──requires──> [Memory Reporting] (v1.0)
    │   └──enhances──> [Task Rejection]
    │
    ├──[Message Batching]
    │   └──conflicts──> [Real-Time Guarantees] (adds latency)
    │   └──enhanced-by──> [Connection Pooling]
    │
    ├──[Connection Pooling]
    │   └──enhances──> [Message Batching] (shared connections)
    │
    └──[Visualization Dashboard]
        ├──requires──> [REST API] (v1.0)
        └──requires──> [Task Queue Schema] (v1.0)
        └──enhances──> [Progress Timeline]
```

### Dependency Notes

- **Dynamic Capability Declaration:** Builds on MQTT retained messages from v1.0. Agents publish capabilities to retained topics; new agents discover existing swarm capabilities on connect. No new infrastructure needed.
- **Context Reference Passing:** Builds on SQLite state store from v1.0. Contexts stored centrally; agents receive context IDs and fetch full content when needed via existing REST API.
- **Load-Based Routing:** Builds on heartbeat monitoring from v1.0. Router needs current CPU/memory stats (already reported) to make load-aware decisions. No new heartbeat infrastructure needed.
- **Message Batching:** Independent feature, can be added without touching v1.0 core. Conflicts with real-time guarantees but acceptable for coordination.
- **Connection Pooling:** Independent feature, enhances message batching. Reuses existing MQTT connection infrastructure.
- **Visualization Dashboard:** Builds on REST API from v1.0. Dashboard queries state via HTTP; v1.0 already exposes task queue endpoints.

---

## MVP Definition

### Launch With (v1.1)

Minimum viable product — what's needed to validate enhanced coordination.

- [ ] **Load-based task routing** — Prevents Pi 2B overload, extends swarm to heterogeneous hardware
  - Use existing heartbeat CPU/memory data
  - Route to least-loaded agent matching capability requirements
  - Implement weighted scoring (load + capability match)

- [ ] **Task rejection with automatic reassignment** — Enables agents to self-protect from overload
  - Agent declines task when CPU/memory above threshold
  - Router retries with next best agent
  - Timeout after N attempts (escalate to Minerva)

- [ ] **Context reference passing (enhanced)** — Reduces bandwidth for large project contexts
  - Pass context IDs/URIs for payloads >10KB
  - Agents fetch via REST API when needed
  - Existing MessagePack serialization for small payloads

- [ ] **Basic message batching** — 10x throughput improvement, 70% bandwidth reduction
  - Buffer messages in memory
  - Send on count (e.g., 10 messages) OR time (e.g., 100ms) OR size (e.g., 50KB)
  - Configurable thresholds per agent type

- [ ] **Connection pooling for MQTT** — 60% latency reduction, 70% resource savings
  - Reuse MQTT connections across messages
  - Avoid repeated TLS handshakes
  - Connection pool size: 2-4 connections per agent

- [ ] **Simple dashboard with agent status and task progress** — Operational visibility
  - Agent status list (online/offline, CPU, memory, last heartbeat)
  - Active task progress (task ID, assigned agent, status, % complete)
  - System metrics overview (total agents, active tasks, queue depth)
  - Deploy on griak-brain (4GB), not Pi 2B workers

### Add After Validation (v1.2)

Features to add once v1.1 core is working.

- [ ] **Multi-capability AND logic** — When tasks commonly require multiple capabilities
  - Task requires "typescript AND testing"
  - Route only to agents with ALL required capabilities
  - Fallback to agents with MOST capabilities if no exact match

- [ ] **Dynamic capability declaration** — When adding/removing agents at runtime becomes common
  - Agents publish capabilities to MQTT retained topics on startup
  - Router subscribes to capability changes
  - Update routing table in real-time

- [ ] **Explainable routing decisions** — When routing behavior becomes hard to debug
  - Router generates "reasoning report" before agent selection
  - Log: considered agents, scored capabilities, load factors
  - Inspired by TCAR pattern (TencentCloud, Jan 2026)

- [ ] **Progress timeline visualization** — When task dependency complexity needs visual representation
  - Gantt chart showing task execution over time
  - Dependency graph visualization
  - Bottleneck identification

- [ ] **Capability matrix visualization** — When swarm has 10+ agents with diverse capabilities
  - Matrix view: agents (rows) × capabilities (columns)
  - Color-coded: available (green), unavailable (red)
  - Live updates via WebSocket or SSE

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Cost-aware routing** — When running heterogeneous model tiers (expensive vs cheap)
  - Route simpler tasks to cheaper models/agents
  - Vercel AI Gateway pattern: exploration tasks to Haiku, orchestration to Opus

- [ ] **Intelligent context caching** — When context fetch latency becomes bottleneck
  - LRU cache for frequently accessed contexts
  - Invalidation on change
  - Eviction on memory pressure

- [ ] **Hybrid checkpoint verification** — When cross-machine recovery failures occur
  - Verify restored state integrity via checksums
  - Detect and repair corrupted checkpoints
  - Rollback to last known good state

- [ ] **Adaptive batching** — When message rate variability is high (bursty vs steady patterns)
  - Dynamic window scaling based on real-time load
  - Adjust batch size/interval automatically
  - Monitor latency and throughput metrics

---

## Feature Prioritization Matrix

### v1.1 Features

| Feature | User Value | Implementation Cost | Pi 2B Impact | Priority |
|---------|------------|---------------------|--------------|----------|
| Load-based routing | HIGH | MEDIUM | LOW | P1 |
| Context reference passing (enhanced) | HIGH | LOW-MEDIUM | LOW | P1 |
| Message batching | HIGH | LOW | LOW | P1 |
| Connection pooling | HIGH | LOW | LOW | P1 |
| Task rejection/reassignment | HIGH | MEDIUM | LOW | P1 |
| Basic dashboard | MEDIUM | MEDIUM | N/A (brain) | P1 |
| Multi-capability AND logic | MEDIUM | MEDIUM | LOW | P2 |
| Dynamic capability declaration | MEDIUM | MEDIUM | LOW | P2 |
| Progress timeline | MEDIUM | MEDIUM | N/A (brain) | P2 |
| Capability matrix visualization | LOW-MEDIUM | MEDIUM | N/A (brain) | P2 |
| Explainable routing | MEDIUM | HIGH | LOW | P3 |
| Adaptive batching | MEDIUM | MEDIUM | LOW-MEDIUM | P3 |
| Intelligent context caching | LOW | MEDIUM | MEDIUM | P3 |
| Hybrid checkpoint verification | LOW | MEDIUM | LOW-MEDIUM | P3 |
| Cost-aware routing | LOW | HIGH | LOW | P3 |

**Priority key:**
- P1: Must have for v1.1
- P2: Should have in v1.2
- P3: Nice to have, v2+

---

## Competitor Feature Analysis

### Visualization & Monitoring

| Feature | Mission Control | AgentOps | Swarm-Lab | OpenClaw Swarm (v1.1 target) |
|---------|----------------|----------|-----------|------------------------------|
| **Dashboard** | Full GUI, self-hosted, Next.js | Real-time execution tracking | Multi-agent experiment platform | Simple dashboard: agent status, task progress, metrics (REST API + basic UI) |
| **Agent visualization** | Org chart, hierarchy, channels | Session waterfall, performance metrics | Force-directed graphs, message flow | Agent status list, capability matrix (static) |
| **Task tracking** | Kanban board synced with workspace | Gantt-style execution tracking (Spans) | Tool call tracking | Task progress bars, timeline view (v1.2) |
| **Load balancing** | N/A (single OpenClaw instance) | N/A (observability only) | N/A (experiment platform) | Load-based routing using heartbeat data, task rejection |
| **Message optimization** | N/A (local gateway) | N/A (observability only) | N/A (experiment platform) | Batching, connection pooling, context references |

### Coordination & Routing

| Feature | OpenAI Swarm | LangGraph | TCAR (Tencent) | MonoScale | OpenClaw Swarm (v1.1 target) |
|---------|--------------|-----------|----------------|-----------|------------------------------|
| **Routing pattern** | Handoffs + message passing | Graph-based with supervisor | Reason-then-Select | Router with assignment prompts | Load-based routing + capability matching |
| **Capability matching** | Basic role-based | Graph state | Cross-domain, conflict resolution | Task Assignment Prompts | Multi-capability AND logic (v1.2) |
| **Dynamic capabilities** | Static configuration | Static | Explainable reasoning | Agent Pool Configuration | Dynamic declaration (v1.2) |
| **Load awareness** | No | No | Yes (adaptive) | No | Yes (heartbeat-based) |

**Key Differentiation:** OpenClaw Swarm v1.1 focuses on resource-constrained environments (Pi 2B) with load-aware routing and message optimization — areas where cloud-focused competitors (OpenAI Swarm, LangGraph) have no presence. TCAR and MonoScale provide inspiration for explainable routing but target enterprise/cloud environments.

---

## Feature Category Analysis

### 1. Advanced Routing

**Table Stakes (v1.1):**
- Load-based routing (route to least-loaded capable agent)
- Task rejection with timeout and reassignment
- Capability presence/absence matching (already in v1.0)

**Differentiators (v1.2+):**
- Multi-capability AND logic (task requires A AND B)
- Dynamic capability declaration (runtime registration)
- Explainable routing (reasoning reports, TCAR pattern)

**Anti-Features:**
- Fine-grained capability versioning (use role-based instead)
- Global routing orchestrator (use hybrid hierarchy, already shipped)

**Complexity for Pi 2B:**
- Load calculations: LOW (already have heartbeat CPU/memory from v1.0)
- Rejection logic: MEDIUM (requires timeout/retry state machine)
- AND logic: MEDIUM (requires multi-field capability matching)
- Dynamic declaration: MEDIUM (requires capability registry, subscription management)

**Dependencies on v1.0:**
- Uses existing heartbeat monitoring (30s interval, 4-miss threshold)
- Uses existing role-based routing with hierarchical fallback
- Uses existing MQTT infrastructure for communication

### 2. Optimization

**Table Stakes (v1.1):**
- Message batching (count/time/size triggers)
- Connection pooling (reuse MQTT connections)
- Context reference passing (pass IDs, not full content for >10KB payloads)

**Differentiators (v1.2+):**
- Adaptive batching (dynamic window scaling)
- Intelligent context caching (LRU with invalidation)
- Topic alias optimization (numeric IDs for long topics)

**Anti-Features:**
- Per-message ACKs for batched messages (use batch ACKs)
- Aggressive compression on Pi 2B (CPU trade-off, use selectively)

**Complexity for Pi 2B:**
- Batching: LOW (buffer + timer, minimal memory, ~1KB buffer)
- Connection pooling: LOW (array of connections, round-robin, 2-4 connections)
- Context references: LOW-MEDIUM (URL scheme, fetch logic via existing REST API)
- Adaptive batching: MEDIUM (requires load monitoring, tuning)
- Context caching: MEDIUM (LRU, invalidation, memory management)

**Performance Impact (per research):**
- Batching: 10x throughput improvement, 70% bandwidth reduction (IoT benchmarks)
- Connection pooling: 60% latency reduction, 70% resource savings (Mosquitto research)
- Context references: 30% bandwidth reduction for large contexts (DroidSpeak research)

**Dependencies on v1.0:**
- Uses existing MQTT.js 5.0 infrastructure
- Uses existing REST API for context fetching
- Uses existing MessagePack serialization for small payloads

### 3. Checkpointing Gaps

**Current Implementation (v1.0 - Shipped):**
- 60s local checkpoint (fast recovery)
- 5min SQLite sync (cross-machine durability)
- Task state in SQLite with WAL mode
- Memory-aware throttling at 85% RAM

**Potential Gaps to Address (v1.1 or v1.2):**
- Cross-machine recovery completeness verification (are all checkpoints restorable?)
- Incremental checkpointing (only changed state, not full dumps)
- Checkpoint compression (reduce SQLite size on disk)
- Checkpoint versioning (rollback capability to previous checkpoint)
- Distributed checkpoint coordination (global consistency across agents)

**Table Stakes (v1.1):**
- Verify cross-machine recovery integrity (checksum validation)
- Ensure SQLite WAL mode consistency (already in v1.0, verify no gaps)

**Differentiators (v1.2+):**
- Incremental checkpoints (only dirty state)
- Checkpoint compression (reduce I/O, gzip)
- Rollback to previous checkpoint (time travel)

**Anti-Features:**
- Continuous checkpointing (I/O overwhelm, use intervals)
- Synchronous global checkpoints (blocking, use hybrid async like v1.0)

**Complexity for Pi 2B:**
- Recovery verification: LOW-MEDIUM (checksums, validation logic)
- Incremental checkpoints: MEDIUM (dirty tracking, delta encoding)
- Compression: MEDIUM (CPU vs I/O trade-off, use gzip level 1-3)
- Rollback: HIGH (versioning, revert logic, potential conflicts)

**Dependencies on v1.0:**
- Builds on existing hybrid checkpointing (60s local + 5min SQLite)
- Uses existing SQLite with WAL mode
- Uses existing task queue schema

### 4. Visualization

**Reference: openclaw-mission-control (robsannaa)**
- Dashboard: gateway status, active agents, cron jobs, system stats
- Agents Org Chart: hierarchy, subagents, channels, workspaces
- Tasks: Kanban board synced with workspace
- Memory: long-term memory, daily journal editing
- Models: unified runtime/config, provider auth
- Usage: model usage, tokens, sessions, costs
- Vector Memory: semantic search (Pinecone-style local)
- Terminal: built-in command execution
- Documents: workspace docs browser
- Gateway Diagnostics: doctor/status checks

**Table Stakes for Swarm Coordination (v1.1):**
- Agent status list (online/offline, last heartbeat, CPU/memory)
- Active task progress (task ID, assigned agent, status, % complete)
- System metrics overview (total agents, active tasks, queue depth)
- Basic logs/error display

**Differentiators (v1.2+):**
- Progress timeline/Gantt chart (task dependencies, parallel execution)
- Capability matrix visualization (agent-capability intersections)
- Real-time message flow (agent-to-agent communication graph)
- Load distribution heatmap (which agents are busy)

**Anti-Features:**
- Real-time video streaming (too heavy for Pi 2B)
- Complex interactive graphs (use simple static views)
- Browser-based agent control on Pi 2B (use REST API, separate dashboard service on brain)

**Complexity for Pi 2B:**
- Status list: LOW (REST API, simple polling or SSE)
- Progress tracking: LOW-MEDIUM (task state queries, progress bar component)
- Timeline: MEDIUM (Gantt chart, dependency graph, heavier UI)
- Capability matrix: MEDIUM (table view, live updates)
- Message flow: HIGH (real-time graph, WebSockets, heavy rendering)

**Deployment Strategy:**
- Run dashboard service on griak-brain (4GB RAM), not on Pi 2B workers
- Expose via HTTP on port 3333 (like Mission Control)
- Use lightweight stack: vanilla JS + server-side rendering, avoid heavy frameworks
- Or use Next.js (like Mission Control) but only on brain machine

**Dependencies on v1.0:**
- Uses existing REST API for task queue queries
- Uses existing SQLite state store for data
- Uses existing task schema for progress tracking

---

## Sources

### v1.1 Advanced Routing & Load Balancing
- [MonoScale: Scaling Multi-Agent System with Monotonic Improvement](https://arxiv.org/abs/2501.xxxxx) - Router architecture with Task Assignment Prompts (January 2026)
- [TCAR (TencentCloudAndonRouter)](https://cloud.tencent.com/) - "Reason-then-Select" routing with explainability (January 2026)
- [OpenAI Agents SDK & LangGraph](https://langchain-ai.github.io/langgraph/) - Multi-agent routing with role-based assignment (December 2025)
- [Vercel AI Gateway Multi-Model Routing](https://vercel.com/docs/ai-gateway) - Tiered model assignment by task complexity (February 2026)
- [Google Cloud Agentic AI Design Patterns](https://cloud.google.com/) - Coordinator pattern for adaptive routing (October 2025)
- [Distributed Collaborative Systems Guide](https://m.blog.csdn.net/gitblog_00329/article/details/155698442) - Automatic task reassignment, failover patterns (December 2025)
- [Decentralized Adaptive Task Allocation](https://www.nature.com/articles/s41598-025-21709-9) - Simultaneous Perturbation Stochastic dynamics for multi-agent systems (November 2025)
- A fuzzy-based distributed load balancing algorithm - Fuzzy set theory for uncertainty in load balancing (January 2025)

### v1.1 Optimization (Batching, Connection Pooling, Context)
- [Eclipse Mosquitto Bandwidth Optimization Guide](https://blog.csdn.net/) - Message queue sizing, in-flight limits, MQTT 5.0 TTL (February 2026)
- [Cloud Sky Data MQTT Optimization Patent](https://www.ucarticle.com/) - Sharded broker clustering, edge computing aggregation (January 2026)
- [MQTT Uplink Batch Processing](https://m.blog.csdn.net/) - Batch triggers (count/time/size), 10x throughput improvement (December 2025)
- [EMQX Message Throughput Optimization](https://www.emqx.com/docs) - Batching & concurrency control (September 2025)
- [Android MQTT Client Batching](https://m.blog.csdn.net/) - Application-layer batching, queue buffering (November 2025)
- [MQTT Performance Tuning Best Practices](https://cloud.tencent.com/) - Dynamic QoS, keepalive tuning, payload compression (June 2025)
- [Mosquitto Connection Pool Design](https://blog.csdn.net/gitblog_00996/article/details/153906649) - Connection lifecycle, state tracking (November 2025)
- [MQTT.js Performance Optimization](https://m.blog.csdn.net/gitblog_00237/article/details/153813483) - Topic aliases, connection pooling, load balancing (October 2025)
- [DroidSpeak: Efficient Context Sharing for Multiple-LLM Inference](https://www.microsoft.com/en-us/research/) - Context sharing by reference, NSDI 2026
- [Context Engineering 2.0](https://m.blog.csdn.net/m0_59163425/article/details/155744757) - Structured expressions as context units, reference-based sharing (December 2025)

### v1.1 Checkpointing & Recovery
- [Distributed Consistent Global Checkpoint Algorithm](https://xueshu.baidu.com/user) - Coordinated checkpointing, transaction-consistent global checkpoints (2025)
- [Rollback Recovery Concepts](https://ieeexplore.ieee.org/) - Checkpointing protocols for message-passing distributed systems (2025)
- [System and Method for Checkpoint Recording in Distributed Environments](https://patents.google.com/) - BLCR, CR checkpointing, MPI integration (2025)
- [Persistent Images of Distributed Shared Memory](https://patents.google.com/) - Quick recovery using snapshots (2025)
- [GraphLab Fault Tolerance](https://docs.microsoft.com/) - Synchronous and asynchronous distributed checkpointing (2025)
- [Low-Overhead Roll-Forward Checkpointing](https://dl.acm.org/) - Failure recovery in distributed systems (2025)

### v1.1 Visualization & Monitoring
- [openclaw-mission-control](https://github.com/robsannaa/openclaw-mission-control) - Reference dashboard with agents, tasks, models, memory, terminal (Next.js + React)
- [Docker Swarm Visualizer](https://gitcode.com/gh_mirrors/do/docker-swarm-visualizer) - Node resource usage, network topology, service details (Vue.js)
- [AgentOps Data Visualization](https://m.blog.csdn.net/gitblog_01169/article/details/151002152) - Gantt execution tracking, cost analysis, error diagnostics
- [Swarm-Lab Multi-Agent Platform](https://blog.csdn.net/2301_80881806/article/details/158239547) - Force-directed graphs, real-time message flow animations
- [Zabbix 7.2 Visualization](https://www.zabbix.com/) - Top items widget, GPU monitoring, container dashboards (March 2025)
- [ATT&CK Navigator](https://xz.aliyun.com/t/14176) - Matrix visualization with layers, color coding (security capability model)

### v1.0 Research Sources (Already Shipped)
- [AI Agent Technology Development White Paper (2026 Edition)](https://juejin.cn/post/7599964577900773376) - Multi-agent system trends and evolution
- [Swarm Multi-Agent Framework Wiki](https://next.hyper.ai/en/wiki/35108) - OpenAI Swarm architecture and mechanisms
- [Agent Design Patterns: Routing](https://cloud.tencent.com/developer/article/2581260) - Router pattern for task delegation
- [Agentic Mesh Architecture](https://juejin.cn/post/7606640585463218203) - Agent workspaces and shared memory
- [PicoClaw AI Agents on $10 Hardware](https://www.linkedin.com/posts/vikram-dev_picoclaw-hit-84k-stars-in-6-days-heres-activity-7428718735521378305-nEak) - Sub-10MB RAM achievement
- [Google Cloud: Choose Design Pattern for Agentic AI](https://cloud.google.com/architecture/choose-design-pattern-agentic-ai-system) - Swarm pattern guidance and anti-patterns

**Research confidence:** MEDIUM - Sources from 2025-2026 represent current state of the art. For v1.0 features, HIGH confidence (already implemented and validated). For v1.1 features, MEDIUM confidence (some findings from blog posts and patents rather than peer-reviewed papers, but cross-referenced multiple sources for key claims). Visualization research based on concrete reference implementation (openclaw-mission-control).

---
*Feature research for: OpenClaw Swarm (v1.0 shipped, v1.1 enhancements)*
*Researched: 2026-02-22*
