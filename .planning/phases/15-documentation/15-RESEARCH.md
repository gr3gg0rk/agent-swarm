# Phase 15: Documentation - Research

**Researched:** 2026-02-23
**Domain:** Technical documentation for Node.js/TypeScript projects
**Confidence:** HIGH

## Summary

Phase 15 focuses on creating developer-facing documentation that enables quick installation and successful operation of OpenClaw Swarm. The documentation requirements are straightforward: a 3-command quick start guide, prominent Mosquitto persistence warnings, example configurations for each agent role, and actionable error messages.

The project already has substantial documentation in README.md (446 lines) covering architecture, components, MQTT topics, and configuration. The gap is the lack of a streamlined quick start that gets developers running in under 5 minutes with inline failure handling.

**Primary recommendation:** Create a focused "Quick Start" section at the top of README.md with exactly 3 commands (Install → Run → Verify), each followed by inline "If you see X, do Y" failure hints. Create separate example config files for each agent role (minerva.config.yaml, vulcan.config.yaml, worker.config.yaml) in an `examples/configs/` directory. Add "Fix:" suggestions to error messages throughout the codebase where they don't already exist.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Quick Start Structure:** 3-command flow (Install → Run → Verify), inline hints under each command, Unix primary (Linux/macOS), Windows may require WSL
- **Documentation Depth:** Reference style with conceptual explanations before API usage, exhaustive config options with defaults/types/descriptions, include internals documentation
- **Config Examples:** Annotated full files, per-role files (minerva.config.js, vulcan.config.js, worker.config.js), document MQTT connection scenarios, numeric trade-off guidance
- **Error Message Style:** Technical and concise, expanded format (Error → Why → How to fix), all errors have custom Fix suggestions, include diagnostic commands

### Claude's Discretion
- Exact wording and phrasing
- Section ordering within README
- Code example formatting

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCS-01 | README includes quick start section with 3 commands to running system | Existing README has Quick Start but needs restructuring to 3-command format with inline failure hints |
| DOCS-02 | Mosquitto persistence requirements documented prominently with warning | Setup script (scripts/setup.mjs) already checks persistence, needs documentation in README |
| DOCS-03 | Example config files provided for each agent role: minerva, vulcan, worker | Single examples/config.yaml exists, needs role-specific variants |
| DOCS-04 | Error messages include actionable "Fix:" suggestions with specific commands or config changes | Error logger exists (packages/coordination/src/errors/logger.ts), needs Fix: suggestions added to error messages |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Markdown | N/A | README and documentation format | Universal, GitHub-native, no build required |
| YAML | N/A | Configuration file format | Human-readable, industry standard for config |
| TypeScript JSDoc | Built-in | API documentation from source | Already used in codebase, generates type docs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cli-table3 | ^0.6.5 | Formatted terminal output in setup script | Already installed, used for setup validation |
| chalk | ^5.6.2 | Terminal colors in setup script | Already installed, visual error feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| README.md | Docusaurus/VitePress | Overkill for single-project docs, adds build step, current repo doesn't need multi-page site |
| Inline comments | Separate API docs (TypeDoc) | Current code has good JSDoc, external API docs not required for v1.2 scope |

**Installation:**
No additional packages needed — all documentation tools are already installed or use built-in formats.

## Architecture Patterns

### Recommended Documentation Structure
```
README.md                    # Main documentation (update existing)
├── Quick Start (NEW)        # 3 commands with inline hints
├── Prerequisites            # Node.js, Mosquitto, SQLite3
├── Architecture             # Existing diagram
├── Configuration            # Reference style
├── Troubleshooting          # Expanded from existing
└── Project Structure        # Existing

examples/configs/            # NEW directory
├── minerva.config.yaml      # Orchestrator role
├── vulcan.config.yaml       # Builder role
└── worker.config.yaml       # Worker role

docs/                        # Optional future expansion
└── api/                     # API reference (if needed)
```

### Pattern 1: Quick Start with Inline Failure Hints
**What:** 3-command installation sequence with each command followed by "If you see X, do Y" hints
**When to use:** Developer's first interaction with the project
**Example:**
```markdown
## Quick Start

### 1. Install and Build

```bash
npm install && npm run build
```

**If you see:** `Cannot find module '@openclaw-swarm/coordination'`
**Fix:** Run `npm run build` to compile TypeScript to `dist/` before running agents.

**If you see:** `EACCES` permission errors
**Fix:** Don't use `sudo` with npm. Fix npm permissions: [Node.js guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)

### 2. Run Setup and Start API

```bash
npm run setup && npm run api
```

**If you see:** `Mosquitto persistence disabled`
**Warning:** Messages will be lost on broker restart. See [Mosquitto Configuration](#mosquitto-configuration) below.

**If you see:** `Error: connect ECONNREFUSED`
**Fix:** Start Mosquitto: `sudo systemctl start mosquitto` or `docker run -p 1883:1883 eclipse-mosquitto`

### 3. Verify System

```bash
curl http://localhost:3000/health
```

**Expected output:** `{"status":"healthy","checks":{...}}`
**If you see:** `Connection refused`
**Fix:** Ensure API server is running on port 3000. Check logs for startup errors.
```

