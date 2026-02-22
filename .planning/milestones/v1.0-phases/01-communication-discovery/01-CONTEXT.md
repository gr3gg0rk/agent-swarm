# Phase 1: Communication & Discovery - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-machine message bus infrastructure with agent discovery. Agents can discover each other and exchange messages reliably across machines using MQTT broker. This phase delivers the foundational communication layer - task execution, state management, and error handling come in later phases.

</domain>

<decisions>
## Implementation Decisions

### Agent Identity & Addressing
- Human-readable names for agent IDs (e.g., 'minerva', 'worker-1', 'worker-2')
- Agent IDs are configured statically (from config file or environment)
- Roles (orchestrator/worker) are separate from agent ID - role is a distinct field
- Duplicate agent IDs are rejected - new agent fails to start if ID already exists
- Agent registration must include hostname/IP for direct connectivity if needed

### Message Structure & Routing
- Claude's discretion on envelope structure, addressing mode, correlation pattern, and payload format

### Discovery Protocol
- Claude's discretion on announcement mechanism, metadata scope, refresh frequency, and disconnect handling

### Reliability & Idempotency
- Claude's discretion on idempotency key format, deduplication window, acknowledgment flow, and dedupe scope

### Claude's Discretion
- Message envelope structure (standard vs minimal)
- Addressing mode (by ID, by role, or both)
- Request/response correlation pattern
- Payload format (JSON only vs JSON + binary)
- Discovery announcement mechanism (retained message vs periodic broadcast)
- Registration metadata scope (full, core, or minimal)
- Registration refresh frequency
- Disconnect handling (graceful, expiration, or MQTT Last Will)
- Idempotency key format (UUID, timestamp+random, or agent+counter)
- Deduplication window duration
- Message acknowledgment approach
- Deduplication scope (per-agent vs shared)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — user is comfortable with standard MQTT and distributed systems approaches for the areas marked as Claude's discretion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-communication-discovery*
*Context gathered: 2026-02-21*
