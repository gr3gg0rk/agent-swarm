# Project Research Summary

**Project:** OpenClaw Swarm - v1.2 Installation & Package Distribution
**Domain:** Lightweight Agent Swarm Coordination System (npm ESM package with monorepo setup tooling)
**Researched:** 2026-02-23
**Confidence:** MEDIUM

## Executive Summary

OpenClaw Swarm is a distributed multi-agent coordination system designed for resource-constrained environments (Raspberry Pi 2B with 1GB RAM). v1.0 shipped a functional coordination layer with MQTT-based messaging, SQLite state management, and role-based task routing. v1.1 added load balancing, message batching, and a basic dashboard. This research synthesizes findings for v1.2, which focuses on package distribution improvements, developer experience enhancements, and installation automation.

The recommended approach for v1.2 is to implement proper npm package distribution using native npm workspaces (avoiding Turborepo/Nx overhead for a 2-package monorepo), ESM-only exports with subpath exports for modular access, and automated setup tooling using zx scripts. Key risks include resource exhaustion on Pi 2B (mitigated by keeping coordination under 50% RAM), message delivery misconceptions (mitigated by designing idempotent operations from day one), and package installation errors (mitigated by CI verification workflows). The stack remains lightweight: no new runtime dependencies for v1.2 — all additions are build-time or development-time only.

## Key Findings

### Recommended Stack

From STACK.md: The v1.2 additions focus on developer experience and package distribution with zero runtime memory impact. Native npm workspaces replace complex monorepo tools (Turborepo, Nx) for a simple 2-package structure. zx provides modern ESM-compatible setup scripting (vs ShellJS which is CommonJS-only). husky + lint-staged handle pre-commit hooks with staged file checks for faster commits. GitHub Actions provides CI/CD with matrix builds for multi-version Node.js testing and Mosquitto service integration for MQTT connectivity verification.

**Core technologies (v1.0 baseline):**
- **MQTT (Mosquitto 2.0.x):** Message broker — industry standard for IoT, minimal footprint (3-10MB), QoS levels, retained messages for agent discovery
- **Better-SQLite3 11.9.0:** Shared state persistence — faster than file I/O, ACID transactions, WAL mode for concurrency, single-file database
- **MQTT.js 5.0.0:** MQTT client for Node.js — mature, WebSocket support, built-in connection pooling
- **MessagePack (msgpackr):** Binary serialization — 3.5x faster than JSON, 15-50% smaller payloads

**v1.2 additions (zero runtime impact):**
- **npm workspaces (native):** Monorepo management — zero overhead, matches project structure
- **package.json "exports":** ESM entry points — required for proper ESM package boundaries
- **zx 8.0.0:** Setup automation scripts — native ESM support, modern async/await
- **husky 9.0.0 + lint-staged 15.0.0:** Pre-commit hooks — git hooks automation, monorepo-friendly

### Expected Features

From FEATURES.md: v1.0 shipped with table stakes features including agent discovery, task delegation, inter-agent communication, and health monitoring. v1.1 added load-based routing, message batching, connection pooling, and a basic dashboard. v1.2 focuses on installation and distribution improvements rather than end-user features.

**v1.2 table stakes (developer experience):**
- **Native npm workspaces configuration** — automatic linking of local packages
- **ESM export patterns with subpath exports** — proper package boundary definition
- **Setup automation script** — environment validation and first-time setup
- **Pre-commit hooks with type checking** — catch errors before commit
- **CI import verification** — ensure published package imports correctly

**v1.1 features (already planned, partially implemented):**
- **Load-based task routing** — route to least-loaded capable agent using heartbeat CPU/memory data
- **Task rejection with automatic reassignment** — agents self-protect from overload, router retries
- **Context reference passing** — pass context IDs for payloads >10KB, fetch via REST API
- **Message batching** — 10x throughput improvement, 70% bandwidth reduction
- **Connection pooling** — 60% latency reduction, 70% resource savings
- **Basic dashboard** — agent status, task progress, system metrics (runs on brain machine, not Pi 2B)

**Defer to v2+:**
- **Multi-capability AND logic** — sophisticated task-agent matching (v1.2)
- **Dynamic capability declaration** — runtime capability registration (v1.2)
- **Explainable routing decisions** — reasoning reports for debugging (v1.2)
- **Progress timeline visualization** — Gantt chart for task dependencies (v1.2)

