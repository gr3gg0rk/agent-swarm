# Technology Stack

**Domain:** Lightweight Agent Swarm Coordination System
**Researched:** 2025-02-21 (v1.0), Updated 2026-02-22 (v1.1 enhancements), 2026-02-23 (v1.2 installation)
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Memory/CPU | Why Recommended |
|------------|---------|---------|------------|-----------------|
| **Node.js** | ≥22.0.0 | Runtime (OpenClaw dependency) | ~50-100MB baseline | Required by OpenClaw gateway; async I/O ideal for coordination |
| **MQTT (Mosquitto)** | 2.0.x | Message broker for agent communication | ~3-10MB RAM | Industry standard for IoT, minimal footprint, QoS support, retained messages for agent discovery |
| **Better-SQLite3** | ^11.9.0 | Shared state persistence | ~5-15MB RAM | Faster than file I/O, ACID transactions, WAL mode for concurrency, single-file database |
| **MQTT.js** | ^5.0.0 | MQTT client for Node.js agents | ~2-5MB RAM per client | Standard Node.js MQTT client, mature, WebSocket support, built-in connection pooling |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **msgpackr** | ^0.6.0 | Binary serialization (MessagePack) | For task payloads >1KB; 3.5x faster than JSON, 15-50% smaller |
| **uuid** | ^11.0.0 | Agent and task ID generation | When you need distributed unique identifiers |
| **p-queue** | ^8.0.0 | In-memory task queue | For local task queuing before MQTT publishing |
| **eventemitter3** | ^6.0.0 | Async event handling | For decoupling agent components without heavy frameworks |

### v1.1 Additions

| Library | Version | Purpose | Bundle Size | Memory | When to Use |
|---------|---------|---------|-------------|--------|-------------|
| **Vite** | ^6.x | Dashboard build tool & dev server | ~50KB | ~50MB (dev only) | For development; static build in production |
| **Alpine.js** | ^3.x | Lightweight reactivity for dashboard UI | ~10KB | <1MB | For complex dashboard interactions |
| **Chart.js** | ^4.x | Data visualization (progress, metrics) | ~37-60KB | ~1.2-3MB | For timeline charts, capability matrix, metrics |
| **Native implementations** | Custom | Load balancing, message batching | <10KB code | <1MB | Always (no external libraries needed) |

**v1.1 Key Stack Decisions:**
- **NO external load balancing libraries** — Native weighted round-robin implementation (<5KB)
- **NO external batching libraries** — Native DynamicBatcher with adaptive sizing (<3KB)
- **NO Next.js/React for dashboard** — Too heavy for Pi 2B (300MB+ vs 50MB target)
- **SSE over WebSocket** — Built-in Node.js, lighter (~14KB library savings)
- **MQTT.js connection pool** — Built-in feature, 3-5 clients per machine (30-75MB total)

### v1.2 Additions (Package Distribution & DX)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **npm workspaces** | (native) | Monorepo management | Native npm support, zero overhead, matches project structure |
| **package.json "exports"** | (standard) | ESM entry points | Required for proper ESM package boundaries |
| **TypeScript paths** | (compiler option) | Import mapping | Enables clean imports, works with Node16 resolution |
| **zx** | ^8.0.0 | Setup automation scripts | Native ESM support, modern async/await, minimal deps vs ShellJS |
| **husky** | ^9.0.0 | Pre-commit hooks | Git hooks automation, monorepo-friendly |
| **lint-staged** | ^15.0.0 | Staged file checks | Runs checks only on changed files, faster commits |
| **GitHub Actions** | (native) | CI/CD | Already hosted on GitHub, import verification workflows |
| **Node.js assert** | (native) | Import verification | Built-in, sufficient for smoke tests |

**v1.2 Key Stack Decisions:**
- **Native npm workspaces over Lerna/Turborepo** — Only 2 packages, native is sufficient
- **zx over ShellJS** — Native ESM support required for project, ShellJS is CommonJS-only
- **husky over lefthook** — Simpler for JS/TS projects, sufficient for current needs
- **Native assert over Jest/Vitest** — Import verification only, no full test suite needed yet
- **prepublishOnly over prepare** — Runs only before publish, not on every install

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **TypeScript** | Type safety | Required for coordination layer consistency |
| **tsx** | Development execution | Fast TypeScript execution without build step |
| **esbuild** | Production bundling | Ultra-fast bundler for coordination modules |

## Installation

```bash
# Core coordination dependencies (v1.0)
npm install mqtt@5.0.0 better-sqlite3@11.9.0 msgpackr@0.6.0

# Agent identification and queuing (v1.0)
npm install uuid@11.0.0 p-queue@8.0.0 eventemitter3@6.0.0

# v1.1 Dashboard additions
npm install -D vite@6.x
npm install alpinejs@3.x chart.js@4.x

# v1.2 Package distribution & DX additions
npm install -D \
  husky@9.0.0 \
  lint-staged@15.0.0 \
  zx@8.0.0

# Setup husky (after installation)
npx husky init

# Dev dependencies
npm install -D typescript@5.9.3 tsx@4.21.0 @types/node@22.19.11
```

## v1.2 Package Distribution Requirements

### msgpackr Import Fix (CRITICAL - STATE-01)

**Current Issue:** Code uses `@ts-ignore` suggesting confusion about correct import pattern

**Correct Import Pattern:**
```typescript
// Method 1: MessagePack class (RECOMMENDED - already in use)
import { MessagePack } from 'msgpackr';
const encoded = MessagePack.encode(value);
const decoded = MessagePack.decode(buffer);

// Method 2: Direct utilities (alternative)
import { pack, unpack } from 'msgpackr/unpack';
const encoded = pack(value);
const decoded = unpack(buffer);
```

**Verification:** The current code in `packages/coordination/src/communication/codec.ts` is CORRECT:
```typescript
import { MessagePack } from 'msgpackr';  // This is the right way
```

The `@ts-ignore` comment should be REMOVED - it was likely added during troubleshooting but is no longer needed.

### npm Workspaces Configuration

**Required in root package.json:**
```json
{
  "name": "@openclaw-swarm/monorepo",
  "version": "1.2.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev": "npm run dev --workspaces",
    "clean": "npm run clean --workspaces",
    "type-check": "npm run type-check --workspaces",
    "setup": "node scripts/setup.mjs"
  }
}
```

