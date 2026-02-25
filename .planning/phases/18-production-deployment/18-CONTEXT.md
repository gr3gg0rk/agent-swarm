# Phase 18: Production Deployment - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Create systemd service files to run OpenClaw Swarm components as production system services on Linux. Provide service templates for mqtt, api, dashboard, and agent@role with documentation for installation and enabling. Services run as background daemons managed by systemd with proper lifecycle, dependencies, and recovery.

</domain>

<decisions>
## Implementation Decisions

### Service configuration

- Restart policy: `Restart=always` with `RestartSec=5s` and `StartLimitInterval=10s` / `StartLimitBurst=5` (5 restarts within 10 seconds before giving up)
- User: `User=` and `Group=` left empty for user-configurable (can be set per deployment)
- Resource limits: No limits set in service files (relies on system defaults)
- Security hardening: Basic isolation with `NoNewPrivileges=true` and `PrivateTmp=true`

### Logging strategy

- All logs go to systemd journal only (stdout/stderr capture via `StandardOutput=journal` and `StandardError=journal`)
- Log rotation handled by journald defaults (usually 10% of filesystem with auto-rotation)
- Log verbosity controlled by `LOG_LEVEL` environment variable (default: info)
- Access logs via `journalctl -u openclaw-*` and `journalctl -f -u openclaw-api` for live tailing

### Environment configuration

- Environment files: Per-service files in `/etc/openclaw/` (e.g., `api.env`, `agent@.env`, `dashboard.env`)
- Application config: Central config file at `/etc/openclaw/config.yaml` for all components
- Services fail to start if environment file is missing (no defaults, requires explicit configuration)
- Service files use `EnvironmentFile=-/etc/openclaw/service.env` pattern

### Dependencies

- MQTT dependency: `Requires=mqtt.service` and `After=mqtt.service` (hard requirement)
- API and Dashboard: Start in parallel via `Wants=` (no ordering between them)
- Failure propagation: If MQTT crashes during operation, dependent services (API, agents) also stop
- Network: All services use `After=network-online.target` and `Wants=network-online.target`

### Claude's Discretion

- Exact service file naming convention (`openclaw-api.service` vs `api.service`)
- Working directory configuration (`WorkingDirectory=`) if needed
- PID file handling (optional, systemd can track without)
- Timeout values for startup/shutdown (`TimeoutStartSec=`, `TimeoutStopSec=`)
- Install section configuration (`WantedBy=multi-user.target` vs other targets)

</decisions>

<specifics>
## Specific Ideas

- Standard systemd service file patterns (similar to how nginx, postgresql handle their services)
- Environment file should be easy to generate from a setup script
- Services should be enableable via `systemctl enable openclaw-api` for boot startup
- Agent template service should support `systemctl start openclaw-agent@minerva` pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 18-production-deployment_
_Context gathered: 2026-02-24_
