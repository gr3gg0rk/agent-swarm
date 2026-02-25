# OpenClaw Swarm - Installation Issues & Fixes

## Summary

This document describes the issues encountered when installing and configuring OpenClaw Swarm on griak-brain (Ubuntu/Debian with snap packages), along with the fixes applied. These issues should be addressed to improve the out-of-box experience for new users.

## Issues Encountered

### 1. npm Workspaces Not Configured

**Problem:** The monorepo structure was not set up as npm workspaces, causing module resolution failures.

**Error:**
```
Error: Cannot find module '@openclaw-swarm/coordination'
```

**Fix:** Added workspaces configuration to `package.json`:
```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

**Recommendation:** The repo should ship with this configuration enabled by default.

---

### 2. Optimization Module Not Exported

**Problem:** The optimization module (`loadOptimizationConfig`, `MessageBatcher`, `ConnectionPoolManager`) was not exported from the main index.ts, causing "is not a function" errors.

**Fix:** Added export to `packages/coordination/src/index.ts`:
```typescript
// Re-export all optimization types and functions
export * from './optimization/index.js';
```

**Recommendation:** Verify all public modules are exported from the main index.

---

### 3. msgpackr Import Incorrect

**Problem:** The code used `import { MessagePack } from 'msgpackr'` but msgpackr exports `encode` and `decode` directly.

**Error:**
```
TypeError: Cannot read properties of undefined (reading 'encode')
```

**Fix:** Changed `packages/coordination/src/optimization/batcher.ts`:
```typescript
// Before
import { MessagePack } from 'msgpackr';
const payload = MessagePack.encode(envelopes);

// After
import { encode } from 'msgpackr';
const payload = encode(envelopes);
```

**Recommendation:** Use the correct msgpackr API or add type declarations.

---

### 4. Database Pragma Return Value Issue

**Problem:** better-sqlite3's `pragma()` returns an object by default, not a string. The code expected a string.

**Error:**
```
Error: Failed to enable WAL mode: got [object Object]
```

**Fix:** Changed `packages/coordination/src/state/database.ts`:
```typescript
// Before
const result = db.pragma('journal_mode = WAL');

// After
const result = db.pragma('journal_mode = WAL', { simple: true });
```

**Recommendation:** Use the `{ simple: true }` option for pragma calls that return single values.

---

### 5. Missing Database Schema Initialization

**Problem:** The API server tried to use tables that didn't exist. No initialization function was called.

**Error:**
```
SqliteError: no such table: tasks
```

**Fix:** Added schema initialization to API server and exported it:
```typescript
import { initializeSchema } from './packages/coordination/dist/index.js';
// ...
initializeSchema(db);
```

Also added export to `packages/coordination/src/index.ts`:
```typescript
export * from './state/schema.js';
```

**Recommendation:** Provide a startup script or ensure schema is auto-initialized on first run.

---

### 6. Column Count Mismatch in INSERT Statement

**Problem:** The INSERT statement had 16 placeholders but the table only had 15 columns.

**Error:**
```
SqliteError: 16 values for 15 columns
```

**Fix:** Removed extra placeholder in `packages/coordination/src/state/task-queue.ts`:
```typescript
// Before
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

// After
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**Recommendation:** Add integration tests that verify INSERT statements match table schema.

---

### 7. Agent Registry Not Loaded

**Problem:** The agent tried to register but the agent registry was empty, causing validation failure.

**Error:**
```
Error: Unknown agent ID "minerva". Must be one of:
```

**Fix:** Added agent config loading to the example agent:
```typescript
import { loadAgentConfig } from '../packages/coordination/dist/index.js';
const agentRegistryPath = process.env.AGENT_REGISTRY_PATH || '/path/to/config/agents.yaml';
await loadAgentConfig(agentRegistryPath);
```

**Recommendation:** Make the example agent more robust or provide better error messages.

---

### 8. Mosquitto Snap Has Persistence Disabled