**Workspace-specific commands:**
```bash
# Install dependency to specific workspace
npm install -w @openclaw-swarm/coordination <package>
npm install -w @openclaw-swarm/dashboard <package>

# Run script in specific workspace
npm run build -w @openclaw-swarm/coordination
npm run dev -w @openclaw-swarm/dashboard
```

### ESM Export Patterns

**Required package.json structure for EACH workspace package:**
```json
{
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "src",
    "README.md"
  ]
}
```

**Note:** This is ALREADY PRESENT in `packages/coordination/package.json` - no changes needed to exports field.

### TypeScript Module Resolution (Already Configured)

**Current tsconfig.json is CORRECT:**
```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "target": "ES2022"
  }
}
```

No changes needed - this properly handles ESM/.js extension requirements.

### Database Schema Export (STATE-02)

**Current Issue:** `initializeSchema` and related functions not exported from state/index.ts

**Required Fix in packages/coordination/src/state/index.ts:**
```typescript
// Add these exports:
export * from './schema.js';  // Exports initializeSchema, validateSchema, etc.
export * from './database.js';
export * from './context.js';
export * from './task-queue.js';
export * from './archive.js';
```

### Setup Automation with zx

**Create: scripts/setup.mjs**
```javascript
#!/usr/bin/env node
import { $, fs, echo } from 'zx';

$.verbose = true;

async function setup() {
  echo('Checking Node.js version...');
  const nodeVersion = process.version;
  echo(`Node.js version: ${nodeVersion}`);

  if (!nodeVersion.startsWith('v22')) {
    echo('ERROR: Node.js 22+ required');
    process.exit(1);
  }

  echo('Verifying workspaces...');
  await $`npm ls --workspaces --depth=0`;

  echo('Installing dependencies...');
  await $`npm install`;

  echo('Building packages...');
  await $`npm run build --workspaces`;

  echo('Running type checks...');
  await $`npm run type-check --workspaces`;

  echo('');
  echo('✓ Setup complete!');
  echo('');
  echo('Next steps:');
  echo('  - Configure Mosquitto broker (see docs)');
  echo('  - Run: npm run dev');
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
```

**Add to package.json (root):**
```json
{
  "scripts": {
    "setup": "node scripts/setup.mjs"
  },
  "devDependencies": {
    "zx": "^8.0.0"
  }
}
```

### Pre-commit Hooks with husky

**Installation:**
```bash
npm install -D husky@9.0.0 lint-staged@15.0.0
npx husky init
```

**Create: .husky/pre-commit**
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Running pre-commit checks..."

# Type check without emitting files
npm run type-check --workspaces

# Lint staged files
npx lint-staged
```

**Configure lint-staged in root package.json:**
```json
{
  "lint-staged": {
    "*.{ts,js,mjs}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

**Skip in CI:**
```bash
HUSKY=0 npm run ci  # Disables hooks during CI
```

### CI/CD Workflows for Import Verification

**Create: .github/workflows/verify-imports.yml**
```yaml
name: Verify Imports

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [22.x, '23.x']

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build all workspaces
        run: npm run build --workspaces

      - name: Verify package imports
        run: node scripts/verify-imports.mjs

      - name: Type check
        run: npm run type-check --workspaces

  test-mosquitto:
    runs-on: ubuntu-latest
    services:
      mosquitto:
        image: eclipse-mosquitto:2.0
        ports:
          - 1883:1883
        options: >-
          --health-cmd "mosquitto_sub -t '$SYS/#' -C 1 -i test -h localhost"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22.x
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build --workspaces

      - name: Test MQTT connectivity
        run: node scripts/test-mqtt-connection.mjs
        env:
          MQTT_BROKER_URL: mqtt://localhost:1883
```

**Create: scripts/verify-imports.mjs**
```javascript
#!/usr/bin/env node
import { $ } from 'zx';

$.verbose = true;

async function verifyImports() {
  console.log('Verifying workspace imports...');

  try {
    // Test coordination package imports
    await $`node --eval "import('@openclaw-swarm/coordination')"`;
    console.log('✓ @openclaw-swarm/coordination imports verified');

    // Test msgpackr specifically (STATE-01 verification)
    await $`node --eval "import { MessagePack } from 'msgpackr'; console.log('MessagePack:', typeof MessagePack.encode)"`;
    console.log('✓ msgpackr import verified');

    // Test database schema exports (STATE-02 verification)
    await $`node --eval "
      import('@openclaw-swarm/coordination').then(m => {
        if (m.initializeSchema) console.log('✓ initializeSchema exported');
        else throw new Error('initializeSchema NOT exported');
        if (m.validateSchema) console.log('✓ validateSchema exported');
        else throw new Error('validateSchema NOT exported');
      })
    "`;
    console.log('✓ database schema exports verified');

    console.log('');
    console.log('All imports verified successfully!');
  } catch (err) {
    console.error('Import verification failed:', err.message);
    process.exit(1);
  }
}

verifyImports();
```

**Create: scripts/test-mqtt-connection.mjs**
```javascript
#!/usr/bin/env node
import { connect } from 'mqtt';

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

async function testMQTT() {
  console.log(`Testing MQTT connection to ${brokerUrl}...`);

  return new Promise((resolve, reject) => {
    const client = connect(brokerUrl);

    client.on('connect', () => {
      console.log('✓ MQTT connection successful');
      client.end();
      resolve();
    });

    client.on('error', (err) => {
      console.error('MQTT connection failed:', err.message);
      reject(err);
    });

    setTimeout(() => {
      reject(new Error('MQTT connection timeout'));
    }, 5000);
  });
}

testMQTT().catch(err => {
  console.error(err);
  process.exit(1);
});
```

### Column Count Mismatch Fix (STATE-03)

**Issue:** Task queue INSERT has column count mismatch

**Root Cause:** Schema defines columns that INSERT statement doesn't include

**Fix in packages/coordination/src/state/task-queue.ts:**
```typescript
// Ensure INSERT includes all non-nullable columns
const INSERT_STMT = `
  INSERT INTO tasks (
    id, status, priority, assigned_agent,
    created_at, updated_at, completed_at,
    payload, dependencies, timeout_ms,
    retry_count, max_retries, last_progress_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
```

