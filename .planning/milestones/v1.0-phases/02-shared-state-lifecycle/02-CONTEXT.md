# Phase 2: Shared State & Lifecycle - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

All agents share consistent view of system state and agent health. This phase delivers:
1. SQLite-based shared state storage on griak-brain
2. Heartbeat monitoring with offline detection (4 missed beats)
3. Agent supervision with systemd (auto-restart on crash)
4. Real-time status view for Minerva with historical persistence

State is centralized on griak-brain. Remote agents access via REST API. Lifecycle management uses systemd. Task delegation and checkpointing are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Heartbeat Monitoring
- Agents publish heartbeat every 30 seconds via MQTT (as per requirements)
- 4 missed heartbeats = agent marked offline (2-minute detection window)
- Minerva tracks all agent health status centrally
- Vulcan tracks only agents he spawns (dual tracking responsibility)

### Agent Supervision
- systemd services manage agent lifecycle
- Auto-restart on crash with exponential backoff
- Backoff strategy: 1s, 2s, 4s, 8s, 16s, 30s max
- On SIGTERM: agents finish in-progress tasks before exiting (graceful shutdown)

### Database Access
- SQLite database hosted on griak-brain (colocated with MQTT broker)
- Remote agents access state via REST API wrapper
- WAL mode enabled for concurrent read/write access
- Network-level authentication (no API keys, rely on local network trust)

### Status History & Archival
- Archive old records, don't delete
- Separate archive tables (tasks_archive, status_archive)
- Archived records excluded from active queries
- Retained for debugging and audit purposes

### Task Queue Implementation
- SQLite table with proper indexes
- Schema includes: id, status, priority, assigned_agent, created_at
- Agents poll queue for work matching their role
- Concurrent access handled via WAL mode

### Health Check Endpoints
- HTTP /health endpoint on each agent
- Returns 200 OK if agent responsive, 503 if unhealthy
- Standard format for easy monitoring integration

### Claude's Discretion
- REST API technology stack (Python FastAPI vs Node Express) - choose based on codebase consistency
- Port allocation strategy (unified vs separate ports for health/state APIs)
- Exact systemd service file structure and restart rate limiting configuration
- Archive migration schedule (when to move records to archive tables)

</decisions>

<specifics>
## Specific Ideas

- "Minerva maintains real-time view of all agent statuses" - implies Minerva subscribes to heartbeat topic and tracks state
- "State persists across agent restarts without data loss" - database durability is critical
- systemd is preferred over supervisord for native Linux integration

</specifics>

<deferred>
## Deferred Ideas

- Task checkpointing (LIFE-04) - Phase 4: Error Handling & Recovery
- Task progress updates during execution (STAT-02, STAT-03) - Phase 3: Task Delegation
- Retry logic with exponential backoff (ERRO-01, ERRO-02) - Phase 3: Task Delegation

</deferred>

---

*Phase: 02-shared-state-lifecycle*
*Context gathered: 2026-02-21*