### Pattern 2: Annotated Configuration Files
**What:** Full YAML configuration files with every option set and explained via comments
**When to use:** Developers copy-paste and modify for their environment
**Example:**
```yaml
# =============================================================================
# Minerva Agent Configuration
# =============================================================================
# Role: Orchestrator - delegates tasks to workers, manages project context
# Machine: griak-brain (Beelink T4, 4GB RAM)
# =============================================================================

# Agent identification (required)
agentId: minerva

# Agent role determines routing behavior (required)
# Options: orchestrator | worker
role: orchestrator

# MQTT broker connection (required)
# Format: mqtt://hostname:port or mqtts://hostname:port for TLS
brokerUrl: mqtt://griak-brain:1883

# Agent capabilities for task routing (required)
# Workers receive tasks matching these capabilities
# Orchestrators typically have all capabilities for delegation
capabilities:
  - code      # Write and modify code
  - test      # Run test suites
  - debug     # Debug failures
  - plan      # Plan and break down tasks

# Heartbeat interval in milliseconds (optional, default: 30000)
# Lower = faster failure detection but more network traffic
# Recommended: 30000 (30 seconds) for edge networks
heartbeatInterval: 30000

# =============================================================================
# Mosquitto Persistence Warning
# =============================================================================
# If using snap installation: persistence is disabled by default
# Fix: Add to /var/snap/mosquitto/current/mosquitto.conf:
#   persistence true
#   autosave_interval 1800
# Or install via apt: sudo apt install mosquitto mosquitto-clients
# =============================================================================
```

### Pattern 3: Actionable Error Messages
**What:** Error messages with "Fix:" section containing specific commands or config changes
**When to use:** All errors that developers can self-resolve
**Example:**
```typescript
// In connection error handler:
throw new Error(
  'MQTT connection failed: ECONNREFUSED\n' +
  '\n' +
  'Fix: Start Mosquitto broker:\n' +
  '  systemctl: sudo systemctl start mosquitto\n' +
  '  Docker:     docker run -p 1883:1883 eclipse-mosquitto\n' +
  '\n' +
  'Verify: mosquitto_sub -h localhost -t \'$SYS/#\' -v'
);
```

### Anti-Patterns to Avoid
- **Wall of text:** Don't put all information in one section. Use headings, bullet points, and code blocks.
- **Assumed knowledge:** Don't assume developers know Mosquitto or MQTT. Explain briefly.
- **Vague errors:** Avoid "Error connecting to broker" — be specific: "MQTT connection failed: ECONNREFUSED (broker not running)"
- **Scattered warnings:** Don't bury Mosquitto persistence warning in troubleshooting. Make it prominent near quick start.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API documentation | Custom HTML/docs | JSDoc comments in source (already exists) | Type definitions generated by tsc, no separate docs needed |
| Terminal output formatting | Custom table code | cli-table3 (already installed) | Handles borders, alignment, colors automatically |
| Config file parsing | Custom YAML parser | js-yaml or similar (if needed) | YAML is standard, well-tested, handles edge cases |
| Documentation site | Custom static site | GitHub README (single page sufficient for v1.2) | No build step, renders natively, search via GitHub |

**Key insight:** Documentation should be in the repository (README.md, inline comments), not separate build artifacts. Keep it simple, keep it version-controlled.

## Common Pitfalls

### Pitfall 1: Quick Start Assumes Perfect Environment
**What goes wrong:** Documentation says "run npm install" but doesn't handle Mosquitto not running, Node.js wrong version, or missing build step.
**Why it happens:** Authors write docs after system is working, forgetting initial setup hurdles.
**How to avoid:** Each command in quick start must have inline "If you see X, do Y" hints for common failures.
**Warning signs:** Developer reports "doesn't work" without details — usually environment issues.

### Pitfall 2: Mosquitto Snap Installation Persistence Disabled
**What goes wrong:** Developers install Mosquitto via snap, which has persistence disabled by default. Messages lost on restart, confusion about why agents disappear.
**Why it happens:** Snap packaging doesn't enable persistence for security sandboxing.
**How to avoid:** Check in setup script (already implemented), add prominent warning in README near quick start.
**Warning signs:** "Agents disappear after broker restart" in troubleshooting.

### Pitfall 3: Example Configs Not Copy-Pasteable
**What goes wrong:** Example configs show only a few options, developers don't know valid values for the rest.
**Why it happens:** Documentation shows "minimal" examples for brevity.
**How to avoid:** Provide full annotated configs with every option set and explained.
**Warning signs:** Questions like "what's the default for X?" in issues.

### Pitfall 4: Error Messages Without Next Steps
**What goes wrong:** Errors throw generic messages like "Connection failed" — developers don't know how to fix.
**Why it happens:** Error messages written for developers who already know the system.
**How to avoid:** Add "Fix:" section with specific commands or config changes for all common errors.
**Warning signs:** Support burden from repeated questions about same error.

