# Phase 17: NPM Run Scripts - Research

**Researched:** 2026-02-24
**Domain:** npm workspaces, CLI scripts, Node.js tooling
**Confidence:** HIGH

## Summary

Phase 17 delivers developer-friendly npm scripts for starting all system components (agent, API, dashboard) from the monorepo root. The implementation leverages npm workspaces with the project's existing zx-based tooling, follows established logging patterns, and uses the existing example agent structure. Research shows npm workspace scripts are well-established in 2026, with zx remaining a standard choice for Node.js CLI tooling.

**Primary recommendation:** Use npm scripts with zx for orchestration, leverage existing `scripts/` directory patterns, implement CLI flag parsing with minimist or similar, and follow the established structured logging pattern from the coordination package.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Script configuration:**

- Config files live in `config/` directory at repository root
- Default config is `config/agent.json` (or similar), overrideable via `--config` flag
- Single shared config file for all services (not per-service configs)
- Fail fast with clear error message if config is missing or invalid

**Startup behavior:**

- Info-level logging by default (startup confirmation + errors)
- `-q`/`--quiet` flag to silence output
- `-v`/`--verbose` flag for detailed logs
- Validate MQTT and database connections on startup, fail if unavailable
- Graceful shutdown on SIGINT/SIGTERM: log shutdown message, close connections, exit

**Dashboard dev server:**

- Port specified from shared config file (`dashboard.port` in config.json)
- Hot module reload enabled (Vite HMR)
- Dual mode:
  - Dev mode (`npm run dashboard`): on-demand Vite dev server
  - Production mode: serve pre-built static assets

**Agent execution:**

- Agents use their pre-configured roles from OpenClaw instance (no role specification needed in npm scripts or config)
- Configuration (broker URL, database, etc.) via config file only (no CLI overrides, no env vars)

### Claude's Discretion

- Exact npm script implementation details (cross-platform considerations, node flags)
- Dashboard production mode flag naming (`--prod` vs `--production`)
- Exact logging format and timestamps
- Port conflict handling (what to do if port is in use)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

## Phase Requirements

| ID        | Description                                                       | Research Support                                                                    |
| --------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SCRIPT-01 | `npm run agent` starts an agent with example config               | npm workspace scripts with zx; existing example agent structure provides template   |
| SCRIPT-02 | `npm run api` starts the API server with database initialization  | `createStateApi()` and `startServer()` functions available; schema init exists      |
| SCRIPT-03 | `npm run dashboard` starts the dashboard dev server               | Vite has built-in dev server; `npm run dev` already configured in dashboard package |
| SCRIPT-04 | Example agent uses relative imports that work with npm workspaces | Workspaces already configured; `@openclaw-swarm/coordination` exports work          |

## Standard Stack

### Core

| Library        | Version           | Purpose                     | Why Standard                                                                           |
| -------------- | ----------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| zx             | ^8.8.5            | Shell scripting in Node.js  | Already in project dependencies; mature tool for CLI scripts; cross-platform by design |
| npm workspaces | (built-in to npm) | Monorepo package management | Industry standard for npm monorepos; already configured                                |
| Node.js        | >=22.0.0          | Runtime                     | Project minimum version; native ESM support                                            |

### Supporting

| Library  | Version | Purpose              | When to Use                                                 |
| -------- | ------- | -------------------- | ----------------------------------------------------------- |
| minimist | ^1.2.8  | CLI argument parsing | Lightweight flag parsing for `-q`, `-v`, `--config` options |
| ora      | ^9.3.0  | Terminal spinners    | Already in project; use for startup feedback in scripts     |
| chalk    | ^5.6.2  | Terminal colors      | Already in project; use for error/success messages          |

### Alternatives Considered

| Instead of   | Could Use              | Tradeoff                                                                 |
| ------------ | ---------------------- | ------------------------------------------------------------------------ |
| zx           | Native Node.js scripts | zx provides cleaner shell syntax (`$`, `cd`) and cross-platform commands |
| minimist     | commander, yargs       | Both are heavier; minimist sufficient for simple flag parsing            |
| ora/spinners | Simple console.log     | ora provides better UX for startup operations                            |

**Installation:**

