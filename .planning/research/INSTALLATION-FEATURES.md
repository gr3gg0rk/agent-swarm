# Feature Landscape: Installation Reliability & Developer Experience

**Domain:** npm Package Developer Experience & Installation Reliability
**Researched:** 2026-02-23
**Overall confidence:** MEDIUM

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Valid package.json exports** | Prevents "Module not found" errors, required for TypeScript ESM | Low | Current issue: missing types in exports condition, no conditional exports for different environments |
| **Post-install validation** | Catches dependency issues early, prevents cryptic runtime errors | Medium | Check Node version, Mosquitto availability, database schema initialization |
| **Clear error messages** | Developers need actionable guidance when setup fails | Medium | Current: generic errors. Needed: specific error codes, suggested fixes, links to docs |
| **README with quick start** | First question: "How do I use this?" | Low | Should include: prerequisites, installation steps, basic example, troubleshooting |
| **Example configuration** | Developers copy-paste to get started | Low | Missing: config examples for different roles (Minerva, worker agents) |
| **Health check endpoint** | Needed for monitoring and debugging deployment | Low | Exists but not documented or easily discoverable |
| **Basic documentation** | API docs, architecture overview, troubleshooting guide | Medium | Currently missing dedicated documentation files |
| **Proper build pipeline** | Must build before publish, type definitions included | Low | Has `prepublishOnly` but missing source maps, inconsistent exports |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Interactive setup wizard** | Walks through first-time configuration step-by-step | High | Could prompt for MQTT broker URL, agent role, machine ID |
| **Pre-flight check script** | Validates environment before first run, catches issues proactively | Medium | Checks: Node version, Mosquitto connectivity, port availability, disk space |
| **Example agent implementations** | Copy-paste working examples accelerate development | Medium | Full working examples for common agent patterns |
| **Health check CLI command** | `npm run health` validates entire deployment | Low | Easy win: runs all checks, reports status |
| **Migration guides** | Helps existing users upgrade safely | Medium | Critical for v1.x to v2.0 transitions |
| **Development mode detection** | Different behavior for dev vs production (verbose logging, hot reload) | Low | Environment variable driven, easier debugging |
| **Troubleshooting guides** | Covers common gotchas: Mosquitto snap issues, network partitions | Medium | Reduces support burden |
| **IDE integration helpers** | VS Code snippets, launch configurations | Low | Nice-to-have for better DX |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic dependency installation** (e.g., installing Mosquitto) | Security risk, OS-specific, breaks sandboxes, blocked by many orgs | Document prerequisites clearly, provide install commands for common OSes |
| **postinstall script that downloads binaries** | Security red flag, supply chain attack vector | Use optional dependencies, document manual install |
| **Telemetry/phone-home** | Privacy concerns, corporate policies block | Make health checks local-only, opt-in error reporting |
| **Complex web UI for setup** | Bloats package, maintenance burden | Keep setup CLI-based, web UI separate (dashboard package exists) |
| **Global npm package installation** (`npm install -g`) | Conflicts with project-local deps, version pinning issues | Project-local installation only, use npx for CLI tools |
| **Multiple database backends** | YAGNI, adds complexity | SQLite is sufficient, documented requirement |

## Feature Dependencies

```
Valid exports -> Post-install validation (validation tests imports)
Error messages -> Pre-flight checks (checks provide actionable errors)
Example configs -> Documentation (docs explain configs)
Health endpoint -> CLI health command (CLI wraps endpoint)
```

## MVP Recommendation

**For v1.2 Installation Fixes Milestone:**

Prioritize:
1. **Fix package.json exports** - Unblock usage (HIGH priority, currently broken)
2. **Add pre-flight health check script** - Validate environment
3. **Write comprehensive README** - Quick start, prerequisites, troubleshooting
4. **Add example configuration files** - Copy-paste starter configs
5. **Improve error messages** - Actionable guidance with error codes

Defer:
- Interactive setup wizard (v2.0 differentiator)
- Example agent implementations (create separate examples package)
- IDE integration helpers (nice-to-have, not blocking)

## Categories and Complexity

### Setup Scripts

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| Pre-flight check script | Medium | Requires health endpoint, network checking, file system access |
| postinstall hook (simple) | Low | Just validates Node version, prints setup instructions |
| Setup wizard (interactive) | High | Requires prompts, config generation, validation logic |

