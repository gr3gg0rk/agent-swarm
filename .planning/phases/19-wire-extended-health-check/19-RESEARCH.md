# Phase 19: Wire Extended Health Check - Research

**Researched:** 2026-02-24
**Domain:** API Integration and Health Check Wiring
**Confidence:** HIGH

## Summary

Phase 19 is a focused integration phase that wires the existing `createExtendedHealthRoute` function (created in Phase 13) into the API server startup script (created in Phase 17). The extended health check already implements all three required checks (imports, database, MQTT), but it is not currently being used by the API server.

**Key findings:**

1. `createExtendedHealthRoute` already exists and is exported from `/packages/coordination/src/api/routes/health.ts`
2. The function signature requires `db` and optional `mqttClient` parameters
3. The API server (`createStateApi`) already accepts an optional `mqttClient` parameter but doesn't use it for health checks
4. MQTT.js underlying client exposes a `connected` property that matches the expected interface
5. The start-api script needs to: (a) import `createExtendedHealthRoute`, (b) optionally create MQTT client, (c) pass MQTT client to `createStateApi`

**Primary recommendation:** Replace `createHealthRoute` with `createExtendedHealthRoute` in the API server's route registration, and optionally create an MQTT client in the start-api script if not already present.

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                       | Research Support                                                                       |
| -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SETUP-03 | Health check endpoint verifies: imports work, database accessible, MQTT connected | `createExtendedHealthRoute` already implements all three checks. Only wiring required. |

</phase_requirements>

## Standard Stack

### Core

| Library        | Version         | Purpose                    | Why Standard                        |
| -------------- | --------------- | -------------------------- | ----------------------------------- |
| Express        | 4.x (existing)  | HTTP server for API routes | Already in use, no new dependencies |
| MQTT.js        | 5.x (existing)  | MQTT client library        | Already in use for communication    |
| better-sqlite3 | 11.9 (existing) | SQLite database            | Already in use for state storage    |

### Supporting

| Library | Version           | Purpose                           | When to Use                      |
| ------- | ----------------- | --------------------------------- | -------------------------------- |
| zx      | Latest (existing) | Script execution in start-api.mjs | Already used in start-api script |
| chalk   | Latest (existing) | Terminal colors                   | Already used in start-api script |

**Installation:** No new packages required. All dependencies already exist in the project.

## Architecture Patterns

### Recommended Integration Approach

The integration requires changes to two files:

**1. API Server (`packages/coordination/src/api/server.ts`)**

- Import `createExtendedHealthRoute` instead of `createHealthRoute`
- Pass `mqttClient` parameter to health route creation

**2. Start API Script (`scripts/start-api.mjs`)**

- Import `connectToBroker` from communication/mqtt module
- Optionally create MQTT client if configured
- Pass MQTT client to `createStateApi`

### Pattern 1: Optional MQTT Client in API Server

**What:** The API server should accept an optional MQTT client parameter and pass it to the health check route.

**When to use:** When the API server needs to verify MQTT connectivity as part of health checks.

**Example:**

```typescript
// Source: /packages/coordination/src/api/server.ts
import { createExtendedHealthRoute } from './routes/health.js';

export function createStateApi(db: Database.Database, mqttClient?: MqttClient): Application {
  const app = express();

  // Register routes with extended health check
  app.use('/', createExtendedHealthRoute(db, mqttClient));
  // ... other routes
}
```

### Pattern 2: Conditional MQTT Client Creation

**What:** The start-api script should conditionally create an MQTT client only if MQTT configuration is provided.

**When to use:** When the API server should run without MQTT if not configured (degraded mode).

**Example:**

```javascript
// Source: /scripts/start-api.mjs
import { connectToBroker } from './packages/coordination/dist/communication/mqtt.js';

// ... database initialization

// Optional MQTT client creation
let mqttClient;
if (config.mqttBrokerUrl && config.mqttClientId) {
  try {
    mqttClient = await connectToBroker({
      brokerUrl: config.mqttBrokerUrl,
      clientId: config.mqttClientId,
    });
    log(chalk.green('MQTT client connected'), 'info');
  } catch (error) {
    log(chalk.yellow('MQTT connection failed, continuing without MQTT'), 'info');
  }
}

// Create Express app with optional MQTT client
const app = createStateApi(db, mqttClient);
```

### Anti-Patterns to Avoid

- **Hard-coding MQTT configuration:** The API server should work without MQTT if not configured (health check should return "degraded" status)
- **Blocking server startup on MQTT failure:** If MQTT connection fails, the API server should still start and log the issue
- **Recreating existing health check logic:** The `createExtendedHealthRoute` function already exists; do not duplicate its implementation

## Don't Hand-Roll

| Problem                          | Don't Build                    | Use Instead                           | Why                                            |
| -------------------------------- | ------------------------------ | ------------------------------------- | ---------------------------------------------- |
| MQTT connection status checking  | Custom connection status logic | MQTT.js client's `connected` property | Already exposed by underlying client, reliable |
| Health check response formatting | Custom JSON structure          | Existing `HealthStatus` interface     | Consistent with Phase 13 implementation        |

**Key insight:** The extended health check implementation is complete. This phase is purely about wiring existing components together.

## Common Pitfalls

### Pitfall 1: Missing MQTT Configuration in api.json

**What goes wrong:** Start-api script attempts to connect to MQTT without configuration values, causing startup failure.

**Why it happens:** The current `config/api.json` only has `port` and `dbPath` fields.