### Architecture Approach

From ARCHITECTURE.md: The coordination package is an ESM-first TypeScript library with a modular architecture using Node16 module resolution with subpath exports pattern. Key architectural findings: the package already uses the `exports` field correctly in package.json with conditional imports (ESM-only), but the optimization module is missing from the main index.ts re-exports. No dedicated setup/validation tooling exists — health checks are implemented via `HealthCheckServer` class and Express routes but need CLI exposure. The monorepo structure lacks workspaces configuration in the root package.json.

**Major components:**
1. **Main Entry (index.ts)** — Barrel export of all public APIs, should re-export from each module's index.ts (currently missing optimization module)
2. **Setup Module (NEW)** — Setup/validation utilities exported via `./setup` subpath, includes `validateEnvironment()` and `initializeSchema()`
3. **Setup Scripts (NEW)** — Environment validation CLI, runtime health check CLI, database initialization script in `scripts/` directory
4. **Health Check Bin (NEW)** — Executable CLI command via npm bin field for operations teams and monitoring systems
5. **npm Exports Field** — Defines package boundary with subpath exports for modular access (`.`, `./communication`, `./state`, `./optimization`, `./setup`)

**Recommended project structure (v1.2 additions):**
```
packages/coordination/
├── scripts/          # NEW: Setup and utility scripts
│   ├── setup.ts      # Environment validation and init
│   ├── validate.ts   # Health check CLI
│   └── init-schema.ts # Database initialization
├── bin/              # NEW: Executable commands (optional)
│   └── openclaw-health # Symlink to scripts/validate.ts
└── src/
    └── setup/        # NEW: Setup and validation utilities
        ├── index.ts  # Public setup API
        ├── health.ts # Health check functions
        └── schema.ts # Schema initialization utilities

root/
├── package.json      # ADD: workspaces configuration
├── scripts/          # NEW: Cross-package utilities
│   ├── install.sh    # Development environment setup
│   └── validate-env.sh # Mosquitto/config validation
└── packages/
    ├── coordination/
    └── dashboard/
```

### Critical Pitfalls

From PITFALLS.md: The top pitfalls for distributed agent swarm systems, ranked by severity and frequency of occurrence.

1. **Communication Overload and Message Storms** — Multi-agent systems experience exponential message growth. Implement async queues with message deduplication, batch messages where possible, define clear input/output contracts, use shared short-term memory layers instead of point-to-point messaging. (Addressed in v1.1 with message batching)

2. **Distributed Memory Desynchronization** — Multiple agents maintaining separate memory banks lose context, causing inconsistent state. Use global context storage for consistency, implement event-driven synchronization with proper versioning, design state updates to be commutative where possible. (Addressed in v1.0 with SQLite state store)

3. **Agent Coordination Deadlocks and Livelocks** — Agents form infinite loops passing tasks without progress. Implement clear task ownership with timeout-based escalation, use DAGs for task dependencies, add exponential backoff with jitter for retry logic, implement deadlock detection algorithms. (Addressed in v1.0 with DAG-based dependencies)

4. **Resource Exhaustion on Constrained Hardware** — System runs out of memory/CPU on Pi 2B (1GB RAM). Target Pi 2B as baseline, reserve headroom (keep utilization below 50-60%), use lightweight OS variants, enable ZRAM for memory compression, implement resource quotas per agent. (Critical for v1.2: all additions must be zero runtime impact)

5. **Message Delivery Misconceptions** — Developers assume "exactly-once" delivery is possible. Design for at-least-once delivery as base reality, implement idempotency at application layer using unique task IDs, accept that "exactly-once = at-least-once + idempotent processing." (Critical for v1.2: all operations must be idempotent)

## Implications for Roadmap

Based on combined research, suggested phase structure for v1.2:

### Phase 1: Package Exports & Module Boundaries
**Rationale:** Fixes the missing optimization module export and establishes proper ESM package boundaries before adding setup tooling. This is a quick win that unblocks other work.

**Delivers:**
- Optimization module exported from main index.ts
- Subpath exports configured in package.json (`.`, `./communication`, `./state`, `./optimization`, `./setup`)
- All modules have index.ts barrel exports with selective public API

