# Pitfalls Research: Installation Improvements

**Domain:** npm package installation improvements, ESM exports, workspaces
**Milestone:** v1.2 Installation Fixes
**Researched:** 2026-02-23
**Confidence:** HIGH (based on actual installation failures from 2 machines)

## Critical Pitfalls

### Pitfall 1: Incorrect Third-Party API Usage

**What goes wrong:**
Code imports non-existent exports from dependencies (e.g., `import { MessagePack } from 'msgpackr'` when msgpackr only exports `pack`/`unpack` functions). This causes `SyntaxError: The requested module 'X' does not provide an export named 'Y'`.

**Why it happens:**
- Code written without testing actual imports against the library
- Copying from outdated documentation or similar libraries
- Assuming APIs follow common patterns without verification
- msgpackr specifically: exports `Packr`/`Unpackr` classes and `pack`/`unpack` functions, but NOT `MessagePack`

**How to avoid:**
- Write a unit test that imports and uses every third-party library before committing
- Check the library's actual exports: `node -e "console.log(Object.keys(require('lib')))"` (CJS) or check package.json exports field
- Add CI check that imports all dependencies and calls basic functions
- For ESM: check `"exports"` field in package.json

**Warning signs:**
- No tests exercise the third-party import directly
- Tests mock the library instead of using the real one
- Library usage copied from StackOverflow without version verification
- Code compiles but fails at runtime with "does not export" error

**Phase to address:**
Phase 12-01 (Fix Installation Issues) — Add import validation tests to CI

**Evidence from griak-server:**
```
SyntaxError: The requested module 'msgpackr' does not provide an export named 'MessagePack'
```
Files affected: `codec.ts`, `mqtt.ts`, `batcher.ts`

---

### Pitfall 2: ESM Module Resolution Through Workspace Symlinks

**What goes wrong:**
When using npm workspaces, Node.js creates symlinks in `node_modules/@openclaw-swarm/coordination` -> `../../packages/coordination`. With `"type": "module"`, tsx and Node.js ESM resolution fails through these symlinks with `ERR_PACKAGE_PATH_NOT_EXPORTED`, even when package.json has valid exports.

**Why it happens:**
- tsx's module resolution doesn't handle symlinked workspace packages correctly
- ESM has strict path resolution that doesn't follow symlinks the way CJS does
- The `exports` field in package.json is resolved relative to the symlink target, not the symlink location
- `"type": "module"` triggers strict ESM semantics that disallow some symlink patterns

**How to avoid:**
1. Create wrapper scripts that use relative imports to compiled dist: `import from '../packages/coordination/dist/index.js'`
2. Add npm scripts that don't rely on package name resolution through workspaces
3. Consider using tsup/esbuild to bundle dependencies
4. Alternatively: use pnpm workspaces which handle symlinks differently

**Warning signs:**
- Works when importing from source (`.ts`) but fails from built (`.js`)
- `npx tsx` works but `node` fails
- Error mentions "exports" when exports field is clearly defined
- Error only occurs in workspace, not when package is published

**Phase to address:**
Phase 12-02 (ESM Resolution Fixes) — Add wrapper scripts and update npm scripts

