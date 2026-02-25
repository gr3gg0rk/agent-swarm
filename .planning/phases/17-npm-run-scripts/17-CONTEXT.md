# Phase 17: NPM Run Scripts - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer can start all system components (agent, API, dashboard) with single npm commands from the root of the monorepo.

This phase delivers:

- `npm run agent` — starts an agent using example config
- `npm run api` — starts the API server with automatic database initialization
- `npm run dashboard` — starts the dashboard dev server
- Example agent code that uses correct npm workspaces imports

Systemd service deployment is Phase 18.

</domain>

<decisions>
## Implementation Decisions

### Script configuration

- Config files live in `config/` directory at repository root
- Default config is `config/agent.json` (or similar), overrideable via `--config` flag
- Single shared config file for all services (not per-service configs)
- Fail fast with clear error message if config is missing or invalid

### Startup behavior

- Info-level logging by default (startup confirmation + errors)
- `-q`/`--quiet` flag to silence output
- `-v`/`--verbose` flag for detailed logs
- Validate MQTT and database connections on startup, fail if unavailable
- Graceful shutdown on SIGINT/SIGTERM: log shutdown message, close connections, exit

### Dashboard dev server

- Port specified from shared config file (`dashboard.port` in config.json)
- Hot module reload enabled (Vite HMR)
- Dual mode:
  - Dev mode (`npm run dashboard`): on-demand Vite dev server
  - Production mode: serve pre-built static assets

### Agent execution

- Agents use their pre-configured roles from OpenClaw instance (no role specification needed in npm scripts or config)
- Configuration (broker URL, database, etc.) via config file only (no CLI overrides, no env vars)

### Claude's Discretion

- Exact npm script implementation details (cross-platform considerations, node flags)
- Dashboard production mode flag naming (`--prod` vs `--production`)
- Exact logging format and timestamps
- Port conflict handling (what to do if port is in use)

</decisions>

<specifics>
## Specific Ideas

- Single shared config file approach keeps everything in one place — easier to see all service settings together
- Fail-fast on missing config — developer knows immediately something is wrong rather than discovering at runtime
- Agents already know their roles from their OpenClaw instance configuration — no need to duplicate role management in npm scripts

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 17-npm-run-scripts_
_Context gathered: 2026-02-24_
