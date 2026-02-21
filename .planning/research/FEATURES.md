# Feature Research

**Domain:** Agent Swarm Coordination Systems
**Researched:** 2026-02-21
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Agent Discovery & Registration** | Fundamental prerequisite - agents must find each other to coordinate | MEDIUM | Registry-based discovery (like Nacos A2A protocol) or DNS-based naming (Agent Name Service). Must support dynamic agent join/leave. For Pi 2B constraint: use simple in-memory registry, not heavy service mesh. |
| **Task Delegation & Routing** | Core value - orchestrator must assign work to capable agents | MEDIUM | Router pattern with intent classification. Role-based routing (e.g., "send debugging tasks to Vulcan"). Requires capability matching and intent-based dispatch. |
| **Inter-Agent Communication** | Essential for coordination - agents must exchange messages | LOW | Lightweight message passing via JSON over HTTP or WebSocket. Avoid heavy protocols. For 1GB RAM: simple REST endpoints or WebSocket, not full message queue. |
| **Status Reporting** | Orchestrator needs visibility into agent progress | LOW | Periodic heartbeat (15-30s interval) with status: idle/busy/error. Lightweight ping-pong. Critical for detecting failures on constrained hardware. |
| **Error Handling & Retry** | Network/hardware failures inevitable in distributed systems | MEDIUM | Three-layer defense: proactive (timeouts), reactive (retries with exponential backoff), recovery (rollback). Classify errors as retryable vs. abort. |
| **Basic Shared State** | Task queue, progress tracking must be accessible to all | MEDIUM | Simple key-value store or file-based state. For Pi 2B: SQLite or JSON files, not distributed database. Single source of truth on brain machine. |
| **Agent Lifecycle Management** | Agents start/stop/crash - system must handle gracefully | MEDIUM | Supervisor pattern with heartbeat monitoring. Auto-restart failed agents. For Pi 2B: simple process manager, not Kubernetes. |
| **Health Monitoring** | Detect dead/inoperative agents quickly | LOW | Heartbeat mechanism (60s interval standard, 4-miss threshold = failure). Readiness probes for deeper health checks. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Sub-10MB Memory Footprint** | Runs on Raspberry Pi 2B (1GB RAM) where other swarms can't | HIGH | Inspired by PicoClaw (<10MB RAM). Achieve through: Go/Rust implementation, minimal dependencies, no heavy frameworks. Major competitive moat for edge/IoT deployments. |
| **Hybrid Hierarchy with Self-Organization** | Combines control (Minerva) with autonomy (workers self-organize subtasks) | HIGH | Minerva orchestrates high-level, but workers can coordinate peer-to-peer for subtasks. Best of both worlds: structured yet flexible. |
| **Role-Based Capability Routing** | Send tasks to agents by role (Builder, Debugger) not by name | MEDIUM | Agents declare capabilities ("I can debug"), Minerva routes by capability. More flexible than hard-coded agent-to-task mapping. |
| **Incremental Checkpointing** | Agents can resume from last safe state after crash | HIGH | Combine with auto-healing: crash → restart → restore checkpoint → continue. Critical for long-running tasks on unreliable hardware. |
| **Stigmergy-Based Coordination** | Scalable to hundreds of agents without central bottleneck | HIGH | Nature-inspired coordination (ants, termites). Agents coordinate through environment state, not direct messaging. Enables massive scale. |
| **Context Sharing by Reference** | Avoid passing full context between agents | LOW | Share context IDs/pointers, not full content. Agents pull context when needed. Reduces bandwidth, critical for Pi 2B. |
| **Autonomous Problem Resolution** | Agents self-heal without human intervention | HIGH | Agents detect anomalies, retry with alternative approaches, escalate only if persistent. 300%+ efficiency gains reported in 2026 systems. |
| **Progress Visualization** | Real-time view of swarm activity | MEDIUM | Dashboard showing agent states, task queue, progress bars. Not essential for v1, but powerful for operator understanding. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full Mesh Communication** | "Let all agents talk directly to each other" | O(n²) connections. Network explosion. Hard to debug. On Pi 2B: memory exhaustion. | Star or hierarchical topology. Agents talk through Minerva or designated coordinators. |
| **Distributed Consensus (Raft/Paxos)** | "Make state consistent across all nodes" | Extremely complex. High overhead. Overkill for 4-machine swarm. | Single source of truth on brain machine. Agents query Minerva for state. |
| **Real-Time Sync (WebSocket everywhere)** | "Instant updates across all agents" | Constant connection overhead. Bandwidth intensive. Brittle on unstable networks. | Polling or periodic sync (every 15-30s). Eventual consistency is fine for coordination. |
| **Heavy Message Queues (Kafka, RabbitMQ)** | "Reliable message delivery" | Massive resource consumption. Overkill for 4 agents. Pi 2B can't run them. | Simple task queue in memory or SQLite. Direct HTTP messaging. |
| **Kubernetes Orchestration** | "Industry standard for distributed systems" | 512MB RAM minimum. Too heavy for Pi 2B. Over-engineered for 4 agents. | Simple supervisor process. Systemd or custom process manager. |
| **Service Mesh (Istio, Linkerd)** | " sophisticated traffic management, observability" | Hundreds of MB RAM. Complex configuration. YAGNI for 4-machine swarm. | Basic HTTP with timeouts and retries. Simple logging. |
| **Blockchain/Web3 for Trust** | "Decentralized trust between agents" | Massive overhead. Slow. Completely unnecessary for trusted environment. | Simple authentication (API keys, mTLS). Trust via network isolation. |
| **Auto-Scaling Agents** | "Add agents as load increases" | Dynamic agent provisioning is incredibly complex. Hard to reason about. Not needed with fixed 4-machine inventory. | Fixed agent pool. Task queues buffer work. Manual agent assignment. |