**Evidence from griak-server:**
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
/home/gr3gg0rk/agent-swarm/node_modules/@openclaw-swarm/coordination/package.json
```
Despite having valid exports field. Resolution failed through symlink.

---

### Pitfall 3: Missing Module Exports

**What goes wrong:**
Code modules exist but aren't exported from the main index.ts, causing "TypeError: X is not a function" when users try to use public API functions (e.g., `loadOptimizationConfig`, `MessageBatcher`, `initializeSchema`).

**Why it happens:**
- Barrel files (index.ts) not updated when new modules are added
- Assuming all files are automatically exported
- Missing `export * from './module.js'` statements
- TypeScript compiles but runtime fails because exports are not wired

**How to avoid:**
- Add a CI check that validates all exported functions exist in the built dist
- Create a test that imports from the package (not source files) and calls each public API
- Use `exports` field in package.json to enforce what's public
- Document public API in README and cross-check with exports
- Run `npm link` or use `workspace:` protocol to test package imports

**Warning signs:**
- TypeScript autocomplete doesn't show some functions when importing package
- New module works in development but "is not a function" in production
- No test imports from the built package path

**Phase to address:**
Phase 12-01 (Fix Installation Issues) — Add export validation and test imports from dist

**Evidence from griak-brain:**
Optimization module not exported, causing "is not a function" errors for:
- `loadOptimizationConfig`
- `MessageBatcher`
- `ConnectionPoolManager`

---

### Pitfall 4: Database Pragma Return Type Mismatch

**What goes wrong:**
better-sqlite3's `pragma()` returns an object by default, not a string. Code expecting a string gets `[object Object]` instead of the actual value (e.g., WAL mode confirmation).

**Why it happens:**
- better-sqlite3 API changed between versions
- Default behavior returns `{ journal_mode: 'wal' }` object
- `{ simple: true }` option required for single string value
- Code written without testing against actual database

**How to avoid:**
- Always check library documentation for version-specific options
- Write integration tests that use the real database, not mocks
- Log the actual return type during development to catch mismatches
- Add type guards: `typeof result === 'string' ? result : result.journal_mode`

**Warning signs:**
- Error message contains `[object Object]`
- Database queries work but values are wrong type
- No integration test actually opens a SQLite database

**Phase to address:**
Phase 12-03 (Database Fixes) — Fix pragma calls, add integration tests for database operations

**Evidence from griak-brain:**
```
Error: Failed to enable WAL mode: got [object Object]
```
Code: `db.pragma('journal_mode = WAL')`
Fix: `db.pragma('journal_mode = WAL', { simple: true })`

---

### Pitfall 5: Missing Schema Initialization

**What goes wrong:**
API server tries to use tables that don't exist because `initializeSchema()` was never called. Results in `SqliteError: no such table: tasks`.

**Why it happens:**
- No automatic schema initialization on package import
- Example code doesn't call initialization
- Schema initialization function exists but not exported
- Documentation doesn't mention required setup step

**How to avoid:**
- Export initialization function from main index: `export * from './state/schema.js'`
- Add lazy initialization: check if tables exist on first query
- Provide a setup script that calls initialization
- Document required initialization in README with clear steps

**Warning signs:**
- Database-related errors immediately after installation
- No test that actually queries the database
- Schema definition file exists but never imported

**Phase to address:**
Phase 12-03 (Database Fixes) — Export schema init, add to setup script, document in README

**Evidence from griak-brain:**
```
SqliteError: no such table: tasks
```
Schema initialization function existed but wasn't called or exported.

---

### Pitfall 6: Column Count Mismatch in INSERT

**What goes wrong:**
INSERT statement has N placeholders but table has M columns (N != M), causing `SqliteError: N values for M columns`.

**Why it happens:**
- Schema modified but INSERT statements not updated
- Columns removed/added without updating queries
- No test validates INSERT against schema
- Manual SQL writing without compile-time checking

**How to avoid:**
- Use an ORM or query builder that validates against schema
- Add integration test that performs INSERT and verifies
- Use TypeScript types that derive from schema (e.g., generated types)
- Add pre-commit hook that compares INSERT columns to schema

**Warning signs:**
- Manual SQL strings with numbered placeholders
- No test actually inserts into the database
- Schema changes without corresponding query updates

**Phase to address:**
Phase 12-03 (Database Fixes) — Fix INSERT statements, add integration tests

**Evidence from griak-brain:**
```
SqliteError: 16 values for 15 columns
```
INSERT had 16 placeholders but table only had 15 columns.

---

### Pitfall 7: postinstall Scripts in Workspaces

**What goes wrong:**
When using npm workspaces, `postinstall` scripts can run multiple times (once per package) or in unexpected order, causing performance issues or duplicate operations.

**Why it happens:**
- npm runs lifecycle scripts for each workspace package
- No coordination between workspace scripts
- Scripts may depend on each other's outputs
- Running `npm install` in workspace root triggers all workspace postinstalls

**How to avoid:**
- Use root-level `postinstall` for workspace-wide operations
- Add guard clauses: `if [ "$INIT_CWD" != "$(pwd)" ]; then exit 0; fi`
- Prefer manual setup scripts over automatic postinstall
- Document when to run setup manually instead of automatically

**Warning signs:**
- Setup operations happening multiple times during install
- Slow `npm install` due to build steps in postinstall
- "file already exists" errors during install

**Phase to address:**
Phase 12-04 (Setup Scripts) — Create manual setup script instead of relying on postinstall

---

### Pitfall 8: Portability of Setup Scripts

**What goes wrong:**
Setup scripts assume specific OS, shell, or tools (e.g., bash-specific syntax, systemctl for systemd, specific Mosquitto installation path). Fails on different machines or OSes.

**Why it happens:**
- Scripts written for one developer's machine
- Hardcoded paths (/usr/local vs /usr)
- Bash-specific syntax used in `/bin/sh` scripts
- No detection of OS differences

**How to avoid:**
- Use Node.js for setup scripts (more portable than shell)
- Detect OS with `process.platform` and branch accordingly
- Make paths configurable via environment variables
- Test setup on all target machines (Ubuntu, Raspberry Pi OS, etc.)
- Document prerequisites and required tools

**Warning signs:**
- Script only tested on one OS
- Hardcoded absolute paths
- Bash arrays or other bash-specific features in shebang `/bin/sh`

**Phase to address:**
Phase 12-04 (Setup Scripts) — Write portable Node.js setup script, test on all target machines

---

### Pitfall 9: Missing Runtime Dependencies

**What goes wrong:**
Tools referenced in scripts (tsx, ts-node) not installed or only in devDependencies. Results in "command not found" when users try to run examples.

**Why it happens:**
- README assumes tsx is available globally
- tsx in devDependencies but not installed via `npm install -g`
- npx uses cached version with compatibility issues
- No npm script to wrap the command

**How to avoid:**
- Add all runtime tools to package.json scripts
- Use `node_modules/.bin/tsx` in scripts (automatically available)
- Document: `npm run build` before running examples
- Include tsx as regular dependency if used in production code

**Warning signs:**
- README says `tsx file.ts` without `npm run` wrapper
- Examples fail with "command not found"
- No script in package.json for common operations

**Phase to address:**
Phase 12-02 (Add Run Scripts) — Add npm scripts for all common operations, document in README

**Evidence from griak-server:**
tsx not installed, caused "command not found". Had to add to devDependencies.

---

### Pitfall 10: Mosquitto Snap Persistence Disabled

**What goes wrong:**
Mosquitto installed via snap ships with `persistence false`, breaking agent discovery which relies on retained MQTT messages. Agents appear to register successfully but discovery data is not persisted.

**Why it happens:**
- Snap package has different default configuration than system package
- Mosquitto persistence required but not checked
- No health check verifies retained messages work
- Documentation doesn't mention persistence requirement

**How to avoid:**
- Add setup check: `mosquitto -c /etc/mosquitto/mosquitto.conf -t` (test config)
- Verify persistence: `mosquitto_pub -t '$SYS/broker/persistence' -r -n` then check retained
- Document requirement prominently in README
- Provide setup command to enable persistence
- Consider alternative discovery that doesn't require retained messages

**Warning signs:**
- Discovery/registry works during session but empty after restart
- No test for retained message behavior
- Mosquitto config not checked during setup

**Phase to address:**
Phase 12-05 (Mosquitto Setup) — Add persistence check to setup script, document in README

**Evidence from griak-brain:**
Snap version of Mosquitto had `persistence false`, breaking agent discovery.
Workaround: Stop snap mosquitto, use system version instead.

---

### Pitfall 11: Missing `.js` Extensions in ESM Imports

**What goes wrong:**
ESM requires explicit file extensions in import statements. Code using `export * from './module'` (without `.js`) fails at runtime even though TypeScript compiles successfully.

**Why it happens:**
- TypeScript allows extensionless imports (transpiles to CJS)
- ESM spec requires explicit extensions for resolution
- `.js` extension required even for `.ts` source files (transpiled to `.js`)
- Common mistake: writing `.ts` extension instead of `.js`

**How to avoid:**
- Always use `.js` extensions in ESM imports (even for `.ts` source)
- Set TypeScript `moduleResolution: "Node16"` or `"NodeNext"`
- Enable ESLint rule to catch missing extensions
- Test built output, not source

**Warning signs:**
- Code compiles with `tsc` but fails at runtime
- Import paths without file extensions in `.ts` files
- Using `"type": "module"` without `.js` extensions

**Phase to address:**
Phase 12-01 (Import Fixes) — Add `.js` extensions to all ESM imports

**Evidence from codebase:**
Current index.ts uses `'./communication/index.js'` (correct - has .js extension).
This is already done correctly, but should be verified across all files.

---

### Pitfall 12: Agent Registry Not Loaded

**What goes wrong:**
Agent tries to register but agent registry is empty, causing validation failure. Error shows "Unknown agent ID" with empty list of known agents.

**Why it happens:**
- Agent registry not loaded before registration
- No automatic loading of agent config
- Example code doesn't show required setup step
- Error message doesn't indicate how to fix

**How to avoid:**
- Export `loadAgentConfig` function from main index
- Add automatic registry loading with sensible defaults
- Document agent registry configuration in README
- Provide example configs for common agent roles
- Improve error message to suggest loading config

**Warning signs:**
- Agent registration fails with "unknown agent"
- Empty list in error message
- No test that actually registers an agent

**Phase to address:**
Phase 12-03 (Database Fixes) — Export loadAgentConfig, add to setup script

**Evidence from griak-brain:**
```
Error: Unknown agent ID "minerva". Must be one of:
```
(Empty list - registry not loaded)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Mock third-party libraries in tests | Faster tests, no external deps | Misses API changes like msgpackr | Never for libraries you don't control |
| Manual SQL strings | No ORM overhead, simple queries | Column mismatches, no validation | Only with integration tests |
| Shell scripts for setup | Quick to write | OS-specific, fragile | During development only |
| Relative imports to dist | Works around workspace symlink issues | Breaks if package structure changes | Until proper fix is implemented |
| Skipping export tests | Faster development | Missing exports discovered by users | Never - add to CI immediately |
| Using package.json main without exports | Simpler config | No type checking, CJS/ESM confusion | Never for ESM packages |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| better-sqlite3 pragma | Expecting string return, getting object | Use `{ simple: true }` option |
| msgpackr | Importing non-existent `MessagePack` class | Import `pack`, `unpack` functions directly |
| MQTT with snap | Assuming persistence is enabled | Check and enable persistence in config |
| npm workspaces | Using package name imports with tsx | Create wrapper scripts with relative imports |
| TypeScript exports | Adding file but not exporting from index.ts | Add `export * from './new-file.js'` to barrel |
| ESM imports | Missing `.js` file extensions | Always use `.js` even for `.ts` source |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| postinstall builds | npm install takes 10+ minutes | Use manual setup scripts | Immediately in monorepos |
| Unoptimized SQLite | Slow queries as dataset grows | Use indexes, WAL mode | >10k tasks |
| MQTT without batching | Network congestion at high load | Implement message batching | >100 messages/second |
| Missing exports | Users stuck debugging imports | CI test imports from dist | Immediately after adding module |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| postinstall executes arbitrary code | Supply chain attack | Review all dependencies, use --ignore-scripts |
| MQTT without auth | Unauthorized agent connections | Use username/password in production |
| Database world-readable | Sensitive state exposed | Set appropriate file permissions |
| Setup script as root | Accidental system damage | Check for root, warn user |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Long setup commands | Users give up before running | Single `npm run setup` command |
| Cryptic error messages | Users can't self-diagnose | Add "Fix:" suggestions to errors |
| Missing prerequisites | Install fails with confusing errors | Check prerequisites in setup script |
| No working examples | Users can't verify installation | Add working examples that run out of the box |
| Empty error lists | No clue what's wrong | Include suggestion in error message |

## "Looks Done But Isn't" Checklist

- [ ] **ESM exports:** Often missing barrel file updates — verify by importing from dist/
- [ ] **Third-party APIs:** Often copied from docs without testing — verify by running actual import
- [ ] **Database operations:** Often missing schema init — verify by testing on clean database
- [ ] **Workspace imports:** Often fail through symlinks — verify by importing package name, not path
- [ ] **Setup scripts:** Often work on one OS only — verify by testing on all target platforms
- [ ] **Mosquitto persistence:** Often disabled in snap — verify retained messages work
- [ ] **File extensions:** Often missing `.js` in ESM — verify imports have extensions
- [ ] **Run scripts:** Often missing from package.json — verify all common operations have scripts

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missing exports | LOW | Add `export * from './module.js'` to index.ts, rebuild |
| Incorrect API usage | LOW | Fix imports, search codebase for all uses |
| Missing schema init | MEDIUM | Run initializeSchema(), add to startup |
| Column count mismatch | MEDIUM | Fix SQL, check for similar issues in other queries |
| Workspace symlink issues | HIGH | Create wrapper scripts, consider bundling |
| Mosquitto snap persistence | MEDIUM | Switch to system package or edit snap config |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Incorrect API usage | Phase 12-01 (Import Fixes) | CI test imports and uses all third-party libs |
| ESM resolution through symlinks | Phase 12-02 (Wrapper Scripts) | Test that examples run with `npm run agent:*` |
| Missing exports | Phase 12-01 (Export Fixes) | Test imports from built dist/ directory |
| Pragma return type | Phase 12-03 (Database Fixes) | Integration test opens real database |
| Missing schema init | Phase 12-03 (Database Fixes) | Test on clean database, verify tables exist |
| Column count mismatch | Phase 12-03 (Database Fixes) | Integration test performs INSERT |
| postinstall in workspaces | Phase 12-04 (Setup Scripts) | Run `npm install` on fresh clone, verify no errors |
| Script portability | Phase 12-04 (Setup Scripts) | Test on Ubuntu, Raspberry Pi OS |
| Missing runtime deps | Phase 12-02 (Run Scripts) | Run all npm scripts on fresh install |
| Mosquitto persistence | Phase 12-05 (Mosquitto Setup) | Setup script checks and enables persistence |
| Missing .js extensions | Phase 12-01 (Import Fixes) | Lint for missing extensions in ESM imports |
| Agent registry not loaded | Phase 12-03 (Database Fixes) | Test agent registration with registry loaded |

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 12-01: Import/Export Fixes | Missing exports after fixing imports | Add CI test that imports from dist/ |
| Phase 12-02: Wrapper Scripts | Scripts break when package structure changes | Document assumptions, add tests |
| Phase 12-03: Database Fixes | Schema changes break existing data | Add migration scripts, test on clean DB |
| Phase 12-04: Setup Scripts | Script works on dev machine only | Test on all target platforms |
| Phase 12-05: Mosquitto Setup | Snap vs system package confusion | Detect which is installed, handle both |

## Sources

- **HIGH confidence:** Actual installation failures from griak-brain (Ubuntu, snap packages) — documented in `.planning/issues/INSTALLATION-ISSUES-griak-brain.md`
- **HIGH confidence:** Actual installation failures from griak-server (Raspberry Pi 5, Node.js 22.22.0) — documented in `.planning/issues/INSTALLATION_ISSUES_REPORT-griak-server.md`
- **HIGH confidence:** Source code analysis showing incorrect `import { MessagePack } from 'msgpackr'` in 3 files
- **MEDIUM confidence:** better-sqlite3 documentation — { simple: true } option for pragma
- **MEDIUM confidence:** msgpackr package exports — exports pack/unpack, not MessagePack
- **MEDIUM confidence:** Node.js ESM documentation — strict path resolution through symlinks
- **MEDIUM confidence:** npm workspaces documentation — symlink behavior, postinstall execution
- **LOW confidence:** tsx known issues — module resolution through symlinks (needs verification)

---
*Pitfalls research for: npm package installation improvements, ESM exports, workspaces*
*Milestone: v1.2 Installation Fixes*
*Researched: 2026-02-23*
