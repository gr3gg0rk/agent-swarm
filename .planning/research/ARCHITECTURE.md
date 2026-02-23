# Architecture Research: npm Package Exports & Setup Tooling Integration

**Domain:** npm ESM package with monorepo setup tooling
**Researched:** 2026-02-23
**Overall confidence:** MEDIUM (Web search unavailable, using codebase analysis + established Node.js patterns)

## Executive Summary

The OpenClaw Swarm coordination package is an ESM-first TypeScript library with a modular architecture. Current state shows good module organization but missing exports for the optimization module and incomplete setup tooling. The package uses Node16 module resolution with subpath exports pattern.

Key findings:
- **Exports architecture**: Already using `exports` field in package.json with conditional imports (ESM-only)
- **Missing exports**: Optimization module not in main index.ts re-exports
- **Setup scripts**: No dedicated setup/validation tooling exists
- **Health checks**: Already implemented via `HealthCheckServer` class and Express routes
- **Monorepo structure**: Root package.json lacks workspaces configuration

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Consumer Layer                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Agent     │  │   API       │  │  Dashboard/CLI      │  │
│  │   Scripts   │  │   Server    │  │  Apps               │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
├─────────┼────────────────┼─────────────────────┼─────────────┤
│         │                │                     │              │
│         v                v                     v              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           Package Entry Point (index.ts)                │ │
│  │           @openclaw-swarm/coordination                  │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Module Layer (ESM)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │communi- │  │disco-   │  │delega-  │  │optimi-  │        │
│  │cation  │  │very     │  │tion     │  │zation   │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
├───────┴────────────┴────────────┴────────────┴──────────────┤
│                    Foundation Layer                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  state/  lifecycle/  checkpoint/  memory/  errors/  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Main Entry (index.ts)** | Barrel export of all public APIs | Re-exports from each module's index.ts |
| **Module Index** | Public API surface for that module | Selective exports, not `export *` |
| **Setup Scripts** | Environment validation, schema init | Node.js CLI scripts in `scripts/` or `bin/` |
| **Health Checks** | Runtime liveness/readiness probes | HTTP endpoint or CLI command |
| **npm exports** | Package boundary definition | package.json `exports` field |

## Recommended Project Structure

```
packages/coordination/
├── src/
│   ├── index.ts              # Main barrel export (PUBLIC API)
│   ├── communication/        # MQTT communication
│   │   └── index.ts
│   ├── discovery/            # Agent discovery
│   │   └── index.ts
│   ├── delegation/           # Task delegation
│   │   └── index.ts
│   ├── state/                # Database operations
│   │   ├── index.ts          # Exports: Database, initializeSchema
│   │   ├── database.ts       # INTERNAL: connectToDatabase
│   │   ├── schema.ts         # INTERNAL: table definitions
│   │   └── task-queue.ts
│   ├── lifecycle/            # Health, heartbeat, shutdown
│   │   └── index.ts
│   ├── optimization/         # NEW: Missing from main exports
│   │   └── index.ts          # Exports: MessageBatcher, ConnectionPoolManager
│   ├── setup/                # NEW: Setup and validation utilities
│   │   ├── index.ts          # Public setup API
│   │   ├── health.ts         # Health check functions
│   │   └── schema.ts         # Schema initialization utilities
│   └── ...
├── scripts/                  # NEW: Setup and utility scripts
│   ├── setup.ts              # Environment validation and init
│   ├── validate.ts           # Health check CLI
│   └── init-schema.ts        # Database initialization
├── bin/                      # NEW: Executable commands (optional)
│   └── openclaw-health       # Symlink to scripts/validate.ts
├── dist/                     # Compiled output
├── package.json              # Exports field configuration
└── tsconfig.json

root/
├── package.json              # ADD: workspaces configuration
├── scripts/                  # NEW: Cross-package utilities
│   ├── install.sh            # Development environment setup
│   └── validate-env.sh       # Mosquitto/config validation
└── packages/
    ├── coordination/
    └── dashboard/
```

### Structure Rationale

- **`scripts/`**: Separates runtime code from setup/dev tooling. Follows Node.js convention where scripts are development/deployment utilities, not library code.
- **`bin/`**: Optional, for npm-installed CLI commands. Useful for health checks without requiring users to write code.
- **`src/setup/`**: New module for setup/validation utilities that can be imported programmatically or used via CLI scripts.
- **Module index.ts files**: Each module's public API surface. Should export only what users need, not internal implementation details.
- **Main index.ts**: Single entry point that re-exports all public modules. Provides flat import surface: `import { X } from '@openclaw-swarm/coordination'`.