**Addresses:**
- STACK.md: ESM export patterns requirement
- ARCHITECTURE.md: "Fix Missing Exports (Quick Win)"

**Avoids:**
- PITFALLS.md: Anti-pattern of exporting internal implementation details

### Phase 2: Setup Module & Scripts
**Rationale:** Creates the setup/validation infrastructure that other features depend on. Separates runtime code from setup/dev tooling following established Node.js conventions.

**Delivers:**
- `src/setup/index.ts` with `validateEnvironment()` and `initializeSchema()`
- `src/setup/health.ts` with `performHealthCheck()`
- `src/setup/mosquitto.ts` with `checkMosquittoPersistence()`
- `scripts/setup.ts` for development environment validation
- `scripts/validate.ts` for runtime health check CLI
- `scripts/init-schema.ts` for database initialization

**Uses:**
- STACK.md: zx for ESM-compatible setup scripting
- ARCHITECTURE.md: Setup Script as Separate Entry Point pattern

**Implements:**
- ARCHITECTURE.md: "Create Setup Module" and "Create Setup Scripts" phases

**Addresses:**
- STACK.md STATE-02: Database schema export fix
- ARCHITECTURE.md: Missing setup/validation tooling

### Phase 3: Monorepo Configuration & CI
**Rationale:** Establishes the development infrastructure that supports all future work. Workspaces configuration enables local package linking, CI ensures published packages work correctly.

**Delivers:**
- Root package.json with workspaces configuration
- Root-level `scripts/` with cross-package utilities
- `scripts/install.sh` for first-time development environment setup
- `scripts/validate-env.sh` for Mosquitto/config validation
- `.github/workflows/verify-imports.yml` with matrix Node.js testing
- `scripts/verify-imports.mjs` and `scripts/test-mqtt-connection.mjs`
- husky + lint-staged pre-commit hooks

**Uses:**
- STACK.md: npm workspaces (native), husky, lint-staged, GitHub Actions

**Implements:**
- ARCHITECTURE.md: "Update Monorepo Root" phase
- STACK.md: CI/CD Workflows for Import Verification

### Phase 4: Optional Bin Commands
**Rationale:** Provides executable CLI commands for operations teams and monitoring systems. Optional because not all users need CLI access — programmatic API via `./setup` subpath is sufficient for most use cases.

**Delivers:**
- `bin/health-check.js` executable symlink
- package.json `bin` field configuration
- Unix-style exit codes for monitoring integration

**Uses:**
- ARCHITECTURE.md: Health Check via bin/ Command pattern
- STACK.md: Node.js assert for smoke testing

**Addresses:**
- ARCHITECTURE.md: "Add npm bin Commands (Optional)" phase

### Phase 5: Documentation & Examples
**Rationale:** Comprehensive documentation ensures users can successfully install and use the package. Should be done after all features are implemented so docs reflect final state.

**Delivers:**
- Installation guide for npm package consumers
- Setup guide for development environment
- API documentation for all exported modules
- Example code for common use cases
- Troubleshooting guide for common issues

**Uses:**
- All previous phases as reference

### Phase Ordering Rationale

- **Phase 1 first**: Export fixes are foundational — other phases depend on proper module boundaries
- **Phase 2 second**: Setup module is needed before CI can validate it, and before bin commands can use it
- **Phase 3 third**: Monorepo setup enables all development workflows; CI validates previous phases
- **Phase 4 fourth**: Bin commands depend on setup module from Phase 2
- **Phase 5 last**: Documentation must reflect final implementation state

This order follows the ARCHITECTURE.md build order while respecting STACK.md tooling choices and avoiding PITFALLS.md anti-patterns (especially "Mixing Runtime and Setup Code").

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Setup Module):** Mosquitto persistence check implementation details (MQTT $SYS topics) — research mentioned this needs phase-specific validation
- **Phase 3 (Monorepo Configuration):** Systemd service file templates for Node.js applications — not covered in current research
- **Phase 4 (Bin Commands):** Best practices for npm bin command compilation (pkg vs nexe vs others) — current research mentioned this as gap

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Package Exports):** ESM export patterns are standard Node.js, verified against codebase (MEDIUM confidence)
- **Phase 5 (Documentation):** Well-documented pattern, no specialized research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies (MQTT, SQLite, MessagePack) are industry standards with official documentation. v1.2 additions (npm workspaces, zx, husky) are well-established tools. |
| Features | MEDIUM | v1.0 features are HIGH confidence (already shipped). v1.1 features are MEDIUM (some findings from blog posts rather than peer-reviewed papers, but cross-referenced). |
| Architecture | MEDIUM | ESM export patterns are standard (MEDIUM). Setup script placement is established convention but couldn't verify recent community trends. Health check integration is HIGH (existing implementation analyzed). |
| Pitfalls | HIGH | Based on UC Berkeley research on multi-agent system failures (41-86.7% failure rate), distributed systems research, and CAP theorem. Patterns well-documented in academic literature. |
| Package Distribution | MEDIUM | npm workspaces and ESM exports are standard (HIGH). But installation-specific issues (STATE-01, STATE-02, STATE-03) identified from codebase analysis need validation during implementation. |