## v1.1 Feature Stack Requirements

### Advanced Routing: Load Balancing

**NO EXTERNAL LIBRARIES NEEDED** — Native Node.js implementation

| Feature | Implementation | Memory | Complexity |
|---------|---------------|--------|------------|
| **Weighted Round-Robin** | Smooth GCD-based algorithm | <5KB | O(n) per selection |
| **Least Connections** | Active connection tracking | <2KB | O(1) per selection |
| **Dynamic Capabilities** | SQLite-backed capability registry | Existing DB | Queries only |

**Why Native Implementation:**
- Zero dependencies (generic-proxy, node-http-proxy designed for HTTP, not MQTT)
- Full control over routing logic for multi-capability matching
- <10KB total code vs 100KB+ for external libraries
- Can optimize for specific swarm patterns (hierarchical fallback, capability affinity)

**Reference Implementation (Smooth Weighted Round-Robin):**
```typescript
class WeightedLoadBalancer {
  // Based on Nginx smooth weighted algorithm
  // https://github.com/nginx/nginx/blob/master/src/http/ngx_http_upstream_round_robin.c
  private currentIndex: number = -1;
  private currentWeight: number = 0;

  select(agent: Agent[]): Agent {
    // O(n) where n = number of agents (typically <10)
    // Returns deterministic distribution: S1->S1->S2->S3 for weights 2:1:1
  }
}
```

### Optimization: Message Batching

**NO EXTERNAL LIBRARIES NEEDED** — Native DynamicBatcher implementation

| Feature | Implementation | Memory | Batch Size |
|---------|---------------|--------|------------|
| **Count-based batching** | Flush when N messages queued | <3KB | 5-20 messages (adaptive) |
| **Time-based batching** | Flush after timeout | Included | 1000ms max delay |
| **Network-aware sizing** | Navigator API integration | Included | 5 (slow) to 20 (fast) |

**Why Native Implementation:**
- Bull/BullMQ require Redis (adds ~50MB+ memory)
- Generic batch libraries designed for queue systems, not MQTT
- Simple pattern: `queue.push()` + `flush on count OR timeout`
- Adaptive sizing based on `navigator.connection?.effectiveType`

**Reference Implementation:**
```typescript
class DynamicBatcher {
  private queue: Message[] = [];
  private MAX_BATCH = 5; // Adaptive: 5-20 based on network
  private timer: NodeJS.Timeout | null = null;

  add(msg: Message): void {
    this.queue.push(msg);
    if (this.queue.length >= this.MAX_BATCH) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), 1000);
  }

  flush(): void {
    // Send batch via MQTT
  }
}
```

### Optimization: Connection Pooling

**MQTT.js BUILT-IN FEATURE** — Configuration only

| Configuration | Value | Memory | Notes |
|---------------|-------|--------|-------|
| **minClients** | 2 | ~20-30MB | Minimum idle connections |
| **maxClients** | 5 | ~50-75MB | 1 per CPU core (Pi 2B has 4 cores) |
| **keepAlive** | 60s | — | Recommended for edge devices |
| **autoUseTopicAlias** | true | — | Reduces topic overhead (MQTT 5.0) |

**Why MQTT.js Built-in Pooling:**
- Already available in v5.0, no new dependencies
- generic-pool designed for DB connections, not MQTT
- Redis-based pooling adds unnecessary infrastructure
- Each client: ~10-15MB (validated in research)

**Reference Configuration:**
```typescript
const mqttPool = {
  minClients: 2,
  maxClients: 5,
  keepAlive: 60,
  autoUseTopicAlias: true,
  autoAssignTopicAlias: true,
  customMessageIdProvider: new EfficientMessageIdProvider()
};
```

### Optimization: Context References

**NATIVE IMPLEMENTATION** — SQLite + LRU cache

| Component | Implementation | Memory | Reduction |
|-----------|---------------|--------|-----------|
| **Content storage** | SQLite table (existing) | Existing DB | N/A |
| **In-memory cache** | LRU (100 entries) | <1MB | 60-80% smaller messages |

**Why Native Implementation:**
- Content-addressable storage: SHA-256 hash of context
- Store once, reference by hash in messages
- Reduces repetitive context (project instructions, agent configs)
- No external dependencies (ioredis, etc.)

### Visualization: Web Dashboard

**CRITICAL: DO NOT USE Next.js 16 + React 19**

The reference dashboard (openclaw-mission-control) uses Next.js 16 + React 19 + shadcn/ui, which research shows is **UNSUITABLE** for Pi 2B:

| Stack | Bundle Size | Dev Server Memory | Production Memory | Pi 2B Suitable? |
|-------|-------------|-------------------|-------------------|-----------------|
| **Next.js 16 + React 19 + shadcn/ui** | 200-300KB | 300MB-10GB | Memory leaks reported (Jan 2026) | NO |
| **Vite + Vanilla + Alpine + Chart.js** | 50-70KB | ~50MB | ~10MB (static files) | YES |
| **HTMX + Alpine + Tailwind** | ~24KB | ~45MB | ~5MB | YES |