**How to avoid:** Make MQTT client creation conditional on configuration presence. Provide sensible defaults or log clear warnings.

**Warning signs:** API server fails to start with "Cannot read property 'mqttBrokerUrl' of undefined"

### Pitfall 2: MQTT Client Type Mismatch

**What goes wrong:** TypeScript error when passing `MqttClient` to health check route expecting `{ connected: boolean }`.

**Why it happens:** The `createExtendedHealthRoute` function expects an object with a `connected` property, not the full `MqttClient` class.

**How to avoid:** Access the underlying MQTT.js client via `getRawClient()` or check that the interface matches.

**Warning signs:** TypeScript compilation error "Type 'MqttClient' is not assignable to type '{ connected: boolean }'"

### Pitfall 3: Forgetting to Rebuild After Source Changes

**What goes wrong:** Changes to TypeScript source files don't affect runtime behavior because start-api.mjs imports from `dist/`.

**Why it happens:** The coordination package must be rebuilt (`npm run build`) after modifying source files.

**How to avoid:** Always run `npm run build` after modifying `.ts` files in the coordination package.

**Warning signs:** Changes to server.ts have no effect, or old behavior persists after edits

## Code Examples

Verified patterns from the codebase:

### Creating MQTT Client from Configuration

```typescript
// Source: /packages/coordination/src/communication/mqtt.ts
import { connectToBroker } from './communication/mqtt.js';

const mqttClient = await connectToBroker({
  brokerUrl: 'mqtt://localhost:1883',
  clientId: 'api-server',
});
```

### Accessing MQTT Connection Status

```typescript
// Source: /packages/coordination/src/api/routes/health.ts (line 140-147)
function checkMqtt(mqttClient?: { connected: boolean }): ComponentHealth {
  if (!mqttClient) {
    return { status: 'skip', message: 'No MQTT client provided' };
  }
  return mqttClient.connected
    ? { status: 'pass', message: 'Connected' }
    : { status: 'fail', message: 'Not connected' };
}
```

### Extended Health Check Route Registration

```typescript
// Source: /packages/coordination/src/api/routes/health.ts (line 161-216)
export function createExtendedHealthRoute(
  db: Database.Database,
  mqttClient?: { connected: boolean }
): Router {
  const router = Router();

  router.get('/health', async (req: Request, res: Response) => {
    const checks: HealthStatus['checks'] = {
      imports: await checkImports(),
      database: checkDatabase(db),
      mqtt: checkMqtt(mqttClient),
    };
    // ... response logic
  });

  return router;
}
```

## State of the Art

| Old Approach                       | Current Approach                                | When Changed          | Impact                                                        |
| ---------------------------------- | ----------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| Basic health check (database only) | Extended health check (imports, database, MQTT) | Phase 13 (2026-02-24) | System health is more observable, catches import issues early |

**Current state:**

- `createExtendedHealthRoute` exists and is exported
- `createStateApi` accepts optional `mqttClient` parameter
- start-api.mjs creates database and starts server
- API config (`config/api.json`) has no MQTT configuration

**Gap identified in v1.2 audit:**

- The extended health check exists but is not wired into the API server
- MQTT client is not created in start-api.mjs
- Health check endpoint still uses basic `createHealthRoute` instead of extended version

## Open Questions

1. **Should MQTT be required for API server operation?**
   - What we know: API server can function without MQTT (state API endpoints work independently)
   - What's unclear: Whether the production deployment expects MQTT to always be available
   - Recommendation: Make MQTT optional, allow API server to start in degraded mode

2. **Should api.json include MQTT configuration?**
   - What we know: Other configs (agent.json, minerva.json) include brokerUrl and clientId
   - What's unclear: Whether the API server should have its own MQTT client or reuse an existing one
   - Recommendation: Add optional MQTT configuration to api.json for consistency

## Validation Architecture

> Nyquist validation is disabled for this project (workflow.nyquist_validation: false in .planning/config.json)

### Test Framework

| Property           | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| Framework          | None (manual verification)                             |
| Quick run command  | `npm run api` then `curl http://localhost:3000/health` |
| Full suite command | Manual verification of all three checks                |
| Estimated runtime  | ~5 seconds                                             |

### Phase Requirements → Verification Map

| Req ID   | Behavior                                                | Test Type | Verification Command                                 | File Exists? |
| -------- | ------------------------------------------------------- | --------- | ---------------------------------------------------- | ------------ |
| SETUP-03 | Health check returns status for imports, database, MQTT | manual    | `curl -s http://localhost:3000/health \| jq .checks` | ✅ Yes       |

### Wave 0 Gaps

None - this phase integrates existing functionality without adding new tests.

## Sources

### Primary (HIGH confidence)

- `/packages/coordination/src/api/routes/health.ts` - Extended health check implementation
- `/packages/coordination/src/api/server.ts` - API server creation and route registration
- `/packages/coordination/src/communication/mqtt.ts` - MQTT client connection and interface
- `/scripts/start-api.mjs` - Current API server startup script
- `/config/api.json` - Current API configuration

### Secondary (MEDIUM confidence)

- MQTT.js documentation - Client `connected` property behavior
- `.planning/REQUIREMENTS.md` - SETUP-03 requirement definition
- `.planning/ROADMAP.md` - Phase 19 description and success criteria

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All dependencies already in use, verified in package.json
- Architecture: HIGH - Existing code analyzed, patterns identified from source
- Pitfalls: HIGH - Based on analysis of existing implementation and config files

**Research date:** 2026-02-24
**Valid until:** 30 days (stable codebase, existing patterns)