**Overall confidence:** MEDIUM — Core coordination patterns and pitfalls are well-documented. Package distribution and DX improvements follow established npm/Node.js patterns. Some installation-specific issues identified in codebase need resolution during implementation (msgpackr import, database schema exports, column count mismatch).

### Gaps to Address

- **msgpackr @ts-ignore removal (STATE-01):** Current code has `@ts-ignore` suggesting confusion about correct import pattern. Research confirms current import is correct — remove the `@ts-ignore` comment during Phase 1.
- **Database schema exports (STATE-02):** `initializeSchema` and related functions not exported from state/index.ts. Add exports in Phase 1 or Phase 2 (setup module depends on these).
- **Column count mismatch (STATE-03):** Task queue INSERT has column count mismatch — schema defines columns that INSERT statement doesn't include. Investigate and fix in Phase 2 (setup initialization).
- **Mosquitto persistence check:** MQTT $SYS topics for checking retained message persistence — referenced in architecture but implementation details not researched. Plan to research during Phase 2 planning.
- **Systemd service templates:** Not covered in current research but needed for production deployment. Can be deferred to post-v1.2 or addressed in Phase 2 if time permits.
- **Dashboard stack decision:** Research recommends Vite + Vanilla + Alpine over Next.js due to memory constraints (300MB-10GB vs 50MB target). This decision should be validated before dashboard development.

## Sources

### Primary (HIGH confidence)
- **npm workspaces Documentation** — Official npm docs on workspace configuration
- **package.json exports (Node.js)** — Official Node.js docs on ESM package boundaries
- **ESM Module Best Practices (nodejs.org)** — Official ESM documentation
- **zx Documentation** — Official GitHub repo for ESM-compatible scripting
- **Mosquitto Documentation** — Official docs for MQTT broker
- **MQTT.js npm** — Official npm package documentation
- **better-sqlite3 Documentation** — Official GitHub repo
- **msgpackr npm** — Official npm package

### Secondary (MEDIUM confidence)
- **MQTT.js Performance Optimization (CSDN, Oct 2025)** — Connection pooling, topic aliases
- **Message Batching Pattern (GeeksforGeeks, July 2025)** — DynamicBatcher pattern reference
- **Load Balancing Algorithms (Baidu Cloud, Sept 2025)** — Round-robin vs weighted vs least connections
- **HTMX vs React Bundle Size (Sohu, Sept 2025)** — 83% JS reduction with lightweight alternatives
- **Next.js Memory Leak #88603 (GitHub, Jan 2026)** — v16.1.0 production memory issues
- **UC Berkeley Research on Multi-Agent System Failures** — 41-86.7% failure rate, 14 major failure patterns
- **Microsoft Azure SRE Team case study** — 100+ tools reduced to 5 core tools

### Tertiary (LOW confidence — needs validation)
- **Android MQTT Client Batching (CSDN, Nov 2025)** — Application-layer batching benchmarks
- **Cloud Sky Data MQTT Optimization Patent** — Sharded broker clustering claims
- **Fuzzy-based distributed load balancing (CSDN, Jan 2025)** — Fuzzy set theory for load balancing
- **Specific blog posts and patents** — Single sources without independent verification

### Codebase Analysis (v1.0/v1.1 implementation)
- **Existing coordination package structure** — Verified module organization, exports configuration, health check implementation
- **Installation issues report** — `.planning/issues/INSTALLATION-ISSUES-griak-brain.md` identified STATE-01, STATE-02, STATE-03

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
