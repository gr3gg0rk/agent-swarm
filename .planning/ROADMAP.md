# Roadmap: OpenClaw Swarm

**Created:** 2026-02-22
**Depth:** Comprehensive
**Milestone:** v1.2 Installation Fixes

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-02-22)
- ✅ **v1.1 Enhancements** — Phases 6-11 (shipped 2026-02-23)
- 📋 **v1.2 Installation Fixes** — Phases 12-16 (current)
- 📋 **v2.0 Advanced** — Future (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: Communication & Discovery (3/3 plans)
- [x] Phase 2: Shared State & Lifecycle (3/3 plans)
- [x] Phase 3: Task Delegation (3/3 plans)
- [x] Phase 4: Error Handling & Recovery (2/2 plans)
- [x] Phase 5: Integration Wiring (1/1 plan)

</details>

<details>
<summary>✅ v1.1 Enhancements (Phases 6-11) — SHIPPED 2026-02-23</summary>

- [x] Phase 6: Advanced Routing (3/3 plans) — Load-aware routing, circuit breaker, exponential backoff
- [x] Phase 7: Optimization (3/3 plans) — Message batching, connection pooling, context references
- [x] Phase 8: Checkpointing Gaps (3/3 plans) — CRC32 checksums, atomic writes, vector clocks
- [x] Phase 9: Visualization (3/3 plans) — Web dashboard with SSE real-time updates
- [x] Phase 10: Context Recovery Integration (1/1 plan) — Context reference resolution in checkpoint recovery
- [x] Phase 11: Opt-In Feature Activation (1/1 plan) — Production-ready optimization activation

</details>

<details>
<summary>📋 v1.2 Installation Fixes (Phases 12-19) — CURRENT</summary>

- [x] Phase 12: Critical Fixes (0/4 plans) — Import errors, schema exports, database bugs (completed 2026-02-24)
- [x] Phase 13: Setup & Validation (0/3 plans) — Workspaces, setup scripts, health checks (completed 2026-02-24)
- [ ] Phase 14: Run Scripts & Services (0/3 plans) — npm scripts, systemd integration (archived - replaced by phases 17-18)
- [x] Phase 15: Documentation (0/2 plans) — Quick start, config examples (completed 2026-02-24)
- [x] Phase 16: Quality Gates (0/2 plans) — CI verification, pre-commit hooks (completed 2026-02-25)
- [x] Phase 17: NPM Run Scripts (0/4 plans) — npm run agent, api, dashboard (gap closure) (completed 2026-02-25)
- [x] Phase 18: Production Deployment (0/2 plans) — systemd service files (gap closure) (completed 2026-02-25)
- [ ] Phase 19: Wire Extended Health Check (gap closure) — Wire createExtendedHealthRoute into API server

</details>

### 📋 v2.0 Advanced (Planned)

Future phases for advanced features:

- Multi-capability AND logic for task routing
- Dynamic capability declaration at runtime
- Adaptive batching with dynamic window scaling
- Intelligent context caching
- Checkpoint compression and incremental saves
- Progress timeline and capability matrix views

## Progress

| Phase                            | Milestone | Plans Complete | Status     | Completed  |
| -------------------------------- | --------- | -------------- | ---------- | ---------- | --- |
| 1. Communication & Discovery     | v1.0      | 3/3            | Complete   | 2026-02-21 |
| 2. Shared State & Lifecycle      | v1.0      | 3/3            | Complete   | 2026-02-21 |
| 3. Task Delegation               | v1.0      | 3/3            | Complete   | 2026-02-21 |
| 4. Error Handling & Recovery     | v1.0      | 2/2            | Complete   | 2026-02-22 |
| 5. Integration Wiring            | v1.0      | 1/1            | Complete   | 2026-02-22 |
| 6. Advanced Routing              | v1.1      | 3/3            | Complete   | 2026-02-23 |
| 7. Optimization                  | v1.1      | 3/3            | Complete   | 2026-02-23 |
| 8. Checkpointing Gaps            | v1.1      | 3/3            | Complete   | 2026-02-23 |
| 9. Visualization                 | v1.1      | 3/3            | Complete   | 2026-02-23 |
| 10. Context Recovery Integration | v1.1      | 1/1            | Complete   | 2026-02-23 |
| 11. Opt-In Feature Activation    | v1.1      | 1/1            | Complete   | 2026-02-23 |
| 12. Critical Fixes               | 5/6       | Complete       | 2026-02-24 | -          |
| 13. Setup & Validation           | 4/4       | Complete       | 2026-02-24 | -          |
| 14. Run Scripts & Services       | v1.2      | 0/3            | Archived   | -          | -   |
| 15. Documentation                | 3/3       | Complete       | 2026-02-24 | -          |
| 16. Quality Gates                | 2/2       | Complete       | 2026-02-25 | -          |
| 17. NPM Run Scripts              | 6/6       | Complete       | 2026-02-25 | -          | -   |
| 18. Production Deployment        | 2/2       | Complete       | 2026-02-25 | -          | -   |

**Overall:** 27/50 plans complete (54%)

## v1.2 Phase Details

### Phase 12: Critical Fixes

**Goal:** Developer can run `npm install && npm run build` without errors and all imports work correctly

**Depends on:** Nothing (first phase of v1.2)

**Requirements:** CRIT-01, CRIT-02, CRIT-03, CRIT-04, CRIT-05, CRIT-06

**Success Criteria** (what must be TRUE):

1. Developer can run `npm install && npm run build` in coordination package without import errors
2. msgpackr imports use `pack`/`unpack` functions instead of `MessagePack` class
3. Optimization module (MessageBatcher, ConnectionPoolManager, loadOptimizationConfig) can be imported from `@openclaw-swarm/coordination`
4. Schema functions (initializeSchema, validateSchema) can be imported from `@openclaw-swarm/coordination`
5. Database pragma calls return string values (not Database objects) via `{ simple: true }` option
6. Task queue INSERT statement has correct number of placeholders (15 columns, 15 placeholders)

**Plans:** 6/6 plans complete

- [ ] 12-01-PLAN.md — Fix msgpackr imports to use pack/unpack functions
- [ ] 12-02-PLAN.md — Add optimization module exports to main index
- [ ] 12-03-PLAN.md — Add schema function exports to main index
- [ ] 12-04-PLAN.md — Fix database pragma calls to use simple option
- [ ] 12-05-PLAN.md — Fix INSERT statement placeholder count
- [ ] 12-06-PLAN.md — Add regression tests and verify fixes

### Phase 13: Setup & Validation

**Goal:** Developer can validate environment and initialize system with automated setup scripts

**Depends on:** Phase 12 (requires working imports and schema functions)

**Requirements:** SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05

**Success Criteria** (what must be TRUE):

1. Root package.json has workspaces configuration for `packages/*`
2. Developer can run `npm run setup` and see environment validation pass/fail with clear messages
3. Health check endpoint verifies three things: imports work, database is accessible, MQTT is connected
4. Setup script warns developer if Mosquitto persistence is disabled (snap compatibility issue)
5. Agent registry loads automatically on first use with sensible default configuration

**Plans:** 4/4 plans complete

- [x] 13-01-PLAN.md — Add npm workspaces configuration to root package.json
- [x] 13-02-PLAN.md — Extend health check endpoint and auto-load agent registry with defaults
- [x] 13-03-PLAN.md — Create setup script with environment validation and Mosquitto persistence check
- [ ] 13-04-PLAN.md — Fix database initialization bug in setup script (gap closure)

### Phase 14: Run Scripts & Services

**Goal:** Developer can start all system components (agent, API, dashboard) with single npm commands

**Depends on:** Phase 13 (requires setup validation and working imports)

**Requirements:** SCRIPT-01, SCRIPT-02, SCRIPT-03, SCRIPT-04, SCRIPT-05

**Success Criteria** (what must be TRUE):

1. `npm run agent` starts an agent using example config file
2. `npm run api` starts the API server with automatic database initialization
3. `npm run dashboard` starts the dashboard dev server on expected port
4. Example agent code uses relative imports that work correctly with npm workspaces
5. Systemd service files are provided for: mqtt, api, dashboard, agent@role template

**Plans:** TBD

### Phase 15: Documentation

**Goal:** Developer can install and run the system by following quick start guide

**Depends on:** Phase 14 (requires all features to be documented accurately)

**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04

**Success Criteria** (what must be TRUE):

1. README includes quick start section with exactly 3 commands to running system
2. Mosquitto persistence requirements are documented prominently with warning
3. Example config files are provided for each agent role: minerva, vulcan, worker
4. Error messages include actionable "Fix:" suggestions with specific commands or config changes

**Plans:** 3/3 plans complete

- [ ] 15-01-PLAN.md — Restructure README Quick Start with 3-command flow and Mosquitto warning
- [ ] 15-02-PLAN.md — Create role-specific config files and add Fix: suggestions to errors

### Phase 16: Quality Gates

**Goal:** CI prevents broken code from being committed and verifies published package works

**Depends on:** Phase 15 (requires all features to test against)

**Requirements:** QA-01, QA-02, QA-03

**Success Criteria** (what must be TRUE):

1. CI workflow runs on every commit and verifies all exports can be imported from built `dist/`
2. Pre-commit hooks run three checks: lint, typecheck, import verification
3. Integration tests verify database operations: INSERT works, schema initialization succeeds, pragma calls return expected values

**Plans:** 2/2 plans complete

- [ ] 16-01-PLAN.md — Create GitHub Actions CI workflow with export verification (QA-01)
- [ ] 16-02-PLAN.md — Implement pre-commit hooks and integration tests (QA-02, QA-03)

### Phase 17: NPM Run Scripts

**Goal:** Developer can start all system components with single npm commands

**Depends on:** Phase 13 (requires setup validation and working imports)

**Requirements:** SCRIPT-01, SCRIPT-02, SCRIPT-03, SCRIPT-04

**Gap Closure:** Closes gaps from v1.2 audit - replaces Phase 14

**Success Criteria** (what must be TRUE):

1. `npm run agent` starts an agent using example config file
2. `npm run api` starts the API server with automatic database initialization
3. `npm run dashboard` starts the dashboard dev server on expected port
4. Example agent code uses relative imports that work correctly with npm workspaces

**Plans:** 6/6 plans complete

- [ ] 17-01-PLAN.md — Create npm run agent script with config loading and graceful shutdown
- [ ] 17-02-PLAN.md — Create npm run api script with database initialization
- [ ] 17-03-PLAN.md — Create npm run dashboard script with Vite dev server
- [ ] 17-04-PLAN.md — Create agent-runner.ts example with role-specific configs

### Phase 18: Production Deployment

**Goal:** System can be deployed as systemd services for production use

**Depends on:** Phase 17 (requires npm scripts to be tested first)

**Requirements:** SCRIPT-05

**Gap Closure:** Closes gaps from v1.2 audit - replaces Phase 14

**Success Criteria** (what must be TRUE):

1. Systemd service files are provided for: mqtt, api, dashboard, agent@role template
2. README documents how to install and enable the systemd services

**Plans:** 2/2 plans complete

- [ ] 18-01-PLAN.md — Create four systemd service files (mqtt, api, dashboard, agent@.service)
- [ ] 18-02-PLAN.md — Add Production Deployment section to README.md

### Phase 19: Wire Extended Health Check

**Goal:** Health check endpoint verifies 3 components as required by SETUP-03

**Depends on:** Phase 13 (createExtendedHealthRoute exists), Phase 17 (API server startup)

**Requirements:** SETUP-03

**Gap Closure:** Closes integration gap from v1.2 audit - wires extended health check into API server

**Success Criteria** (what must be TRUE):

1. API server uses `createExtendedHealthRoute` instead of `createHealthRoute`
2. MQTT client is passed to `createStateApi` from start-api script
3. Health check at /health returns status for: imports, database, MQTT

**Plans:** 1 plan complete

- [x] 19-01-PLAN.md — Wire extended health check into API server

## v1.2 Dependency Graph

```
Phase 12 (Critical Fixes)
    ↓
Phase 13 (Setup & Validation)
    ↓
Phase 17 (NPM Run Scripts) ← Gap Closure
    ↓
Phase 18 (Production Deployment) ← Gap Closure
    ↓
Phase 15 (Documentation)
    ↓
Phase 16 (Quality Gates)

Note: Phase 14 archived, replaced by phases 17-18
```

## v1.2 Requirements Coverage

**Total v1.2 Requirements:** 23
**Mapped to Phases:** 23
**Coverage:** 100% ✓

| Requirement | Phase | Description                                       |
| ----------- | ----- | ------------------------------------------------- |
| CRIT-01     | 12    | npm install && npm run build works without errors |
| CRIT-02     | 12    | msgpackr uses pack/unpack functions               |
| CRIT-03     | 12    | Optimization module exported from coordination    |
| CRIT-04     | 12    | Schema functions exported from coordination       |
| CRIT-05     | 12    | Database pragma uses { simple: true }             |
| CRIT-06     | 12    | Task queue INSERT has 15 placeholders             |
| SETUP-01    | 13    | Root package.json workspaces config               |
| SETUP-02    | 13    | npm run setup validates environment               |
| SETUP-03    | 13    | Health check endpoint verifies 3 things           |
| SETUP-04    | 13    | Setup checks Mosquitto persistence                |
| SETUP-05    | 13    | Agent registry auto-loads with defaults           |
| SCRIPT-01   | 17    | npm run agent starts agent                        |
| SCRIPT-02   | 17    | npm run api starts API server                     |
| SCRIPT-03   | 17    | npm run dashboard starts dashboard                |
| SCRIPT-04   | 17    | Example agent uses workspaces imports             |
| SCRIPT-05   | 18    | Systemd service files provided                    |
| DOCS-01     | 15    | README quick start with 3 commands                |
| DOCS-02     | 15    | Mosquitto persistence documented                  |
| DOCS-03     | 15    | Example configs for each role                     |
| DOCS-04     | 15    | Error messages have Fix suggestions               |
| QA-01       | 16    | CI verifies dist exports                          |
| QA-02       | 16    | Pre-commit hooks: lint, typecheck, imports        |
| QA-03       | 16    | Integration tests verify database ops             |
| SETUP-03    | 19    | Health check verifies 3 components (gap closure)  |

## Milestone Context

**v1.2 Installation Fixes** addresses the gap between shipped v1.1 code and developer ability to install and run it. While v1.1 delivered 23 validated requirements (load balancing, batching, dashboard), developers cannot currently install the package due to:

- msgpackr import confusion (`@ts-ignore` suggests uncertainty)
- Missing exports (optimization, schema functions not in index.ts)
- Database bugs (pragma return type, column count mismatch)
- No setup tooling or documentation

This milestone unblocks developers and establishes the foundation for future v2.0 enhancements.

## Anti-Patterns Avoided

**Not doing:**

- Arbitrary phase splits (e.g., splitting critical fixes into multiple phases)
- Horizontal layering (all fixes, then all setup, then all scripts)
- Premature optimization (refactors not related to installation blockers)
- Documentation first (docs would reflect broken system)
- Quality gates before features exist (CI has nothing to verify)

**Doing instead:**

- Coherent delivery boundaries (each phase completes verifiable capability)
- Feature flow (fixes → setup → scripts → docs → gates)
- Unblock dependencies (critical fixes first, then setup depends on working imports)
- Honest sequencing (documentation after features are implemented)

## Notes

- Phase numbering continues from v1.1 (phases 6-11 completed)
- This is a focused milestone — 23 requirements vs 42 (v1.0) and 23 (v1.1)
- All v1.2 additions are zero runtime memory impact (build/dev tooling only)
- Research guided phase structure but requirements drove coverage

---

_Roadmap created: 2026-02-22_
_Last updated: 2026-02-23 after v1.2 roadmap creation_
_Next: `/gsd:plan-phase 12`_