**Problem:** The snap version of Mosquitto ships with `persistence false`, which disables retained messages. This breaks agent discovery which relies on retained MQTT messages.

**Impact:** Agents register successfully but the discovery data is not persisted, causing the dashboard to show no agents even when they are online.

**Workaround:** Stop the snap mosquitto and use the system version:
```bash
sudo systemctl stop snap.mosquitto.mosquitto.service
sudo systemctl disable snap.mosquitto.mosquitto.service
sudo systemctl start mosquitto
```

**Recommendation:**
1. Document this requirement prominently
2. Provide a setup script that checks/configures Mosquitto
3. Consider an alternative discovery mechanism that doesn't rely on retained messages
4. Add a health check that warns if persistence is disabled

---

### 9. No Startup Scripts

**Problem:** Each service had to be started manually with long commands.

**Recommendation:** Provide systemd service files or a convenience script:
```bash
# Start all services
./start-swarm.sh

# Or systemd services
systemctl start openclaw-mqtt
systemctl start openclaw-dashboard
systemctl start openclaw-api
systemctl start openclaw-agent@minerva
```

---

### 10. Example Agent Used Package Imports

**Problem:** The example agent tried to import `@openclaw-swarm/coordination` which only works with proper npm link/workspace setup.

**Fix:** Created `basic-agent-local.ts` with relative imports as a workaround.

**Recommendation:** Ensure the repo can be used with standard npm install without workarounds.

---

## Suggested Improvements

### High Priority

1. **Add npm workspaces configuration** to root package.json
2. **Fix all imports** to use the correct module exports
3. **Add a setup script** that:
   - Checks Mosquitto configuration
   - Initializes the database schema
   - Verifies all dependencies
4. **Provide systemd service files** for easy deployment
5. **Document Mosquitto requirements** prominently in README

### Medium Priority

6. **Add integration tests** for database operations
7. **Provide a health check endpoint** that includes Mosquitto status
8. **Add better error messages** when agent registration fails
9. **Create example configs** for each agent role
10. **Add a docker-compose option** for easier local development

### Low Priority

11. **Add a web-based setup wizard**
12. **Provide package manager scripts** (pkg, nexe) for standalone binaries
13. **Add telemetry/monitoring** for production deployments

---

## Working Setup Commands

For reference, here's what finally worked:

```bash
# Install dependencies
cd /home/gr3gg0rk/agent-swarm
npm install
cd packages/coordination && npm install && npm run build
cd ../dashboard && npm install

# Start MQTT broker (ensure persistence is enabled)
sudo systemctl stop snap.mosquitto.mosquitto.service
sudo systemctl start mosquitto

# Start dashboard
cd packages/dashboard && npm run dev -- --host

# Start API server
cd /home/gr3gg0rk/agent-swarm
node_modules/.bin/tsx start-api-server.ts

# Start Minerva agent
CONFIG_PATH=/home/gr3gg0rk/agent-swarm/minerva-config.yaml \
AGENT_REGISTRY_PATH=/home/gr3gg0rk/agent-swarm/config/agents.yaml \
node_modules/.bin/tsx examples/basic-agent-local.ts
```

---

## Files Modified During Setup

1. `/home/gr3gg0rk/agent-swarm/package.json` - Added workspaces
2. `/home/gr3gg0rk/agent-swarm/packages/coordination/src/index.ts` - Added optimization and schema exports
3. `/home/gr3gg0rk/agent-swarm/packages/coordination/src/optimization/batcher.ts` - Fixed msgpackr import
4. `/home/gr3gg0rk/agent-swarm/packages/coordination/src/state/database.ts` - Fixed pragma call
5. `/home/gr3gg0rk/agent-swarm/packages/coordination/src/state/task-queue.ts` - Fixed column count
6. `/home/gr3gg0rk/agent-swarm/examples/basic-agent-local.ts` - Created workaround example
7. `/home/gr3gg0rk/agent-swarm/minerva-config.yaml` - Created agent config
8. `/home/gr3gg0rk/agent-swarm/start-api-server.ts` - Created API server startup script
