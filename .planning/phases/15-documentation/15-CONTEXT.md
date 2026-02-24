# Phase 15: Documentation - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

## Phase Boundary

Create documentation that enables developers to install and run OpenClaw Swarm successfully. Includes quick start guide, configuration reference, and actionable error messages.

---

## Implementation Decisions

### Quick Start Structure
- **3-command flow:** Install → Run → Verify (npm install, npm run api, curl health check)
- **Prerequisites:** List all explicitly (Node version, OS support, Mosquitto version)
- **Failure handling:** Inline hints under each command ("If you see X, do Y")
- **Platform coverage:** Unix primary (Linux/macOS), note Windows may require WSL

### Documentation Depth
- **Structure:** Reference style — API reference for each component
- **Conceptual first:** Explain concepts (routing, batching, checkpoints) before API usage
- **Config options:** Exhaustive — every option with default, type, description
- **Architecture:** Include internals — document routing, batching mechanics, not just public API

### Config Examples
- **Format:** Annotated full files — every option set, with comments explaining each
- **Organization:** Per-role files — `minerva.config.js`, `vulcan.config.js`, `worker.config.js`
- **MQTT options:** Document all connection options (local, Docker, remote broker scenarios)
- **Numeric guidance:** Explain trade-offs (e.g., too low = dropped tasks)

### Error Message Style
- **Tone:** Technical and concise — "ECONNREFUSED → Fix: systemctl start mosquitto"
- **Format:** Expanded — Error → Why it happened → How to fix (2-3 lines)
- **Coverage:** All errors have custom Fix suggestions
- **Diagnostics:** Include actual commands to diagnose (curl, mqtt test commands)

### Claude's Discretion
- Exact wording and phrasing
- Section ordering within README
- Code example formatting

---

## Specific Ideas

- Get developers running fast: 3 commands, but handle common failures inline
- Reference docs with conceptual context before API details
- Config examples should be copy-pasteable with educational comments
- Error messages should be actionable: show the actual fix command

---

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 15-documentation*
*Context gathered: 2026-02-23*