## Architectural Patterns

### Pattern 1: Subpath Exports for Modular Access

**What:** Define multiple entry points in package.json using the `exports` field. Allows importing specific modules without pulling in entire package.

**When to use:**
- Package has logical module boundaries
- Users may only need subsets of functionality
- Tree-shaking benefits desired

**Trade-offs:**
- Pros: Better tree-shaking, smaller bundles, explicit API surface
- Cons: More complex package.json, harder to reorganize later

**Example package.json:**
```json
{
  "name": "@openclaw-swarm/coordination",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./communication": {
      "types": "./dist/communication/index.d.ts",
      "import": "./dist/communication/index.js"
    },
    "./state": {
      "types": "./dist/state/index.d.ts",
      "import": "./dist/state/index.js"
    },
    "./optimization": {
      "types": "./dist/optimization/index.d.ts",
      "import": "./dist/optimization/index.js"
    },
    "./setup": {
      "types": "./dist/setup/index.d.ts",
      "import": "./dist/setup/index.js"
    }
  }
}
```

**Usage:**
```typescript
// Import everything from main entry
import { AgentDelegator, MessageBatcher } from '@openclaw-swarm/coordination';

// Import only optimization module (tree-shakeable)
import { MessageBatcher } from '@openclaw-swarm/coordination/optimization';

// Import setup utilities
import { validateEnvironment } from '@openclaw-swarm/coordination/setup';
```

### Pattern 2: Setup Script as Separate Entry Point

**What:** Export setup/validation functions via a dedicated subpath export (`./setup`). Keeps initialization code separate from library code.

**When to use:**
- Package requires environment validation before use
- Database schema initialization needed
- One-time setup operations that aren't part of runtime API

**Trade-offs:**
- Pros: Clear separation, opt-in for users, doesn't bloat main bundle
- Cons: Users must know to import from separate path

**Example setup module:**
```typescript
// packages/coordination/src/setup/index.ts
export interface SetupOptions {
  mqttBrokerUrl: string;
  databasePath: string;
  agentConfigPath: string;
}

export interface SetupResult {
  success: boolean;
  checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message?: string }>;
}

export async function validateEnvironment(options: SetupOptions): Promise<SetupResult> {
  const checks: SetupResult['checks'] = [];

  // Check MQTT connectivity
  try {
    await checkMqttConnection(options.mqttBrokerUrl);
    checks.push({ name: 'MQTT Connection', status: 'pass' });
  } catch (error) {
    checks.push({ name: 'MQTT Connection', status: 'fail', message: String(error) });
  }

  // Check database permissions
  try {
    await checkDatabaseWritable(options.databasePath);
    checks.push({ name: 'Database Access', status: 'pass' });
  } catch (error) {
    checks.push({ name: 'Database Access', status: 'fail', message: String(error) });
  }

  // Check Mosquitto persistence (critical for agent discovery)
  try {
    await checkMosquittoPersistence(options.mqttBrokerUrl);
    checks.push({ name: 'Mosquitto Persistence', status: 'pass' });
  } catch (error) {
    checks.push({ name: 'Mosquitto Persistence', status: 'fail', message: String(error) });
  }

  return {
    success: checks.every(c => c.status !== 'fail'),
    checks
  };
}

export async function initializeDatabaseSchema(databasePath: string): Promise<void> {
  const Database = await import('better-sqlite3');
  const db = new Database.default(databasePath);
  initializeSchema(db);
  db.close();
}
```

### Pattern 3: Health Check via bin/ Command

**What:** Provide executable CLI command via npm bin field. Allows health checks without writing code.

**When to use:**
- Operations teams need simple health check command
- Integration with monitoring systems (Nagios, Prometheus, etc.)
- Docker/Kubernetes health probes

**Trade-offs:**
- Pros: Simple integration, language-agnostic monitoring
- Cons: Requires compilation, adds npm package size

**Example:**
```json
// package.json
{
  "name": "@openclaw-swarm/coordination",
  "bin": {
    "openclaw-health": "./bin/health-check.js"
  }
}
```

```typescript
// bin/health-check.js
#!/usr/bin/env node
import { performHealthCheck } from '../dist/setup/health.js';

const result = await performHealthCheck({
  databasePath: process.env.DATABASE_PATH || './state/swarm.db',
  mqttUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883'
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.healthy ? 0 : 1);
```

## Data Flow

### Setup Validation Flow