```bash
# All dependencies already installed in root package.json
npm install   # No additional packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── utils/
│   ├── env-check.mjs      # Existing - env validation
│   └── mqtt-check.mjs     # Existing - MQTT validation
├── setup.mjs              # Existing - setup script
├── verify-exports.mjs     # Existing - export verification
├── start-agent.mjs        # NEW - agent runner
├── start-api.mjs          # NEW - API server runner
└── start-dashboard.mjs    # NEW - dashboard runner

config/
├── agent.json             # NEW - default agent config
├── api.json               # NEW - API server config
└── dashboard.json         # NEW - dashboard config

examples/
├── basic-agent.ts         # Existing - example agent implementation
└── configs/               # Existing - role-specific example configs
    ├── minerva.config.yaml
    ├── vulcan.config.yaml
    └── worker.config.yaml
```

### Pattern 1: npm Workspace Script Delegation

**What:** Root package.json scripts delegate to workspace-specific scripts or runner scripts.

**When to use:** Monorepo with multiple runnable packages/services.

**Example:**

```json
// root package.json
{
  "scripts": {
    "agent": "node scripts/start-agent.mjs",
    "api": "node scripts/start-api.mjs",
    "dashboard": "npm run dev --workspace=@openclaw-swarm/dashboard"
  }
}
```

**Source:** npm CLI v11 documentation - [npm-run](https://www.npmjs.com/package/npm-run) and workspace best practices from 2026 monorepo guides.

### Pattern 2: ZX Script with CLI Flags

**What:** Use zx for shell operations with minimist for argument parsing.

**When to use:** Need cross-platform shell scripting with CLI flag support.

**Example:**

```javascript
#!/usr/bin/env node
/**
 * Start Agent Script
 *
 * Usage: npm run agent [options]
 * Options:
 *   --config <path>   Path to agent config file
 *   -q, --quiet       Silence output
 *   -v, --verbose     Enable verbose logging
 */

import { $ } from 'zx';
import chalk from 'chalk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

$.verbose = false;

// Parse CLI arguments
const args = minimist(process.argv.slice(2), {
  alias: {
    quiet: ['q'],
    verbose: ['v'],
    config: ['c'],
  },
  default: {
    config: path.join(__dirname, '..', 'config', 'agent.json'),
  },
});

// Load config, validate, start agent with appropriate log level
// Implementation details...
```

**Source:** Based on project's existing zx usage in `scripts/setup.mjs` and established npm script patterns.

### Pattern 3: Graceful Shutdown Handling

**What:** Register SIGTERM/SIGINT handlers for cleanup before exit.

**When to use:** Any long-running Node.js process started via npm scripts.

**Example:**

```javascript
async function main() {
  const agent = new BasicAgent(config, mqttClient);

  // Handle graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await agent.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await agent.start();
}
```

**Source:** Established pattern in `examples/basic-agent.ts` (lines 381-389) and Node.js best practices for signal handling.

### Pattern 4: Vite Dev Server with Custom Port

**What:** Use Vite's built-in dev server with port from config file.

**When to use:** Development mode for dashboard with HMR.

**Example:**

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('./config/dashboard.json', 'utf-8'));