### Pitfall 5: Documentation Drifts from Code
**What goes wrong:** README shows config options that changed, or examples use old import paths.
**Why it happens:** Code updated but docs not — single source of truth problem.
**How to avoid:** Run tests as part of documentation verification (examples should actually run), keep examples in `examples/` directory and test them.
**Warning signs:** "Docs say X but code does Y" issues.

## Code Examples

Verified patterns from existing codebase:

### Setup Script with Fix Suggestions
```javascript
// Source: /home/gr3gg0rk/openclaw-swarm/scripts/setup.mjs
if (!nodeCheck.pass) {
  console.log(table.toString());
  console.log(chalk.red('\nSetup failed! Fix: ' + nodeCheck.fix));
  process.exit(1);
}
```

### Mosquitto Persistence Check
```javascript
// Source: /home/gr3gg0rk/openclaw-swarm/scripts/utils/mqtt-check.mjs
if (snapInstall && !hasPersistence) {
  return {
    enabled: false,
    configPath,
    warning: 'Mosquitto installed via snap with persistence disabled. Messages may be lost on restart. Enable persistence in mosquitto.conf or install via apt.',
    message: 'Disabled (snap install)'
  };
}
```

### Structured Error Logger (for Fix: suggestions)
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/errors/logger.ts
export function createErrorContext(
  error: Error | unknown,
  agentId: string,
  messageId: string,
  taskId?: string,
  additionalContext?: Record<string, unknown>
): ErrorContext {
  const isError = error instanceof Error;
  return {
    taskId,
    agentId,
    messageId,
    timestamp: new Date().toISOString(),
    error: {
      message: isError ? error.message : String(error),
      code: isError && 'code' in error ? String(error.code) : undefined,
      stack: isError ? error.stack : undefined,
    },
    context: additionalContext,
  };
}
```

### Health Check Endpoint (for verification command)
```typescript
// Source: /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/api/routes/health.ts
router.get('/health', async (req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = {
    imports: await checkImports(),
    database: checkDatabase(db),
    mqtt: checkMqtt(mqttClient)
  };
  const statusCode = status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({ status, checks, timestamp: new Date().toISOString() });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manually written docs | Docs-as-code (README + JSDoc) | ~2020s | Docs version-controlled with code, no build step |
| Quick start assumes perfect world | Quick start with inline failure hints | Modern best practice | Reduced developer friction, faster onboarding |
| Single example config | Role-specific annotated configs | Industry standard | Clearer intent, copy-pasteable |
| Generic error messages | Actionable errors with Fix: suggestions | DevRel best practice | Reduced support burden, self-service debugging |

**Deprecated/outdated:**
- **Separate CHANGES.md**: Use git commit history and release notes instead
- **Wiki-based docs**: Keep docs in repo for version control
- **Manually maintained API docs**: Use JSDoc + TypeScript type definitions

## Open Questions

1. **Error message coverage**
   - What we know: Error logger exists, some errors have context
   - What's unclear: Which specific errors in the codebase currently lack "Fix:" suggestions
   - Recommendation: Audit all throw statements and error logs in packages/coordination/src, add Fix: suggestions to common failures (MQTT connection, database access, config parsing)

2. **Config validation documentation**
   - What we know: Config is YAML, parsed by basic-agent.ts
   - What's unclear: Should we document schema validation errors?
   - Recommendation: Add "Config validation" section to README with common invalid config examples and their error messages

## Sources

### Primary (HIGH confidence)
- Existing codebase files:
  - /home/gr3gg0rk/openclaw-swarm/README.md - Current documentation state
  - /home/gr3gg0rk/openclaw-swarm/scripts/setup.mjs - Setup script with failure handling
  - /home/gr3gg0rk/openclaw-swarm/scripts/utils/mqtt-check.mjs - Mosquitto persistence check
  - /home/gr3gg0rk/openclaw-swarm/packages/coordination/src/errors/logger.ts - Error logging patterns
  - /home/gr3gg0rk/openclaw-swarm/examples/config.yaml - Existing example config
  - /home/gr3gg0rk/openclaw-swarm/examples/basic-agent.ts - Example agent implementation
  - /home/gr3gg0rk/openclaw-swarm/package.json - Project dependencies and scripts
  - /home/gr3gg0rk/openclaw-swarm/packages/coordination/package.json - Coordination package details

### Secondary (MEDIUM confidence)
- Mosquitto snap persistence issue: Known issue with snap packaging, verified by setup script implementation
- Node.js documentation: Version requirements from package.json engines field
- Industry documentation patterns: GitHub README as single source of truth

### Tertiary (LOW confidence)
- None — all findings verified from existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools (Markdown, YAML, JSDoc) are standard and verified in codebase
- Architecture: HIGH - Documentation structure follows proven patterns, existing README analyzed
- Pitfalls: HIGH - Based on actual issues identified in setup script and Mosquitto check
- Error patterns: HIGH - Existing error logger reviewed, patterns identified

**Research date:** 2026-02-23
**Valid until:** 90 days (documentation patterns are stable, unlikely to change)