```
[npm run setup] or [node scripts/setup.ts]
    ↓
validateEnvironment(options)
    ↓
├── MQTT Connectivity Check → [mqtt.connect() → ping]
├── Database Permissions Check → [test write → cleanup]
├── Agent Config Load Check → [fs.readFile → YAML parse]
└── Mosquitto Persistence Check → [MQTT subscribe $SYS → check retained]
    ↓
[Result Report] → [Exit 0 if pass, 1 if fail]
```

### Module Import Flow

```
[User Code]
    import { AgentDelegator } from '@openclaw-swarm/coordination'
    ↓
[package.json exports field]
    "." → "./dist/index.js" (ESM only)
    ↓
[dist/index.js - barrel export]
    export * from './delegation/index.js'
    ↓
[dist/delegation/index.js - public API]
    export { AgentDelegator } from './delegator.js'
    ↓
[dist/delegation/delegator.js - implementation]
    import ... from '../state/index.js'
    import ... from '../communication/index.js'
```

### Health Check Integration Flow

```
[External Monitor]
    ↓
HTTP GET /health OR openclaw-health CLI
    ↓
[HealthCheckServer or Express Route]
    ├── Database: SELECT 1 → connected/disconnected
    ├── MQTT: client.connected check → connected/disconnected
    └── Heartbeat: last publish time → publishing/stopped
    ↓
{ status: 'healthy' | 'unhealthy', checks: {...} }
    ↓
[Monitor] → 200 OK or 503 Unavailable
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 packages | Single `scripts/` at root, shared setup utilities |
| 10-50 packages | Package-specific `scripts/`, shared `tools/` for common utilities |
| 50+ packages | Dedicated tooling package, separate repository for DevOps tools |

### Scaling Priorities

1. **First bottleneck:** Setup script maintenance. As packages grow, duplicating setup logic becomes unwieldy.
   - **Fix:** Create shared `@openclaw-swarm/tools` package with common setup functions

2. **Second bottleneck:** Export management. Manually syncing package.json exports with actual files.
   - **Fix:** Use TypeScript compiler API to auto-generate exports from src/ structure

## Anti-Patterns

### Anti-Pattern 1: Exporting Internal Implementation Details

**What people do:**
```typescript
// src/state/index.ts
export * from './database.js';  // Exports connectToDatabase()
export * from './schema.js';    // Exports raw table definitions
```

**Why it's wrong:**
- Users depend on internal functions, preventing refactoring
- Breaks semantic versioning (changes to internals become breaking changes)
- Bloats public API surface

**Do this instead:**
```typescript
// src/state/index.ts - Export only public API
export { Database, type DatabaseConfig } from './database.js';
export { initializeSchema, type Schema } from './schema.js';

// Keep connectToDatabase() internal - only used by initializeSchema()
```

### Anti-Pattern 2: Mixing Runtime and Setup Code

**What people do:**
```typescript
// src/index.ts
export * from './agents.js';
export * from './setup.js';  // validateEnvironment() pulls in dev dependencies
```

**Why it's wrong:**
- Setup code often has dev-only dependencies (chalk, inquirer, etc.)
- Forces runtime users to pull in unnecessary dependencies
- Blurs boundary between library and tooling

**Do this instead:**
```typescript
// package.json with subpath export
{
  "exports": {
    ".": "./dist/index.js",           // Runtime library
    "./setup": "./dist/setup.js"      // Setup tooling (optional import)
  },
  "optionalDependencies": {
    // Setup dependencies here
  }
}
```

### Anti-Pattern 3: Missing exports Field

**What people do:**
```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

**Why it's wrong:**
- No encapsulation (users can import any file via deep import)
- No TypeScript types for subpaths
- Can't opt into ESM-only patterns cleanly

**Do this instead:**
```json
{
  "main": "./dist/index.js",  // Fallback for old tools
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./utils": { "types": "./dist/utils.d.ts", "import": "./dist/utils.js" }
  }
}
```

### Anti-Pattern 4: Missing Workspaces in Monorepo

**What people do:**
```json
// root package.json - missing workspaces
{
  "name": "openclaw-swarm",
  "dependencies": { ... }
}
```

**Why it's wrong:**
- No automatic linking of local packages
- Manual `npm link` required for development
- Hoisted dependencies can cause version conflicts

**Do this instead:**
```json
// root package.json
{
  "name": "openclaw-swarm",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev": "npm run dev --workspaces"
  }
}
```

## Integration Points

### Existing Package Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `coordination` → `dashboard` | REST API + SSE | Dashboard is separate consumer, not part of coordination package |
| `coordination` → `agent scripts` | npm import | Agents import from `@openclaw-swarm/coordination` |
| `coordination` → MQTT broker | MQTT protocol | External dependency, health check validates connectivity |
| `coordination` → SQLite | better-sqlite3 | Managed internally, schema exposed via `initializeSchema()` |