## Feature Dependencies

```
[Agent Discovery & Registration]
    ├──requires──> [Network Connectivity]
    └──enhances──> [Agent Lifecycle Management]

[Task Delegation & Routing]
    ├──requires──> [Agent Discovery & Registration]
    ├──requires──> [Inter-Agent Communication]
    └──enhances──> [Role-Based Capability Routing]

[Status Reporting]
    ├──requires──> [Inter-Agent Communication]
    └──enables──> [Health Monitoring]
                  └──enables──> [Agent Lifecycle Management]

[Error Handling & Retry]
    ├──requires──> [Status Reporting]
    └──enhances──> [Agent Lifecycle Management]

[Basic Shared State]
    ├──requires──> [Agent Discovery & Registration]
    └──required-by──> [Task Delegation & Routing]

[Agent Lifecycle Management]
    ├──requires──> [Health Monitoring]
    ├──requires──> [Error Handling & Retry]
    └──enhances──> [Incremental Checkpointing]

[Sub-10MB Memory Footprint]
    ├──constrains──> [All Features]
    └──conflicts──> [Heavy Message Queues]
                    └──conflicts──> [Kubernetes]
                    └──conflicts──> [Service Mesh]
```

### Dependency Notes

- **Agent Discovery enables everything**: Can't route, communicate, or share state without knowing who exists.
- **Inter-Agent Communication is foundational**: Required for task delegation, status reporting, error handling.
- **Health Monitoring enables Lifecycle Management**: Can't restart dead agents if you don't know they're dead.
- **Basic Shared State required for Task Delegation**: Orchestrator needs task queue, progress tracking.
- **Sub-10MB Footprint constrains ALL**: Every feature must be evaluated through "can this run on Pi 2B with 1GB RAM?" lens.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- **[Agent Discovery & Registration]** — Static registration for 4 known machines. Simple config file listing agents. No dynamic discovery needed yet.
- **[Inter-Agent Communication]** — Basic HTTP endpoints. JSON message passing. Keep it dead simple.
- **[Task Delegation & Routing]** — Minerva can send task to specific agent by role. Basic "execute this command" pattern.
- **[Status Reporting]** — Heartbeat every 30s. Status: idle/busy/error. Minerva polls workers.
- **[Basic Shared State]** — SQLite database on brain machine. Task queue, progress tracking. Single writer (Minerva), readers (workers).
- **[Error Handling & Retry]** — Exponential backoff retries. Timeout after 2 minutes. Log all errors.
- **[Health Monitoring]** — Simple heartbeat check. Mark agent as failed after 4 missed heartbeats.
- **[Agent Lifecycle Management]** — Supervisor script on each machine. Restart agent if it crashes. No auto-scaling.