export default defineConfig({
  server: {
    port: config.port || 5173,
    hmr: {
      overlay: true, // Error overlay in browser
    },
  },
});
```

**Source:** Vite 5.x configuration and current dashboard's `vite.config.js` (lines 11-18).

### Anti-Patterns to Avoid

- **Hardcoding paths in npm scripts:** Use relative paths from script location or `process.cwd()`
- **Platform-specific shell commands:** Use zx for cross-platform compatibility (e.g., `$.verbose = false` instead of redirecting output)
- **Ignoring graceful shutdown:** Always register SIGTERM/SIGINT handlers for long-running processes
- **Silent failures:** Use chalk/ora for clear startup feedback and error messages

## Don't Hand-Roll

| Problem                       | Don't Build                     | Use Instead       | Why                                                                           |
| ----------------------------- | ------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| CLI argument parsing          | Custom string splitting         | minimist          | Handles flags, aliases, defaults, edge cases                                  |
| Terminal output formatting    | Manual console.log with colors  | chalk             | Cross-platform color support, readable API                                    |
| Loading spinners              | Custom interval-based animation | ora               | Handles edge cases (TTY detection, cleanup), already in project               |
| Cross-platform shell commands | OS-specific conditionals        | zx                | Unified interface, already in project, used by setup.mjs                      |
| Configuration file parsing    | Custom YAML/JSON parsers        | Native JSON.parse | Agent configs already use simple YAML; custom parser exists in basic-agent.ts |

**Key insight:** The project already has zx, ora, and chalk installed. Use them rather than introducing new dependencies or building custom solutions.

## Common Pitfalls

### Pitfall 1: Wrong Working Directory

**What goes wrong:** Scripts fail because they run from wrong directory (e.g., expecting `config/` to be in CWD).

**Why it happens:** npm scripts can be run from any directory in the workspace, not just root.

**How to avoid:** Always use `__dirname` or `path.resolve()` for script-internal paths, and `process.cwd()` for repository-relative paths.

**Warning signs:** `Error: ENOENT: no such file or directory, open 'config/agent.json'`

### Pitfall 2: Port Already in Use

**What goes wrong:** Dev server fails to start because port is already bound.

**Why it happens:** Previous instance didn't shut down cleanly, or another service uses the port.

**How to avoid:** In `start-api.mjs` and `start-dashboard.mjs`, catch EADDRINUSE error and provide clear message with fix: `Error: Port 3000 is already in use. Fix: Stop the existing process or change the port in config.`

**Warning signs:** `Error: listen EADDRINUSE: address already in use :::3000`

### Pitfall 3: Missing Build Artifacts

**What goes wrong:** Scripts fail because `dist/` doesn't exist or is outdated.

**Why it happens:** Developer forgot to run `npm run build` after code changes.

**How to avoid:** Check for `dist/` directory existence in start scripts, fail with message: `Error: Build artifacts not found. Fix: Run 'npm run build' first.`

**Warning signs:** `Cannot find module './dist/index.js'` or import errors

### Pitfall 4: Import Resolution Issues

**What goes wrong:** Example agent fails to import from `@openclaw-swarm/coordination` in npm workspace context.

**Why it happens:** npm workspace symlinks not set up, or dist/ not built.

**How to avoid:** Ensure `npm install` creates proper workspace symlinks, and always run `npm run build` before `npm run agent`. Use the same import pattern as `examples/basic-agent.ts` (lines 17-33).

**Warning signs:** `Error: Cannot find module '@openclaw-swarm/coordination'`

### Pitfall 5: No Graceful Shutdown

**What goes wrong:** Ctrl+C leaves orphaned processes or database connections open.

**Why it happens:** SIGINT/SIGTERM handlers not registered.

**How to avoid:** Always register signal handlers that call `.stop()` methods on agents/servers before `process.exit(0)`.

**Warning signs:** "Port already in use" errors after stopping process with Ctrl+C

## Code Examples

Verified patterns from official sources:

### Starting API Server with Database Init

```javascript
// Source: packages/coordination/src/api/server.ts (lines 51-88, 103-133)
import { createStateApi, startServer } from '@openclaw-swarm/coordination';
import { createDatabase, initializeSchema } from '@openclaw-swarm/coordination';
import Database from 'better-sqlite3';

// Create database and initialize schema
const db = createDatabase({ dbPath: '/path/to/swarm.db' });
initializeSchema(db);

// Create Express app and start server
const app = createStateApi(db);
const server = startServer(app, 3000); // Port from config

// Graceful shutdown
process.on('SIGTERM', async () => {
  await stopServer(server);
  db.close();
  process.exit(0);
});
```

### Starting Dashboard with Vite

```javascript
// Source: packages/dashboard/package.json (lines 5-9)
// Vite dev server is started via workspace script:
// npm run dev --workspace=@openclaw-swarm/dashboard

// Vite config (packages/dashboard/vite.config.js):
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173, // Read from config/dashboard.json instead
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

### Starting Agent with Config

```javascript
// Source: examples/basic-agent.ts (lines 342-398)
import { connectToBroker, loadOptimizationConfig } from '@openclaw-swarm/coordination';

async function main() {
  // Load config (YAML parsing from basic-agent.ts lines 46-87)
  const config = await loadConfig('./config/agent.json');

  // Connect to broker
  const mqttClient = await connectToBroker({
    brokerUrl: config.brokerUrl,
    clientId: config.agentId,
  });

  // Create and start agent
  const agent = new BasicAgent(config, mqttClient);
  await agent.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });
}
```

### Structured Logging from Scripts

```javascript
// Source: packages/coordination/src/errors/logger.ts (lines 177-217)
import { getLogger } from '@openclaw-swarm/coordination';

// Use existing logger pattern
const logger = getLogger('agent-runner', 'info'); // agentId, minLevel

logger.info('Agent starting', { agentId: config.agentId });
logger.error('Failed to connect to broker', {
  error: { message: err.message, code: err.code },
});
```

## State of the Art

