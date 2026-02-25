---
phase: 18-production-deployment
plan: 01
subsystem: Production Deployment
tags: [systemd, services, production, linux]
title: 'systemd service files for Mosquitto, API, Dashboard, and Agent templates'
autonomous: true

dependency_graph:
  requires: [scripts/start-agent.mjs, scripts/start-api.mjs, scripts/start-dashboard.mjs]
  provides: [systemd service files for production deployment]
  affects: [production installation process]

tech_stack:
  added: []
  patterns:
    - systemd service file structure
    - Type=notify vs Type=simple for services
    - Template services using %i specifier
    - EnvironmentFile with - prefix for optional loading
    - Restart rate limiting with StartLimitInterval/StartLimitBurst
    - Security hardening with NoNewPrivileges/PrivateTmp
    - Journal-based logging via StandardOutput/Error=journal
    - Dependency ordering with Requires/Wants/After

key_files:
  created:
    - systemd/openclaw-mqtt.service
    - systemd/openclaw-api.service
    - systemd/openclaw-dashboard.service
    - systemd/openclaw-agent@.service
  modified: []

decisions: []
---

# Phase 18 Plan 01: Systemd Service Files Summary

## One-Liner

Created four systemd service files for production deployment of OpenClaw Swarm components: MQTT broker (Type=notify), API server (Type=simple with hard dependency), Dashboard (Type=simple with soft dependency), and Agent template (instantiated service with %i parameterization).

## Execution Details

**Tasks Completed:** 4/4
**Duration:** ~2 minutes
**Status:** Complete - all tasks executed as planned

## Artifacts Created

| File                                 | Purpose               | Key Features                                                      |
| ------------------------------------ | --------------------- | ----------------------------------------------------------------- |
| `systemd/openclaw-mqtt.service`      | Mosquitto MQTT broker | Type=notify, ExecReload for config reload                         |
| `systemd/openclaw-api.service`       | API server            | Requires=mqtt, absolute paths, NoNewPrivileges                    |
| `systemd/openclaw-dashboard.service` | Dashboard             | Wants=mqtt (can run without broker), npm run dev                  |
| `systemd/openclaw-agent@.service`    | Agent template        | %i specifier, SyslogIdentifier=%i, --config /etc/openclaw/%i.json |

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None encountered.

## Key Implementation Details

### Service Configuration (per CONTEXT.md decisions)

- **Restart policy:** `Restart=always` with `RestartSec=5s` and `StartLimitInterval=10s` / `StartLimitBurst=5` (5 restarts within 10 seconds before giving up)
- **User/Group:** Left empty for user-configurable deployment
- **Resource limits:** None set (relies on system defaults)
- **Security hardening:** `NoNewPrivileges=true` and `PrivateTmp=true` for API, Dashboard, and Agent services

### Logging Strategy

- All logs go to systemd journal (`StandardOutput=journal` and `StandardError=journal`)
- Log rotation handled by journald defaults
- Log verbosity controlled by `LOG_LEVEL` environment variable (default: info)
- Access logs via `journalctl -u openclaw-*` and `journalctl -f -u openclaw-api`

### Environment Configuration

- Per-service environment files in `/etc/openclaw/` (api.env, dashboard.env, agent@.env)
- All `EnvironmentFile` directives use `-` prefix for optional loading (dev convenience)
- Services can start if environment file is missing

### Dependencies

| Service   | MQTT Dependency  | Pattern                        |
| --------- | ---------------- | ------------------------------ |
| mqtt      | N/A              | After=network-online.target    |
| api       | Hard requirement | Requires=openclaw-mqtt.service |
| dashboard | Soft requirement | Wants=openclaw-mqtt.service    |
| agent@    | Hard requirement | Requires=openclaw-mqtt.service |

### Path Configuration

All services use absolute paths per RESEARCH.md Pitfall 2:

- `/usr/bin/node` for Node.js binary
- `/usr/bin/npm` for npm commands
- `/usr/sbin/mosquitto` for MQTT broker
- `/opt/openclaw-swarm` for installation directory
- `/opt/openclaw-swarm/packages/dashboard` for dashboard working directory

### Template Service Pattern

The `openclaw-agent@.service` template enables multiple agent instances:

- `systemctl start openclaw-agent@minerva` - starts agent with config at `/etc/openclaw/minerva.json`
- `systemctl start openclaw-agent@vulcan` - starts agent with config at `/etc/openclaw/vulcan.json`
- Description: `OpenClaw Swarm Agent (%i)` - shows instance name
- SyslogIdentifier: `openclaw-agent-%i` - distinguishes logs by instance

## Installation Instructions (for future deployment)

```bash
# Copy service files to systemd directory
sudo cp systemd/*.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable openclaw-mqtt
sudo systemctl enable openclaw-api
sudo systemctl enable openclaw-dashboard

# Start services now
sudo systemctl start openclaw-mqtt
sudo systemctl start openclaw-api
sudo systemctl start openclaw-dashboard

# Start specific agent instance
sudo systemctl start openclaw-agent@minerva
sudo systemctl enable openclaw-agent@minerva

# Check service status
sudo systemctl status openclaw-api

# View logs
sudo journalctl -u openclaw-api -f  # Follow logs
sudo journalctl -u openclaw-api -b  # Logs since boot
```

## Commits

| Hash    | Type | Description                                        |
| ------- | ---- | -------------------------------------------------- |
| e8fc821 | feat | create openclaw-mqtt.service for Mosquitto broker  |
| aa40074 | feat | create openclaw-api.service for API server         |
| d8847ba | feat | create openclaw-dashboard.service for dashboard    |
| 00b122e | feat | create openclaw-agent@.service template for agents |

## Files Created Summary

```
systemd/
├── openclaw-mqtt.service      (20 lines) - Mosquitto MQTT broker
├── openclaw-api.service       (23 lines) - API server
├── openclaw-dashboard.service (22 lines) - Dashboard
└── openclaw-agent@.service    (24 lines) - Agent template
```

Total: 89 lines across 4 service files

## Success Criteria Verification

- [x] All four service files exist in systemd/ directory
- [x] Each service file has [Unit], [Service], [Install] sections
- [x] mqtt service has Type=notify, api/dashboard/agent have Type=simple
- [x] api and agent@ have Requires=openclaw-mqtt.service, dashboard has Wants=
- [x] All services have Restart=always with StartLimitInterval=10s and StartLimitBurst=5
- [x] All services use StandardOutput=journal and StandardError=journal
- [x] api, dashboard, agent@ have NoNewPrivileges=true and PrivateTmp=true
- [x] agent@.service uses %i specifier in Description, ExecStart config path, and SyslogIdentifier
- [x] All ExecStart paths are absolute (/usr/bin/node, /usr/bin/npm, /usr/sbin/mosquitto)
- [x] All EnvironmentFile directives have - prefix for optional loading

## Next Steps

Per STATE.md, the next plans in Phase 18 are:

- 18-02: Installation documentation
- 18-03: Production configuration examples
- 18-04: Deployment verification

## Self-Check: PASSED

All service files exist at expected paths:

- `systemd/openclaw-mqtt.service` - FOUND
- `systemd/openclaw-api.service` - FOUND
- `systemd/openclaw-dashboard.service` - FOUND
- `systemd/openclaw-agent@.service` - FOUND

All commits verified in git log:

- e8fc821 - FOUND
- aa40074 - FOUND
- d8847ba - FOUND
- 00b122e - FOUND

Summary file created: `.planning/phases/18-production-deployment/18-01-SUMMARY.md` - FOUND