**Rationale**: These are the table stakes features. Without them, you don't have a swarm — you have independent agents. The focus is on proving coordination works across machines.

### Add After Validation (v1.x)

Features to add once core is working.

- **[Role-Based Capability Routing]** — Agents declare capabilities, Minerva routes by capability matching. More flexible than hard-coded roles.
- **[Incremental Checkpointing]** — Agents save state periodically. Can resume after crash. Critical for long tasks.
- **[Context Sharing by Reference]** — Pass context IDs, not full content. Reduces bandwidth.
- **[Progress Visualization]** — Simple web dashboard showing agent states, task queue. Human visibility.

**Rationale**: These improve usability and robustness but aren't required for basic coordination. Add once basic delegation works reliably.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- **[Sub-10MB Memory Footprint]** — Optimize for extreme constraints. Rewrite in Go/Rust if needed.
- **[Hybrid Hierarchy with Self-Organization]** — Allow workers to self-organize subtasks without Minerva micromanaging.
- **[Stigmergy-Based Coordination]** — Experiment with environment-based coordination for massive scale (100+ agents).
- **[Autonomous Problem Resolution]** — Agents detect and self-heal without human intervention.

**Rationale**: These are advanced features. Validate core concept first, then optimize for edge cases and scale.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Agent Discovery & Registration | HIGH | LOW | P1 |
| Inter-Agent Communication | HIGH | LOW | P1 |
| Task Delegation & Routing | HIGH | MEDIUM | P1 |
| Status Reporting | HIGH | LOW | P1 |
| Basic Shared State | HIGH | MEDIUM | P1 |
| Error Handling & Retry | HIGH | MEDIUM | P1 |
| Health Monitoring | HIGH | LOW | P1 |
| Agent Lifecycle Management | MEDIUM | MEDIUM | P1 |
| Role-Based Capability Routing | MEDIUM | MEDIUM | P2 |
| Incremental Checkpointing | MEDIUM | HIGH | P2 |
| Context Sharing by Reference | MEDIUM | LOW | P2 |
| Progress Visualization | LOW | MEDIUM | P3 |
| Sub-10MB Memory Footprint | HIGH | HIGH | P3 |
| Hybrid Hierarchy with Self-Organization | HIGH | HIGH | P3 |
| Stigmergy-Based Coordination | LOW | HIGH | P3 |
| Autonomous Problem Resolution | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (MVP)
- P2: Should have, add when possible (v1.x)
- P3: Nice to have, future consideration (v2+)

## Competitor Feature Analysis

| Feature | OpenAI Swarm | LangGraph | Claude-Flow | PicoClaw | OpenClaw Swarm (Our Approach) |
|---------|--------------|-----------|-------------|----------|------------------------------|
| **Coordination Pattern** | Hierarchical (orchestrator + agents) | Graph-based with supervisor | Hierarchical (queen/workers) + mesh | Lightweight agent spawning | Hybrid hierarchy (Minerva + self-organizing workers) |
| **Communication** | Handoffs + message passing | Graph edges | Hierarchical + peer-to-peer | MCP-based tool calls | HTTP/JSON with status polling |
| **Discovery** | N/A (single process) | N/A (single process) | Runtime capability registration | N/A (embedded) | Static config for 4 known machines |
| **State Management** | Independent contexts | Graph state | Shared memory workspace | In-memory | SQLite on brain machine |
| **Error Handling** | Basic retries | Graph error handling | Not specified | Heartbeat system | Three-layer: proactive, reactive, recovery |
| **Resource Footprint** | Lightweight (Python) | Heavy (LangChain) | Medium | <10MB RAM | Target: <100MB per agent (v1), <50MB (optimized) |
| **Target Environment** | Cloud/edge servers | Cloud/enterprise | Cloud | Edge/IoT ($10 hardware) | Constrained (Pi 2B 1GB RAM) |
| **Scalability** | Dozens of agents | Hundreds | 60+ built-in agents | Single device, subagents | 4 fixed agents (v1), future: tens |