**Recommendation:** Start with simple postinstall that prints helpful messages. Add pre-flight check as separate npm script. Defer interactive wizard.

### Validation and Health Checks

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| Health endpoint (exists) | Low | Already implemented, needs documentation |
| CLI health command | Low | Wraps health endpoint, formats output |
| Pre-flight check script | Medium | Checks: Node version, Mosquitto, ports, disk space, network |
| Database schema validation | Medium | Depends on schema initialization code |
| Runtime health monitoring | High | Continuous monitoring, alerting, metrics |

**Recommendation:** Document existing health endpoint. Add CLI wrapper. Implement pre-flight checks as Node script. Skip continuous monitoring (out of scope).

### Error Messages

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| Error code constants | Low | Central error code definitions |
| Actionable error messages | Medium | Requires mapping errors to solutions |
| Error context (debug mode) | Medium | Capture and display relevant state |
| Troubleshooting guide | Low | Static documentation, correlated with error codes |

**Recommendation:** Define error code enum first. Then update error sites to include actionable messages. Add troubleshooting guide to docs. Defer complex debug mode.

### Documentation Structure

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| README with quick start | Low | Basic project info |
| API documentation | Medium | Requires JSDoc/TSDoc comments |
| Architecture overview | Medium | Understanding system design |
| Troubleshooting guide | Medium | Common issues and solutions |
| Migration guides | High | Track breaking changes |

**Recommendation:** Start with comprehensive README. Add architecture overview. Create troubleshooting guide for common issues (Mosquitto, network). API docs can come from existing TypeScript types with JSDoc.

### Example Configs

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| Minerva config example | Low | Single YAML/JSON file |
| Worker agent config example | Low | Single YAML/JSON file |
| Environment-specific configs | Medium | Dev/staging/prod variants |
| Config validation schema | Medium | JSON Schema or TypeScript types |

**Recommendation:** Provide 2-3 example configs covering main use cases. Add JSON schema for validation. Document config options.

## Installation-Specific Issues

Current pain points to address:

1. **msgpackr import errors** - Using wrong API (MessagePack vs pack/unpack)
   - Fix: Update codec.ts to use correct msgpackr exports
   - Complexity: Low

2. **Missing exports** - Cannot import from package
   - Fix: Add proper conditional exports with types
   - Complexity: Low

3. **Database schema initialization** - No automated setup
   - Fix: Add initialization script, run on first use or via setup command
   - Complexity: Medium

4. **Column count mismatch** - Task queue INSERT fails
   - Fix: Align schema with INSERT statements
   - Complexity: Low

5. **No npm workspaces configuration** - Cannot use workspace features
   - Fix: Add workspaces to root package.json
   - Complexity: Low

## Mosquitto-Specific Concerns

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Snap version persistence issues | Data loss on reboot | Document apt install preference, persistence requirements |
| Version compatibility | 2.0+ has breaking changes | Specify minimum version in docs, provide upgrade guide |
| Authentication not configured | Security risk in production | Document auth setup, provide example config |
| Port conflicts (1883) | Setup failures | Check port availability in pre-flight script |

## Developer Onboarding Flow

Recommended onboarding experience:

1. **Clone repository** -> README explains project purpose
2. **npm install** -> postinstall prints setup checklist
3. **npm run build** -> Successful compilation with no errors
4. **npm run health** -> Pre-flight check validates environment
5. **Copy example config** -> Edit for local setup
6. **Run agent** -> Successful startup with clear console output
7. **Check dashboard** -> Visual confirmation of operation

At each step, errors should provide:
- What went wrong (specific error)
- Why it failed (context)
- How to fix it (actionable steps)
- Where to learn more (docs link)

## Sources

- MQTT.js package.json patterns (conditional exports, types field, bin commands)
- msgpackr package.json (module/main fields, optional dependencies)
- npm package.json exports documentation (Node.js official docs)
- Common npm package patterns (observed from popular packages in node_modules)
- Current package.json structure and issues

**Confidence Level: MEDIUM** - Based on package analysis and established npm patterns, but limited by unavailable web search resources. Recommend validating against current npm docs and popular packages.

---
*Installation reliability research for: OpenClaw Swarm v1.2*
*Researched: 2026-02-23*