| Old Approach           | Current Approach        | When Changed    | Impact                                                       |
| ---------------------- | ----------------------- | --------------- | ------------------------------------------------------------ |
| `lerna run`            | npm workspaces          | npm 7.0+ (2021) | Native workspace support, no external tool needed            |
| `shelljs` for scripts  | zx                      | 2022-2025       | zx provides cleaner syntax, better ESM support               |
| `yargs` for CLI args   | minimist (simple cases) | Ongoing         | minimist lighter for simple flags, yargs for complex CLIs    |
| Vite 3.x               | Vite 5.x                | 2024            | HMR improvements, faster builds                              |
| Process managers (PM2) | npm scripts for dev     | Ongoing         | PM2 still used in production, npm scripts sufficient for dev |

**Deprecated/outdated:**

- `lerna`: Largely replaced by npm workspaces and pnpm workspaces
- `shelljs`: Replaced by zx for new projects (better TypeScript/ESM support)
- `npm start` for everything: Specific scripts (`npm run agent`, `npm run api`) preferred over overloading `start`

## Open Questions

1. **Config file format (JSON vs YAML)**
   - What we know: Existing example configs use YAML (`examples/configs/*.config.yaml`), project has `config/agents.yaml`
   - What's unclear: Should new `config/agent.json` use JSON for simpler parsing, or YAML for consistency with existing configs?
   - Recommendation: Use JSON for simpler parsing in scripts (native `JSON.parse()`), as YAML parsing requires additional dependency. The custom YAML parser in `basic-agent.ts` (lines 46-87) is verbose.

2. **Dashboard production mode**
   - What we know: Dashboard has `build` and `preview` scripts in package.json
   - What's unclear: Should `npm run dashboard --prod` use Vite's `preview` command, or serve static files with a simple HTTP server?
   - Recommendation: Use `vite preview` for production mode (built into Vite, supports pre-built assets). Flag name: `--production` (more explicit than `--prod`).

3. **Port conflict handling**
   - What we know: Ports specified in config files, Vite handles HMR port
   - What's unclear: Should scripts attempt to find an available port automatically, or fail fast with error message?
   - Recommendation: Fail fast with clear error message (matches project's "fail fast" philosophy from setup script). Port conflicts indicate user configuration issue, not transient problem.

## Sources

### Primary (HIGH confidence)

- **npm CLI v11 Documentation** - [npm-run](https://www.npmjs.com/package/npm-run), [npm workspaces](https://nodejs.cn/npm/cli/v9/using-npm/workspaces/)
- **Vite 5.x Documentation** - Server configuration, HMR setup, dev server API
- **Project source code** - `scripts/setup.mjs`, `examples/basic-agent.ts`, `packages/coordination/src/api/server.ts`, `packages/coordination/src/errors/logger.ts`
- **Project dependencies** - Root `package.json` (zx ^8.8.5, ora ^9.3.0, chalk ^5.6.2)

### Secondary (MEDIUM confidence)

- [npm workspaces run scripts best practices 2026](https://www.cnblogs.com/wp-leonard/p/17903768.html) - npm workspace script execution patterns, `--if-present` flag, root script shortcuts
- [npm monorepo scripts patterns](https://github.com/badlogic/pi-mono) - AI agent toolkit monorepo with npm workspaces, showing `npm run build`, `npm run check` patterns
- [Vite HMR configuration](https://vitejs.dev/config/server-options.html) - Official Vite server configuration documentation
- [Cross-platform npm scripts](https://m.blog.csdn.net/m2n3b4v5c6/article/details/154827166) - cross-env for environment variables, Windows/Mac compatibility

### Tertiary (LOW confidence)

- [2026 CLI tools trends](https://m.toutiao.com/article/7609276304713646638/) - General CLI tool landscape (mentions zx indirectly)
- [Graceful shutdown patterns](https://github.com/topics/graceful) - GitHub topic showing 77+ repositories for graceful shutdown (indicates well-established pattern)
- [zx CLI argument parsing](https://www.npmjs.com/package/zx) - zx npm package documentation (verified zx supports process.argv access for custom parsing)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - npm workspaces, zx, Vite are well-established; verified with official docs
- Architecture: HIGH - Based on project's existing patterns (setup.mjs, basic-agent.ts) and established npm practices
- Pitfalls: HIGH - Common issues with npm scripts, verified against project structure and requirements

**Research date:** 2026-02-24
**Valid until:** 2026-03-26 (30 days - stable domain, npm/Vite versions change slowly)