**Key Differentiation**: OpenClaw Swarm is explicitly designed for extreme resource constraints (Pi 2B with 1GB RAM) while maintaining hierarchical coordination. PicoClaw is closest in constraint focus but targets single-device scenarios, not cross-machine coordination.

## Sources

### Core Research Sources (2025-2026)

- [AI Agent Technology Development White Paper (2026 Edition)](https://juejin.cn/post/7599964577900773376) - Multi-agent system trends and evolution
- [Swarm Multi-Agent Framework Wiki](https://next.hyper.ai/en/wiki/35108) - OpenAI Swarm architecture and mechanisms
- [Agent Design Patterns: Routing](https://cloud.tencent.com/developer/article/2581260) - Router pattern for task delegation
- [Agentic Mesh Architecture]((https://juejin.cn/post/7606640585463218203) - Agent workspaces and shared memory
- [PicoClaw AI Agents on $10 Hardware]((https://www.linkedin.com/posts/vikram-dev_picoclaw-hit-84k-stars-in-6-days-heres-activity-7428718735521378305-nEak) - Sub-10MB RAM achievement
- [AI Agent Design Patterns: Exception Handling and Recovery]((https://blog.csdn.net/peraglobal/article/details/157220660) - Three-layer defense architecture
- [Multi-Agent System Architecture Patterns — Robustness & Fault Tolerance]((https://juejin.cn/post/7603677143215226895) - Supervisor pattern with heartbeat
- [Agent Communications toward Agentic AI at Edge]((https://arxiv.org/html/2508.15819v1) - Edge-optimized communication protocols
- [Mod-X: Modular Open Decentralized eXchange Framework]((https://arxiv.org/html/2507.04376v2) - Consensus algorithms (Raft/Paxos) and distributed state
- [Google Cloud: Choose Design Pattern for Agentic AI]((https://cloud.google.com/architecture/choose-design-pattern-agentic-ai-system) - Swarm pattern guidance and anti-patterns
- [IBM 2026 AI and Technology Leader Resolutions]((https://www.ibm.com/cn-zh/think/insights/2026-resolutions-for-ai-and-technology-leaders) - Governance and observability trends
- [Agent Name Service (ANS)](https://www.aminer.cn/pub/682a9189163c01c850fae7bd/agent-name-service-ans-a-universal-directory-for-secure-ai-agent-discovery) - DNS-based agent discovery
- [Lightweight AICP Protocol for Multi-Agent Real-Time Interaction]((https://blog.csdn.net/weixin_52908342/article/details/153925706) - Lightweight inter-agent communication
- [Swarm System Monitoring: 5 Steps for Multi-Agent Health Tracking]((https://blog.csdn.net/gitblog_00209/article/details/152764624) - Health monitoring best practices
- [Strands Agents SDK: Agent Architectures and Observability]((https://aws.amazon.com/blogs/machine-learning/strands-agents-sdk-a-technical-deep-dive-into-agent-architectures-and-observability/) - Mesh vs hierarchical patterns
- [Robust and Efficient Communication in Multi-Agent Systems]((https://arxiv.org/html/2511.11393v1) - Identity-aware message passing
- [K3s Requirements for Raspberry Pi]((https://docs.k3s.io/zh/installation/requirements?os=pi) - Resource requirements for edge orchestration
- [2025: The Year AI Agents Grew Up]((https://www.linkedin.com/pulse/2025-year-ai-agents-grew-up-reasoning-mcp-production-reality-ibrahim-xdmce) - 2026 trends and foundational patterns

### Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table Stakes Features | HIGH | Multiple authoritative sources (Google Cloud, IBM, OpenAI) confirm these are foundational |
| Differentiators | HIGH | PicoClaw validates sub-10MB feasibility; stigmergy well-documented in swarm robotics research |
| Anti-Features | HIGH | Industry consensus (Google, AWS) on avoiding heavy infrastructure for small-scale swarms |
| Constrained Environment Feasibility | HIGH | PicoClaw proves <10MB possible; OpenManus shows 512MB-1GB viable for agents |
| Communication Protocols | MEDIUM | Multiple competing standards (A2A, MCP, AICP); JSON over HTTP is safe choice |

---
*Feature research for: Agent Swarm Coordination Systems*
*Researched: 2026-02-21*
