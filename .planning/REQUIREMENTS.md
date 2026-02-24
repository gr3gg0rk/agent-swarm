# Requirements: OpenClaw Swarm v1.2 Installation Fixes

**Defined:** 2026-02-23
**Core Value:** Minerva can assign a task to any agent in the swarm and get a result back

## v1.2 Requirements

Requirements for installation reliability and developer experience improvements.

### Critical Fixes

- [x] **CRIT-01**: Developer can run `npm install && npm run build` without import errors
- [x] **CRIT-02**: msgpackr imports use correct API (pack/unpack functions, not MessagePack class)
- [x] **CRIT-03**: Optimization module (MessageBatcher, ConnectionPoolManager, loadOptimizationConfig) exported from coordination package
- [x] **CRIT-04**: Schema functions (initializeSchema, validateSchema) exported from coordination package
- [x] **CRIT-05**: Database pragma calls use `{ simple: true }` option for string return values
- [x] **CRIT-06**: Task queue INSERT statement has correct number of placeholders (15, not 16)

### Setup & Validation

- [x] **SETUP-01**: Root package.json has workspaces configuration for packages/*
- [x] **SETUP-02**: Developer can run `npm run setup` to validate environment and initialize database
- [ ] **SETUP-03**: Health check endpoint verifies: imports work, database accessible, MQTT connected
- [x] **SETUP-04**: Setup script checks Mosquitto persistence and warns if disabled (snap compatibility)
- [ ] **SETUP-05**: Agent registry loads automatically on first use with sensible defaults

### Run Scripts & Examples

- [ ] **SCRIPT-01**: `npm run agent` starts an agent with example config
- [ ] **SCRIPT-02**: `npm run api` starts the API server with database initialization
- [ ] **SCRIPT-03**: `npm run dashboard` starts the dashboard dev server
- [ ] **SCRIPT-04**: Example agent uses relative imports that work with npm workspaces
- [ ] **SCRIPT-05**: Systemd service files provided for: mqtt, api, dashboard, agent@role

### Documentation

- [ ] **DOCS-01**: README includes quick start section with 3 commands to running system
- [ ] **DOCS-02**: Mosquitto persistence requirements documented prominently
- [ ] **DOCS-03**: Example configs provided for each agent role (minerva, vulcan, worker)
- [ ] **DOCS-04**: Error messages include actionable "Fix:" suggestions

### Quality Gates

- [ ] **QA-01**: CI workflow verifies all exports can be imported from built dist/
- [ ] **QA-02**: Pre-commit hooks run: lint, typecheck, import verification
- [ ] **QA-03**: Integration tests verify database operations (INSERT, schema init, pragma)

## v2.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Multi-capability AND logic for task routing
- **ADV-02**: Dynamic capability declaration at runtime
- **ADV-03**: Adaptive batching with dynamic window scaling
- **ADV-04**: Intelligent context caching (LRU with invalidation)
- **ADV-05**: Checkpoint compression and incremental saves
- **ADV-06**: Progress timeline (Gantt chart) view
- **ADV-07**: Capability matrix view

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Interactive setup wizard | Overkill for current needs, CLI sufficient |
| Docker/pnpm migration | Current npm workspaces approach is sufficient |
| Cloud-based services | Must be fully self-hosted |
| Real-time collaboration features | Not core to coordination |
| Web UI for swarm management | Future enhancement |
| Agent marketplace or plugin system | Out of scope for v1.x |
| Binary packaging (pkg/nexe) | npm distribution sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CRIT-01 | Phase 12 | Complete |
| CRIT-02 | Phase 12 | Complete |
| CRIT-03 | Phase 12 | Complete |
| CRIT-04 | Phase 12 | Complete |
| CRIT-05 | Phase 12 | Complete |
| CRIT-06 | Phase 12 | Complete |
| SETUP-01 | Phase 13 | Complete |
| SETUP-02 | Phase 13 | Complete |
| SETUP-03 | Phase 13 | Pending |
| SETUP-04 | Phase 13 | Complete |
| SETUP-05 | Phase 13 | Pending |
| SCRIPT-01 | Phase 14 | Pending |
| SCRIPT-02 | Phase 14 | Pending |
| SCRIPT-03 | Phase 14 | Pending |
| SCRIPT-04 | Phase 14 | Pending |
| SCRIPT-05 | Phase 14 | Pending |
| DOCS-01 | Phase 15 | Pending |
| DOCS-02 | Phase 15 | Pending |
| DOCS-03 | Phase 15 | Pending |
| DOCS-04 | Phase 15 | Pending |
| QA-01 | Phase 16 | Pending |
| QA-02 | Phase 16 | Pending |
| QA-03 | Phase 16 | Pending |

**Coverage:**
- v1.2 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation*
