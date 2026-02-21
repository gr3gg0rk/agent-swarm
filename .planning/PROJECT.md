# OpenClaw Swarm

## What This Is

A lightweight agent swarm coordination layer for OpenClaw that enables 4 independent OpenClaw instances running on separate machines to work together as a cohesive team. Minerva (the brain agent) delegates tasks to specialized agents running on worker machines, who execute work and report back. The system supports cross-machine delegation, shared project state, and role-aware task routing.

## Core Value

**Minerva can assign a task to any agent in the swarm and get a result back.** Everything else — shared state, communication protocols, progress reporting — supports this fundamental capability.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Instances can discover and communicate with each other across machines
- [ ] Minerva can delegate tasks to specific agents (Vulcan, workers) by role
- [ ] Agents can report status and results back to Minerva
- [ ] Agents can request guidance/clarification from Minerva during execution
- [ ] Shared project state (task queue, progress, context) accessible to all instances
- [ ] Task routing respects agent capabilities and machine roles
- [ ] System runs on constrained hardware (Pi 2B with 1GB RAM)

### Out of Scope

- Cloud-based services — must be fully self-hosted
- Real-time collaboration features (presence, live cursors) — not core to coordination
- Web UI for swarm management — future enhancement
- Agent marketplace or plugin system — out of scope for v1

## Context

### Current State

- 4 OpenClaw instances running independently on separate machines
- Each instance has Claude Code agent capabilities
- No cross-machine coordination exists today
- OpenClaw has multi-agent routing within a single gateway, but not across gateways

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
| Hybrid hierarchy (brain + self-organizing workers) | Balance control with autonomy | — Pending |
| Fixed roles on brain/server, flexible on workers | Specialization where valuable, flexibility where needed | — Pending |
| Communication protocol: TBD | Research needed — must be lightweight for Pi 2B | — Pending |
| Shared state location: TBD | Research needed — depends on communication pattern | — Pending |

---
*Last updated: 2025-02-21 after initialization*
