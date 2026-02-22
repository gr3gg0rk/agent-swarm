# OpenClaw Swarm

## What This Is

A lightweight agent swarm coordination layer for OpenClaw that enables 4 independent OpenClaw instances running on separate machines to work together as a cohesive team. Minerva (the brain agent) delegates tasks to specialized agents running on worker machines, who execute work and report back. The system supports cross-machine delegation, shared project state, role-aware task routing, crash recovery with checkpointing, and memory-aware task throttling for constrained hardware.

## Core Value

**Minerva can assign a task to any agent in the swarm and get a result back.** Everything else — shared state, communication protocols, progress reporting — supports this fundamental capability.

## Requirements

### Validated

- ✓ Agents can discover and communicate across machines — v1.0 (MQTT retained messages, MessagePack serialization)
- ✓ Minerva can delegate tasks to agents by role — v1.0 (role-based router, hierarchical fallback)
- ✓ Agents can report status and results back — v1.0 (progress tracking, QoS levels)
- ✓ Agents can request guidance from Minerva — v1.0 (30s timeout, MQTT-based)
- ✓ Shared project state accessible to all instances — v1.0 (SQLite with WAL mode, REST API)
- ✓ Task routing respects agent capabilities — v1.0 (capability matching, DAG dependencies)
- ✓ System runs on constrained hardware — v1.0 (Pi 2B with 1GB RAM, <100MB coordination layer)
- ✓ Crash recovery with checkpointing — v1.0 (60s local + 5min SQLite sync)
- ✓ Memory-aware task throttling — v1.0 (85% threshold, priority-based pausing)

### Active

(None — all v1 requirements validated)

### Out of Scope

- Cloud-based services — must be fully self-hosted
- Real-time collaboration features (presence, live cursors) — not core to coordination
- Web UI for swarm management — future enhancement
- Agent marketplace or plugin system — out of scope for v1

## Context

### Current State

**Shipped v1.0 (2026-02-22):**
- 166,441 lines TypeScript code
- 53 TypeScript modules across 5 phases
- 42 requirements validated (100% coverage)
- Tech stack: Node.js 22+, MQTT.js 5.0, Better-SQLite3 11.9, Mosquitto 2.0
- MQTT broker: <10MB RAM on Pi 2B
- SQLite state store: <15MB RAM on Pi 2B
- Coordination layer: <100MB RAM total per machine

**Hardware validated:**
- griak-brain (Beelink T4, 4GB) — Minerva orchestrator
- griak-server (Pi 5, 8GB) — Vulcan builder
- griak-worker-1 (Pi 3B, 1GB) — Multi-role worker
- griak-worker-2 (Pi 2B, 1GB) — Multi-role worker with memory throttling

### Machine Inventory

| Machine | Hardware | RAM | Primary Agent | Role | Subagents |
|---------|----------|-----|---------------|------|-----------|
| griak-brain | Beelink T4 (Intel Atom x5-Z8500) | 4GB | Minerva | Orchestrator, project context, delegation | Planning, Researching |
| griak-server | Raspberry Pi 5 | 8GB | Vulcan | Builder, executor | Debug, Test |
| griak-worker-1 | Raspberry Pi 3B | 1GB | Flexible | Multi-role | As assigned |
| griak-worker-2 | Raspberry Pi 2B | 1GB | Flexible | Multi-role | As assigned |

### Agent Roles

- **Minerva (Brain)**: Full project context, determines which agents are suited for tasks, primary user liaison
- **Vulcan (Builder)**: Code construction, debugging, testing
- **Planning agents**: Create project plans, break down tasks
- **Research agents**: Research tech stacks, patterns, solutions
- **Executor agents**: Implement code, run commands
- **Debug agents**: Debug issues, fix bugs
- **Test agents**: Write and run tests
- **Verifier agents**: Confirm project goals achieved

### Coordination Model

- **Hybrid hierarchy**: Minerva orchestrates, but workers can self-organize for sub-tasks
- **Single source of truth**: Minerva maintains project state and context
- **Specialist knowledge**: Workers know their piece, ask Minerva for context when needed
- **Delegation flow**: Minerva → determine best agent → assign task → monitor progress → receive result

## Constraints

- **Hardware**: griak-worker-2 (Pi 2B) has only 1GB RAM — coordination layer must be extremely lightweight
- **Self-hosted**: No cloud services, all data stays on local machines
- **Network**: Machines are on same network (gigabit ethernet available)
- **OpenClaw dependency**: Build on top of existing OpenClaw gateway infrastructure

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MQTT for communication | Lightweight (<10MB), retained messages, pub/sub | ✓ Good — scales to 4 agents |
| SQLite for shared state | <15MB RAM, WAL mode, simple deployment | ✓ Good — concurrent access works |
| MessagePack for serialization | Binary format, 1KB threshold | ✓ Good — reduces wire size |
| Hybrid hierarchy (brain + workers) | Balance control with autonomy | ✓ Good — clear delegation flow |
| Role-based task routing | Capability matching, hierarchical fallback | ✓ Good — senior-builder → builder |
| DAG-based dependencies | Kahn's algorithm, O(V+E) cycle detection | ✓ Good — prevents circular deps |
| Exponential backoff (2^n * 1000ms) | Prevents thundering herd | ✓ Good — caps at 30s |
| Hybrid checkpointing (local + SQLite) | Fast recovery + cross-machine durability | ✓ Good — 60s/5min intervals |
| Memory-aware throttling (85% threshold) | Prevents OOM on Pi 2B | ✓ Good — priority-based pausing |
| Fixed roles on brain/server, flexible on workers | Specialization where valuable | ✓ Good — Minerva/Vulcan + flexible workers |

---
*Last updated: 2026-02-22 after v1.0 milestone*