### New Components Required

| Component | Location | Purpose |
|-----------|----------|---------|
| `scripts/setup.ts` | `packages/coordination/scripts/` | Environment validation CLI |
| `scripts/validate.ts` | `packages/coordination/scripts/` | Runtime health check CLI |
| `src/setup/index.ts` | `packages/coordination/src/setup/` | Setup utilities for programmatic use |
| `src/setup/health.ts` | `packages/coordination/src/setup/` | Health check functions |
| `bin/` | `packages/coordination/bin/` | Executable commands (optional) |
| `scripts/` (root) | `scripts/` | Cross-package setup utilities |

### Build Order

```
Phase 1: Fix Missing Exports (Quick Win)
├─ Add optimization export to src/index.ts
└─ Verify all modules have index.ts barrel exports

Phase 2: Create Setup Module
├─ src/setup/index.ts (validateEnvironment, initializeSchema)
├─ src/setup/health.ts (performHealthCheck)
├─ src/setup/mosquitto.ts (checkMosquittoPersistence)
└─ Update package.json exports field with "./setup" subpath

Phase 3: Create Setup Scripts
├─ scripts/setup.ts (development environment validation)
├─ scripts/validate.ts (runtime health check)
└─ scripts/init-schema.ts (database initialization)

Phase 4: Add npm bin Commands (Optional)
├─ package.json "bin" field
├─ bin/health-check.js
└─ bin/setup-validator.js

Phase 5: Update Monorepo Root
├─ Add workspaces configuration to package.json
├─ Add root-level scripts/ for cross-package operations
└─ Create install.sh script for first-time setup
```

### Modified vs New Files

| File | Action | Reason |
|------|--------|--------|
| `packages/coordination/src/index.ts` | **MODIFY** | Add optimization export |
| `packages/coordination/package.json` | **MODIFY** | Add subpath exports for setup module |
| `packages/coordination/src/setup/index.ts` | **NEW** | Setup utilities export |
| `packages/coordination/src/setup/health.ts` | **NEW** | Health check implementation |
| `packages/coordination/src/setup/mosquitto.ts` | **NEW** | Mosquitto persistence check |
| `packages/coordination/scripts/setup.ts` | **NEW** | Setup validation script |
| `packages/coordination/scripts/validate.ts` | **NEW** | Health check CLI script |
| `packages/coordination/bin/health-check.js` | **NEW** | Executable health check command |
| `package.json` (root) | **MODIFY** | Add workspaces configuration |
| `scripts/install.sh` (root) | **NEW** | Cross-package setup utilities |

### Dependencies Between Components

```
setup Module (NEW)
    ├── depends on: communication (mqtt client)
    ├── depends on: state (database, schema)
    └── depends on: errors (logging)

Health Check Scripts
    ├── import from: setup/health
    └── import from: setup/index

Main Entry (index.ts)
    ├── already exports: communication, discovery, delegation, state, lifecycle, checkpoint, memory, errors, api
    └── ADD: export from optimization (currently missing)

Subpath Exports (package.json)
    ├── "." → main entry
    ├── "./communication" → communication module
    ├── "./state" → state module
    ├── "./optimization" → optimization module
    └── "./setup" → setup module (NEW)
```

## Sources

**Note:** Web search and web reader tools were unavailable during research (quota exceeded). Findings are based on:

- **Codebase analysis:** Extensive examination of existing coordination package structure
- **Installation issues report:** `.planning/issues/INSTALLATION-ISSUES-griak-brain.md`
- **Node.js documentation standards:** Established patterns from Node.js and npm ecosystem
- **TypeScript module resolution:** Current tsconfig.json using Node16 module resolution
- **Existing implementation:** HealthCheckServer, Express health routes, module index patterns

**Confidence levels:**
- ESM export patterns: **MEDIUM** (Standard Node.js patterns, verified against codebase)
- Setup script placement: **MEDIUM** (Established convention, but could not verify recent community trends)
- Health check integration: **HIGH** (Existing implementation analyzed, patterns verified)
- Monorepo workspaces: **HIGH** (npm workspaces is standard pattern)

**Areas requiring phase-specific research:**
- Current best practices for npm bin command compilation (pkg vs nexe vs others)
- Mosquitto persistence check implementation details (MQTT $SYS topics)
- Systemd service file templates for Node.js applications
- Cross-package setup tooling patterns in monorepos
- Package.json `exports` field best practices for conditional exports (browser vs node)

---
*Architecture research for: OpenClaw Swarm coordination package v1.2*
*Researched: 2026-02-23*
