# Phase 14: Run Scripts & Services - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Create npm run commands and systemd service files so developers can start system components (agent, API, dashboard) with single commands. This phase does NOT add new functionality — it wraps existing components with convenient run interfaces.

</domain>

<decisions>
## Implementation Decisions

### NPM Scripts Organization
- Per-package scripts: each package (agent, api, dashboard) defines its own start script
- Root package.json delegates to package scripts via `npm run -w @openclaw-swarm/agent start` pattern
- Agent command accepts config file argument: `npm run agent minerva` or `npm run agent -- config/minerva.json`

### Systemd Service Files
- All service files in single `deploy/` directory at root
- Template service for agents: `agent@.service` where Instance is role name (minerva, vulcan, worker)
- Dedicated `openclaw` user for security isolation
- On-failure restart with 5 second delay
- Stdout/stderr only (no file logging) — let systemd journal capture

### Environment Configuration
- Separate env files in `/etc/openclaw/*.env`
- Services load env files via systemd `EnvironmentFile=` directive
- JSON config files for agent roles: `config/agent.minerva.json`, `config/agent.vulcan.json`, `config/agent.worker.json`

### API Server Behavior
- Auto-initialize database on startup if not present (no manual setup step required)
- Health check gate: systemd waits for `/health` to pass before marking service started

### Agent Behavior
- Minimal working agent example — connects and declares one capability
- Verbose startup logging: config file path, MQTT broker, agent ID
- Graceful shutdown: SIGTERM handler completes current task then exits
- Semantic exit codes: 0=success, 1=generic error, 2=config error, 3=connection error

### Dashboard
- Default port: 3000
- Standard Vite dev server setup

### Claude's Discretion
- Exact systemd ExecStart paths (dist/ vs src/)
- WorkingDirectory settings
- After= and Requires= dependency ordering
- Example config file contents

</decisions>

<specifics>
## Specific Ideas

- Agent startup should log enough to confirm what's running (config, broker, ID)
- Graceful shutdown prevents losing in-flight task work
- Health check gate ensures services are actually ready when systemd says they're up

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-run-scripts-services*
*Context gathered: 2026-02-23*