**Sources for Next.js Memory Issues:**
- [GitHub Issue #88603](https://github.com/vercel/next.js/issues/88603) — Memory leaks in v16.1.0 (Jan 2026)
- [GitHub Issue #85914](https://github.com/vercel/next.js/issues/85914) — Standalone output leaks (Nov 2025)
- Dev server starts at 300MB, can climb to 9-10GB during navigation

**Recommended Dashboard Stack:**

| Technology | Version | Purpose | Bundle (gzipped) | Memory |
|------------|---------|---------|-----------------|--------|
| **Vite** | 6.x | Build tool, dev server | ~50KB | ~50MB (dev only) |
| **Vanilla JavaScript** | ES2022 | Core framework | 0KB (built-in) | <1MB |
| **Alpine.js** | 3.x | Lightweight reactivity | ~10KB | <1MB |
| **Chart.js** | 4.x | Data visualization | ~37-60KB | ~1.2-3MB |
| **Tailwind CSS** | 4.x | Styling (via CDN) | ~10KB (prod) | <1MB |
| **SSE** | Native | Real-time updates | 0KB (built-in) | <1MB |

**Dashboard Features (All Implementable with Lightweight Stack):**
- Real-time agent status: SSE + Alpine.js reactivity
- Progress bars: HTML `<progress>` + Alpine.js
- Timeline view: Chart.js or custom Canvas rendering
- Capability matrix: HTML grid + Alpine.js sorting/filtering

**Real-time Updates: SSE vs WebSocket:**
- SSE: Built-in to Node.js (`EventSource` API), single HTTP connection, simpler
- WebSocket: Requires `ws` library (~14KB), more complex state management
- For dashboard (server -> client only), SSE is sufficient and lighter

**Dashboard Architecture:**
```
Browser (Static HTML + Alpine.js + Chart.js: ~70KB)
  ↓ SSE (real-time updates)
Vite Dev Server (development only: ~50MB)
  ↓
Express REST API (existing 12 endpoints + SSE: GET /api/events)
  ↓
SQLite state store + MQTT broker (existing)
```

**DO NOT ADD for Dashboard:**
- Next.js, React, Vue, Svelte — Too heavy for Pi 2B (1GB RAM)
- shadcn/ui components — Requires React, adds bundle weight
- Vercel AI SDK — Not needed (OpenClaw gateway handles AI)
- WebSocket libraries (ws, socket.io) — SSE is sufficient

### Checkpointing: No Additions Needed

Existing hybrid checkpointing (60s local JSON + 5min SQLite sync) covers all requirements.

**Potential Enhancements (No New Libraries):**
- Incremental checkpointing (algorithm extension, existing code)
- Checkpoint compression (MessagePack for SQLite, existing dependency)
- Checkpoint versioning (schema extension, existing SQLite)

## Architecture Rationale

### Why MQTT over Alternatives

| Protocol | Memory | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| **MQTT (Mosquitto)** | ~3-10MB | QoS levels, retained messages, IoT standard | No built-in streaming | ✅ RECOMMENDED |
| **NATS Core** | ~5-10MB | Ultra-fast, minimal binary | Stateless (no offline buffering) | ⚠️ Use only if accept message loss |
| **NATS JetStream** | ~200MB+ | Durable streaming, clustering | ❌ NOT suitable for 1GB RAM Pi 2B | ❌ AVOID |
| **Redis Pub/Sub** | ~50-100MB+ | In-memory speed | Memory-hungry, separate process | ⚠️ Only if already need Redis |
| **ZeroMQ** | ~5MB | Complex patterns, low-latency | No broker, requires peer discovery | ⚠️ Use for direct IPC only |

**MQTT Wins Because:**
- Retained messages enable instant agent discovery without polling
- QoS 1 ensures at-least-once delivery for critical coordination messages
- Minimal broker footprint (3-10MB) leaves room for Node.js runtime
- Industry standard means extensive tooling and debugging support
- v5.0 built-in connection pooling (no external libraries needed)

### Why Better-SQLite3 over File-Based or Redis

| Solution | Memory | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| **Better-SQLite3** | ~5-15MB | ACID transactions, indexing, faster than raw fs | Requires database knowledge | ✅ RECOMMENDED |
| **JSON Files** | ~2-5MB | Simple, human-readable | No transactions, race conditions | ⚠️ OK for config only |
| **Redis** | ~50-100MB+ | In-memory speed, pub/sub | Heavy memory footprint, separate process | ❌ AVOID for 1GB Pi |

**Better-SQLite3 Wins Because:**
- Synchronous API is faster than async alternatives in Node.js
- WAL mode enables concurrent reads/writes without blocking
- Single-file database simplifies backup and migration
- Query capabilities for complex agent/task lookups
- Can use `:memory:` mode for hot state with file persistence
- v11.9.0 supports all features needed for context references

### Why MessagePack over JSON or CBOR

| Format | Speed vs JSON | Size vs JSON | Standardization | Verdict |
|--------|---------------|--------------|-----------------|---------|
| **MessagePack (msgpackr)** | 3.5x faster | 15-50% smaller | Widely adopted | ✅ RECOMMENDED |
| **JSON** | Baseline | Baseline | Universal | ⚠️ Debugging only |
| **CBOR** | 3.5x faster | 15-50% smaller | IETF standardized | ⚠️ If standardization matters |
| **Protocol Buffers** | 6x faster | Smaller | Google standard | ❌ Requires schema |

**MessagePack Wins Because:**
- msgpackr achieves 1.5-2 GB/s throughput in Node.js
- Schema-less format fits dynamic agent payloads
- Record extension optimizes repeated structures (context references)
- Mature Node.js ecosystem with msgpackr
- Already used in v1.0, proven effective

### Why NOT BullMQ/Bee-Queue (Task Queue Libraries)

| Library | Memory | Pros | Cons | Verdict |
|---------|--------|------|------|---------|
| **BullMQ** | ~30-50MB | Features, TypeScript | Requires Redis, adds complexity | ❌ AVOID |
| **Bee-Queue** | ~5-10MB | Minimal, fast | Still requires Redis | ⚠️ Only if have Redis |
| **MQTT + p-queue** | ~2-5MB | Lightweight, flexible | Manual retry logic | ✅ RECOMMENDED |

**MQTT + p-queue Wins Because:**
- Avoids Redis dependency (saves ~50MB+ RAM)
- p-queue provides in-memory queuing with concurrency control
- MQTT provides distributed transport without extra infrastructure
- Simpler architecture = easier debugging on Pi 2B
- For v1.1 batching, native implementation (no external queue library)

### Why Vite + Vanilla + Alpine over Next.js for Dashboard

| Stack | Bundle Size | Dev Server | Build Time | Learning Curve | Pi 2B Suitable? |
|-------|-------------|------------|------------|----------------|-----------------|
| **Next.js 16 + React 19** | 200-300KB | 300MB-10GB | 40s | High | NO |
| **Vite + Vanilla + Alpine** | 50-70KB | ~50MB | 2-5s | Low | YES |
| **HTMX + Alpine** | ~24KB | ~45MB | 5s | Low | YES |

**Vite + Vanilla + Alpine Wins Because:**
- 83% smaller JavaScript bundle (HTMX vs React)
- 40% less memory usage (45MB vs 75MB in real-world comparison)
- 10x faster build time (2-5s vs 40s)
- Zero framework overhead (Vanilla JS = 0KB)
- Alpine.js provides just enough reactivity (~10KB)
- Chart.js sufficient for swarm visualizations (~37-60KB)
- Real-world case study: 67% less code, 96% fewer dependencies vs React

**Sources:**
- [HTMX vs React Bundle Size (Sohu, Sept 2025)](https://www.sohu.com/a/937067078_122328931)
- [Real-world case study (2025)](https://www.sohu.com/a/937067078_122328931) — 21,500 lines (React) vs 7,200 lines (HTMX)
- [Next.js memory leaks (GitHub #88603, Jan 2026)](https://github.com/vercel/next.js/issues/88603)

### Why Native npm Workspaces for Monorepo

| Tool | Setup Complexity | Build Speed | Memory | Learning Curve | Verdict |
|------|------------------|-------------|--------|----------------|---------|
| **npm workspaces** | Minimal | Fast | Native | Low | ✅ RECOMMENDED |
| **Lerna** | Moderate | Fast | Low | Medium | ⚠️ Only if complex publish workflows |
| **Turborepo** | Complex | Very Fast | Moderate | High | ⚠️ Only for large-scale projects |
| **Nx** | Complex | Fast | High | High | ❌ Overkill for 2 packages |

**npm Workspaces Wins Because:**
- Native to npm (v7+), zero additional dependencies
- Simple configuration: `"workspaces": ["packages/*"]`
- Workspace protocol for internal dependencies: `"@openclaw-swarm/coordination": "*"`
- Sufficient for 2-package monorepo
- `npm run build --workspaces` for parallel builds

### Why zx over ShellJS for Setup Scripts

| Tool | ESM Support | Async Syntax | Dependencies | Learning Curve | Verdict |
|------|-------------|--------------|--------------|----------------|---------|
| **zx** | ✅ Native | ✅ async/await | Minimal | Low (if know Bash) | ✅ RECOMMENDED |
| **ShellJS** | ❌ CommonJS | ❌ Sync mostly | Zero | Low | ⚠️ Only if CommonJS project |

**zx Wins Because:**
- Project is ESM-first (`"type": "module"` in all packages)
- Native async/await support for shell commands
- Built-in utilities: `cd`, `fs`, `fetch`, `sleep`, `question`
- Bash-like template literals: `await $`npm install``
- TypeScript support via `.mjs` files

### Why husky over lefthook for Pre-commit Hooks

| Tool | Language | Config | Monorepo Support | Verdict |
|------|----------|--------|------------------|---------|
| **husky** | Node.js | Shell scripts | ✅ Native | ✅ RECOMMENDED |
| **lefthook** | Go | YAML | ✅ Excellent | ⚠️ Faster, but more complex |

**husky Wins Because:**
- Already using Node.js ecosystem
- Simple shell script hooks
- Monorepo-friendly via single `.husky` directory at root
- Integrates with `lint-staged` for staged file checks
- Sufficient for current needs (lefthook's speed advantage not needed yet)

### Why GitHub Actions over Alternatives for CI/CD

| Tool | Setup | Free Tier | Integration | Verdict |
|------|-------|-----------|-------------|---------|
| **GitHub Actions** | Native | Generous | Native to GitHub | ✅ RECOMMENDED |
| **GitLab CI** | Native | Generous | Requires GitLab | ⚠️ Only if using GitLab |
| **CircleCI** | Config | Limited | External | ❌ Adds complexity |

**GitHub Actions Wins Because:**
- Already hosted on GitHub (implied by repo structure)
- Native integration, no external accounts needed
- Generous free tier (2000 minutes/month)
- Built-in Docker service support (for Mosquitto testing)
- Matrix builds for multi-version Node.js testing

## Memory Budget for Pi 2B (1GB RAM)

### v1.0 Baseline (Current)

```
Total: 1024MB
├── OS + System: ~150MB
├── Node.js Runtime: ~80MB
├── OpenClaw Gateway: ~100MB (estimated)
├── MQTT Broker (Mosquitto): ~10MB
├── Coordination Layer (Node.js): ~75MB
│   ├── MQTT client (1 instance): ~5MB
│   ├── SQLite state: ~15MB
│   ├── Task queue (p-queue): ~5MB
│   └── Application logic: ~50MB
└── Headroom: ~634MB (plenty for agent execution)
```

### v1.1 Additions

```
Coordination Layer (v1.1): ~100MB
├── v1.0 baseline: ~75MB
├── MQTT connection pool (3-5 clients): +20-40MB
│   └── 4 clients × 10MB = ~40MB (worst case)
├── Load balancer (native): <1MB
├── Message batcher (native): <1MB
├── Context reference store: <1MB
└── Dashboard (development): +50MB (dev server only)
    └── Production: Static files via Express (~10MB)
```

**Per-Machine Breakdown:**

| Machine | Hardware | v1.0 Usage | v1.1 Dev | v1.1 Production | Within Budget? |
|---------|----------|------------|-----------|-----------------|----------------|
| **griak-brain** | Beelink T4 (4GB) | ~275MB | ~375MB | ~325MB | YES (plenty) |
| **griak-server** | Pi 5 (8GB) | ~275MB | ~375MB | ~325MB | YES (plenty) |
| **griak-worker-1** | Pi 3B (1GB) | ~275MB | ~375MB | ~325MB | YES (OK) |
| **griak-worker-2** | Pi 2B (1GB) | ~275MB | ~375MB | ~325MB | YES (OK, ~65% RAM) |

**Production Deployment (No Dev Server):**
- All machines: ~325MB total (~32% of 1GB RAM)
- Memory-aware throttling (85% threshold) still has ~540MB headroom

**Key Insight:** Even with v1.1 additions, coordination layer stays well under 50% of available RAM on Pi 2B.

### v1.2 Additions (Zero Runtime Impact)

```
Development Tools (runtime only):
├── npm workspaces: ~0MB (native)
├── husky: ~0MB (git hooks only)
├── zx: ~5MB (setup scripts only)
├── TypeScript: ~0MB (build time only)
└── GitHub Actions: 0MB (CI only)

Production Impact: NONE
- All v1.2 additions are build-time or development-time only
- No runtime dependencies added
- No memory increase in production deployments
```

## Alternatives Considered

### For Routing & Load Balancing

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Native implementation** | generic-proxy, node-http-proxy | External libs only if HTTP proxying needed — not for MQTT |
| **Smooth weighted GCD** | Simple weighted random | Use random only for non-critical routing — GCD provides predictable distribution |

### For Message Batching

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Native DynamicBatcher** | Bull, BullMQ | Use queue libs only for persistent, durable queues — MQTT provides reliability |
| **Adaptive sizing** | Fixed-size batching | Use fixed-size only for deterministic latency — adaptive maximizes throughput |

### For Connection Pooling

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **MQTT.js built-in** | generic-pool | Use generic-pool only for non-MQTT connections — MQTT.js has native pooling |
| **Mosquitto broker** | Redis for pooling | Redis only if already using it for other purposes — unnecessary overhead |

### For Visualization Dashboard

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Vite + Vanilla + Alpine** | Next.js 16 + React 19 | **NEVER** for Pi 2B — memory constraints (300MB-10GB vs 50MB target) |
| **Chart.js** | ECharts | Use ECharts only for 100K+ data points — overkill for agent swarm |
| **SSE** | WebSocket (ws, socket.io) | Use WebSocket only for bidirectional comms — SSE sufficient for dashboard (read-only) |
| **HTMX + Alpine** | Pure Alpine | Use HTMX for highly server-driven UIs — adds learning curve |

### For Context References

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Native SQLite + LRU** | ioredis for caching | Redis only if already using it — SQLite sufficient for reference store |

### For Monorepo Management

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **npm workspaces** | Turborepo | Use Turborepo only for large codebases (10+ packages) with complex build graphs |
| **npm workspaces** | Lerna | Use Lerna only if need complex versioning/publishing workflows |
| **npm workspaces** | Nx | Nx is overkill for 2-package monorepo — high config overhead |

### For Setup Scripts

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **zx** | ShellJS | Use ShellJS only if using CommonJS — project is ESM-first |
| **zx** | execa | Use execa only for simpler command execution — zx provides more utilities |

### For Pre-commit Hooks

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **husky** | lefthook | Use lefthook only if need faster execution — current project doesn't need the speed |
| **husky** | pre-commit (Python) | Use pre-commit only if already using Python tooling — adds Python dependency |

### For Broker

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Mosquitto** | NanoMQ | If need MQTT-over-QUIC or multi-threaded broker |
| **Mosquitto** | Aedes (Node.js) | Only if need embedded broker in Node.js process (higher memory) |

### For Database

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Better-SQLite3** | LowDB | Only for extremely simple key-value config (not agent state) |
| **Better-SQLite3** | Redis | Only if already use Redis and have memory to spare |

### For Serialization

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **MessagePack** | JSON | For debugging, public APIs, or human readability |
| **MessagePack** | CBOR | If IETF standardization is required |
| **MessagePack** | Protocol Buffers | If schema definition is acceptable (not for dynamic payloads) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **RabbitMQ** | ~100MB+ RAM, Erlang runtime, overkill for 4 agents | MQTT (Mosquitto) |
| **Kafka** | ~500MB+ RAM, designed for massive scale | MQTT or NATS Core |
| **NATS JetStream** | 200MB+ RAM, not suitable for edge devices | NATS Core (if accept message loss) |
| **PostgreSQL/MySQL** | ~50-100MB+ RAM, separate process | Better-SQLite3 |
| **LevelDB/RocksDB** | Complex compilation, heavier than SQLite | Better-SQLite3 |
| **gRPC** | Complex proto definitions, heavier than MQTT | MQTT for coordination |
| **BullMQ** | Requires Redis, adds ~50MB+ memory | MQTT + p-queue + native batching |
| **FlatBuffers/Protobuf** | Requires schema definition, more complex | MessagePack (schema-less) |
| **Next.js 16 + React 19** | 300MB-10GB memory usage, reported leaks in v16.1.0 | Vite + Vanilla + Alpine (~50MB) |
| **shadcn/ui** | Requires React, adds bundle weight | Custom Alpine components + Tailwind |
| **WebSocket libraries** | Unnecessary weight (~14KB), SSE sufficient | Native SSE (EventSource API) |
| **External load balancers** | Designed for HTTP proxying, not MQTT | Native weighted round-robin |
| **Redis for pooling** | Adds external dependency, MQTT.js has built-in | MQTT.js connection pool |
| **Heavy chart libraries** (ECharts, D3) | 250KB+ bundle, designed for complex viz | Chart.js (~37-60KB) |
| **CommonJS in package code** | Project is ESM-first, mixing causes dual-module hell | ESM `import/export` exclusively |
| **`.js` extensions in imports** | Node.js ESM requires explicit extensions, causes runtime errors | `.js` extension in all `import` statements |
| **`ts-node` for scripts** | No ESM support in older versions, conflicts with Node.js 22 | `zx` scripts with `.mjs` extension |
| **`npm link` for local development** | Doesn't work well with workspaces, can cause version confusion | `npm install -w <workspace>` or workspace protocol |
| **`.npmrc` with `save-exact`** | Locks dependencies too tightly, prevents security updates | `package-lock.json` for exact versions, semver ranges in package.json |
| **`prepare` script for builds** | Runs on every install, slow for large packages | `prepublishOnly` - runs only before publish |
| **Conditional exports for CJS** | Project is ESM-only, CJS adds maintenance burden with no benefit | ESM-only exports, remove `require` conditions |
| **Turborepo for 2 packages** | High config overhead, overkill for small monorepos | Native npm workspaces |
| **ShellJS in ESM project** | CommonJS-only, requires interop that can break | zx (native ESM support) |
| **lefthook for simple hooks** | Overkill for basic pre-commit checks | husky (simpler for JS/TS projects) |
| **Jest/Vitest for smoke tests** | Heavy dependency for simple import verification | Native Node.js `assert` module |

## Stack Patterns by Variant

**If running on griak-brain (4GB RAM):**
- Can run Vite dev server (~50MB) alongside coordination layer
- May use Aedes (Node.js MQTT broker) inline instead of Mosquitto
- Can afford Redis for more complex caching (but not required)
- Dashboard runs locally, accessed via SSH tunnel

**If running on griak-server (Pi 5, 8GB RAM):**
- Can run full Mosquitto with persistence enabled
- Room for monitoring and metrics collection
- Dashboard runs locally, accessed via SSH tunnel
- Vite dev server for development (~50MB)

**If running on griak-worker-1/2 (Pi 2B/3B, 1GB RAM):**
- Connect to brain's Mosquitto broker (OR run local Mosquitto)
- Better-SQLite3 with WAL mode
- Minimal in-memory state, prefer MQTT retained messages
- Use MessagePack for all payloads
- **NO dashboard on workers** — access brain's dashboard remotely
- Production deployment: static files only (no dev server)

**If adding new workspace package:**
- Use `"type": "module"` in package.json
- Configure `exports` field with `types` + `import` conditions
- Use `"main": "./dist/index.js"` for Node.js < 12.7 fallback
- Use `"types": "./dist/index.d.ts"` for TypeScript

**If creating setup scripts:**
- Use zx with `.msh` extension for ESM compatibility
- Place in `scripts/` directory at root
- Make executable: `chmod +x scripts/script.mjs`
- Add to root package.json: `"setup": "node scripts/setup.mjs"`

**If adding pre-commit hooks:**
- Install husky at root level (not in individual packages)
- Use `.husky/pre-commit` script that runs `npx lint-staged`
- Configure `lint-staged` in root package.json
- Skip in CI with `HUSKY=0` environment variable

## Communication Protocol Specifications

### Topic Naming Convention

```
agent/{agent_id}/state              # Retained: agent status, capabilities
agent/{agent_id}/tasks/inbound      # Subscribe: tasks assigned to agent
agent/{agent_id}/tasks/outbound     # Publish: task results, status updates
agent/{agent_id}/heartbeat          # Retained: last seen timestamp
swarm/discovery                     # Retained: all registered agents
swarm/task_queue                    # Publish: new tasks (coordinated by Minerva)
swarm/task/{task_id}                # Retained: task state, progress

# v1.1 additions
swarm/capabilities                  # Retained: dynamic capability registry
swarm/metrics                       # Retained: load balancer metrics
swarm/context/{hash}                # Retained: context reference storage
```

### Message Format (MessagePack)

```typescript
interface AgentMessage {
  type: 'task' | 'result' | 'heartbeat' | 'state' | 'batch' | 'context_ref';
  from: string;  // agent_id
  to?: string;   // target agent_id (optional for broadcast)
  timestamp: number;
  payload: unknown;
}

interface TaskPayload {
  task_id: string;
  capability: string;  // 'code' | 'test' | 'research' | 'debug'
  priority: number;
  context: Record<string, unknown> | ContextReference;  // v1.1: supports context refs
}

// v1.1: Context reference (deduplication)
interface ContextReference {
  hash: string;  // SHA-256 of context content
  size: number;  // Original size (for metrics)
}

// v1.1: Batch message (optimization)
interface BatchMessage {
  messages: AgentMessage[];  // 5-20 messages per batch
  batch_id: string;
}
```

### QoS Strategy

- **QoS 0** (at most once): Heartbeats, non-critical state updates, metrics
- **QoS 1** (at least once): Task assignments, results, critical state changes, capability updates
- **Retained messages**: Agent state, discovery, task status, capabilities, context references

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js ≥22.0.0 | MQTT.js 5.x, better-sqlite3 11.x, Vite 6.x | Native ESM modules |
| MQTT.js 5.x | Mosquitto 2.x, Aedes 0.x | MQTT 3.1.1/5.0 support, connection pooling built-in |
| better-sqlite3 11.x | Node.js ≥18.0.0 | Prebuilt binaries for ARMv6/ARMv7/ARM64 |
| msgpackr 0.6.x | Node.js ≥14.0.0 | Optional native addon for performance |
| Vite 6.x | Node.js ≥18.0.0 | ESBuild-based, dev server ~50MB |
| Alpine.js 3.x | Any framework | Framework-agnostic, works with vanilla JS |
| Chart.js 4.x | All modern browsers | Tree-shakeable, registerable chart types |
| zx 8.x | Node.js ≥18.0.0 | Requires `--experimental-fetch` on Node.js < 18 (not applicable here) |
| husky 9.x | npm@9+ | Uses npm scripts, not Git hooks directly |
| lint-staged 15.x | Node.js ≥18.0.0 | Requires git installation |
| TypeScript 5.9.3 | module: "Node16" | Required for proper ESM/.js extension handling |

## Critical Integration Notes

### msgpackr Import Verification (STATE-01)
**Status:** ✅ CORRECT - No changes needed

The current import pattern in `packages/coordination/src/communication/codec.ts` is correct:
```typescript
import { MessagePack } from 'msgpackr';
```

**Action:** Remove the `@ts-ignore` comment on line 12 - it was likely added during troubleshooting but the import is correct.

**Verification:**
```bash
node --eval "import { MessagePack } from 'msgpackr'; console.log('✓ MessagePack:', typeof MessagePack.encode)"
```

### npm Workspaces Configuration (NEW)
**Status:** ❌ MISSING - Must add

Root package.json currently lacks explicit `workspaces` field.

**Required Addition to root package.json:**
```json
{
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev": "npm run dev --workspaces",
    "clean": "npm run clean --workspaces",
    "type-check": "npm run type-check --workspaces"
  }
}
```

### Database Schema Export Fix (STATE-02)
**Status:** ❌ MISSING - Must add

`packages/coordination/src/state/index.ts` doesn't export schema functions.

**Required Addition:**
```typescript
// Add to packages/coordination/src/state/index.ts
export * from './schema.js';
export * from './database.js';
export * from './context.js';
export * from './task-queue.js';
export * from './archive.js';
```

### Column Count Mismatch Fix (STATE-03)
**Status:** ❌ NEEDS INVESTIGATION - Schema has columns INSERT doesn't include

**Investigation Required:**
1. Check `packages/coordination/src/state/task-queue.ts` INSERT statement
2. Compare with `packages/coordination/src/state/schema.ts` table definition
3. Add missing columns to INSERT or provide DEFAULT values

### ESM Export Patterns
**Status:** ✅ CORRECT - No changes needed

The current package.json exports are correct for ESM-only package:
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

### TypeScript Module Resolution
**Status:** ✅ CORRECT - No changes needed

tsconfig.json has proper Node16 module resolution configured.

## Sources

### MQTT and Message Brokers
- [MQTT.js Performance Optimization (CSDN, Oct 2025)](https://m.blog.csdn.net/gitblog_00237/article/details/153813483) — Connection pooling, topic aliases (HIGH confidence)
- [Lightweight MQTT Client Comparison (CSDN, Dec 2025)](https://m.blog.csdn.net/PixelShoal/article/details/155914425) — Memory benchmarks <50MB (MEDIUM confidence)
- [Mosquitto Documentation](https://mosquitto.org/) — Official docs (HIGH confidence)
- [MQTT.js npm](https://www.npmjs.com/package/mqtt) — Official npm (HIGH confidence)

### State Management
- [SQLite About Page](https://www.sqlite.org/about.html) — Official docs (HIGH confidence)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3) — Official GitHub (HIGH confidence)
- [node-sqlite3 Performance Guide (CSDN, 2025)](https://m.blog.csdn.net/gitblog_00700/article/details/150922802) — Performance tips (MEDIUM confidence)

### Serialization
- [msgpackr npm](https://www.npmjs.com/package/msgpackr) — Official npm (HIGH confidence)
- [msgpackr Performance Deep Dive (CSDN, 2025)](https://blog.csdn.net/gitblog_00056/article/details/139137556) — Benchmarks (MEDIUM confidence)
- [MessagePack vs JSON vs CBOR (CSDN, 2025)](https://m.blog.csdn.net/sunyuhua_keyboard/article/details/151194181) — Comparison (MEDIUM confidence)

### Task Queues
- [BullMQ npm](https://www.npmjs.com/package/bullmq) — Official npm (HIGH confidence)
- [Bee-Queue vs Bull vs Kue Comparison (CSDN, 2025)](https://m.blog.csdn.net/gitblog_00712/article/details/155127136) — Comparison (MEDIUM confidence)
- [Message Batching Pattern (GeeksforGeeks, July 2025)](https://www.geeksforgeeks.org/node-js/top-nodejs-design-patterns/) — DynamicBatcher pattern (MEDIUM confidence)

### Dashboard & Visualization
- [Next.js Memory Leak #88603 (GitHub, Jan 2026)](https://github.com/vercel/next.js/issues/88603) — v16.1.0 production leaks (HIGH confidence)
- [Next.js Memory Leak #85914 (GitHub, Nov 2025)](https://github.com/vercel/next.js/issues/85914) — Standalone output leaks (HIGH confidence)
- [HTMX vs React Bundle Size (Sohu, Sept 2025)](https://www.sohu.com/a/937067078_122328931) — 83% JS reduction (MEDIUM confidence)
- [Chart.js Bundle Size (2026)](https://websearch-results/) — 37-60KB gzipped, 1.2-3MB memory (MEDIUM confidence)
- [Glance Dashboard (GitHub, 10K+ stars)](https://github.com/glanceapp/glance) — 20MB binary, vanilla JS, Pi-optimized (HIGH confidence)
- [Shadcn UI Bundle Size (CSDN, 2025)](https://blog.csdn.net/chenchuang0128/article/details/151747310) — 45KB vs 2.8MB Ant Design (MEDIUM confidence)
- [Tailwind CSS 4 Performance (CSDN, 2025)](https://blog.csdn.net/gitblog_00339/article/details/151435908) — v4 improvements (MEDIUM confidence)

### Load Balancing
- [Weighted Round-Robin Implementation (CSDN, Oct 2025)](https://m.blog.csdn.net/gitblog_01196/article/details/153153490) — Smooth weighted GCD algorithm (MEDIUM confidence)
- [Node.js Load Balancing (Baidu, Sept 2025)](https://developer.baidu.com/article/detail.html?id=3709366) — Algorithm comparison (MEDIUM confidence)
- [Load Balancing Algorithms (Baidu Cloud, Sept 2025)](https://cloud.baidu.com/article/3709681) — Round-robin vs weighted vs least connections (MEDIUM confidence)

### Real-time Updates
- [SSE vs WebSocket (Sohu, Sept 2025)](https://www.sohu.com/a/937067078_122328931) — Lightweight alternative for dashboards (MEDIUM confidence)

### Package Distribution & Monorepo
- [npm workspaces Documentation](https://docs.npmjs.com/cli/v10/using-npm/workspaces) — Official npm docs (HIGH confidence)
- [package.json exports (Node.js)](https://nodejs.org/api/packages.html) — Official Node.js docs (HIGH confidence)
- [ESM Module Best Practices (nodejs.org)](https://nodejs.org/api/esm.html) — Official ESM documentation (HIGH confidence)
- [zx Documentation](https://github.com/google/zx) — Official GitHub (HIGH confidence)
- [husky Documentation](https://typicode.github.io/husky) — Official documentation (HIGH confidence)
- [lint-staged npm](https://www.npmjs.com/package/lint-staged) — Official npm (HIGH confidence)

### Development Tools
- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html) — Official docs (HIGH confidence)
- [GitHub Actions Documentation](https://docs.github.com/en/actions) — Official GitHub docs (HIGH confidence)

### Reference Implementation
- [openclaw-mission-control (GitHub)](https://github.com/robsannaa/openclaw-mission-control) — Feature reference (NOT stack reference due to memory constraints) (HIGH confidence)

### OpenClaw
- [OpenClaw Getting Started (CSDN, 2025)](https://www.cnblogs.com/deep-sky/p/19618325) — Tutorial (MEDIUM confidence)
- [OpenClaw Architecture (Tencent, 2025)](https://cloud.tencent.com/developer/article/2629491) — Deep dive (MEDIUM confidence)

---
*Stack research for: OpenClaw Swarm - Lightweight Agent Coordination*
*Researched: 2025-02-21 (v1.0), Updated 2026-02-22 (v1.1 enhancements), 2026-02-23 (v1.2 installation)*
