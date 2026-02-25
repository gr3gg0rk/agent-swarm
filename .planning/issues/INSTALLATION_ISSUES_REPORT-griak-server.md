# Installation Issues Report

**Date:** 2026-02-23
**Environment:** Raspberry Pi 5 (griak-server), Node.js v22.22.0
**Agent:** Vulcan (worker-1)

## Summary

During the installation of OpenClaw Swarm, several issues prevented the agent from running. These included incorrect msgpackr imports, ES module resolution problems through npm workspaces, and lack of proper run scripts.

## Issues Encountered

### Issue 1: Incorrect msgpackr Imports (CRITICAL)

**Severity:** Critical blocker
**Files affected:**
- `packages/coordination/src/communication/codec.ts`
- `packages/coordination/src/communication/mqtt.ts`
- `packages/coordination/src/optimization/batcher.ts`

**Problem:**
The code imported `MessagePack` from the `msgpackr` package:
```typescript
import { MessagePack } from 'msgpackr';
// ...
const payload = MessagePack.encode(envelope);
const decoded = MessagePack.decode(buffer);
```

However, `msgpackr` does not export a `MessagePack` class. It exports `pack` and `unpack` functions directly:
```javascript
// Actual msgpackr exports:
['Packr', 'Unpackr', 'unpack', 'pack', 'decode', 'encode', ...]
// NO 'MessagePack' export
```

**Error message:**
```
SyntaxError: The requested module 'msgpackr' does not provide an export named 'MessagePack'
```

**Root cause:**
The msgpackr library's API was misunderstood or the code was written against an older version.

**Fix applied:**
Changed imports and usages:
```typescript
import { pack, unpack } from 'msgpackr';
// ...
const payload = pack(envelope);
const decoded = unpack(buffer);
```

**Recommendation for repo:**
1. Fix the source files with correct imports
2. Add a unit test that actually imports and uses msgpackr functions
3. Document the correct msgpackr API in RESEARCH.md

---

### Issue 2: ES Module Resolution Through npm Workspaces

**Severity:** High blocker
**Error:** `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined`

**Problem:**
When using npm workspaces, Node.js creates symlinks in `node_modules/@openclaw-swarm/coordination` → `../../packages/coordination`.

Node.js ES module resolution through these symlinks failed with:
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
/home/gr3gg0rk/agent-swarm/node_modules/@openclaw-swarm/coordination/package.json
```

The `package.json` HAD a valid `exports` field:
```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

But Node.js couldn't resolve it through the symlink when using `tsx`.

**Workaround applied:**
Created `examples/run-agent.ts` that imports directly from the compiled dist path:
```typescript
import { connectToBroker, Topics, ... } from '../packages/coordination/dist/index.js';
```

This bypasses the package name resolution entirely.

**Root cause:**
- Interaction between tsx, npm workspaces symlinks, and Node.js ESM resolution
- The package uses `"type": "module"` which triggers strict ESM semantics
- tsx's module resolution doesn't handle symlinked workspace packages correctly

**Recommendation for repo:**
1. **Add a proper run script** to package.json that works around the resolution issue
2. **Consider switching to CommonJS** or using a different build tool (tsup/esbuild)
3. **Add `ts-node` or `tsx` as a workspace dependency** not just devDependency
4. **Create wrapper scripts** in examples/ that use relative imports
5. **Alternative:** Use pnpm workspaces which handle symlinks differently

---

### Issue 3: No Working Run Scripts

**Severity:** Medium
**Problem:**
The README says to run:
```bash
CONFIG_PATH=/path/to/config.yaml tsx examples/basic-agent.ts
```

But this doesn't work because:
1. `tsx` might not be installed (wasn't in this case)
2. The module resolution fails through workspaces

**Fix applied:**
- Added `tsx` as a devDependency in root package.json
- Created `examples/run-agent.ts` with relative imports

**Recommendation for repo:**
1. Add npm scripts to `package.json`:
   ```json
   "scripts": {
     "agent:worker-1": "CONFIG_PATH=./config/worker-1.yaml tsx examples/run-agent.ts",
     "agent:minerva": "CONFIG_PATH=./config/minerva.yaml tsx examples/run-agent.ts"
   }
   ```
2. Update README with working commands
3. Add a `Makefile` or `justfile` for common tasks

---

### Issue 4: Missing tsx Dependency

**Severity:** Low (but caused confusion)
**Problem:**
`tsx` was not installed, so `npx tsx` downloaded a cached version that may have had compatibility issues.

**Fix:**
Added `tsx` to root `package.json` devDependencies.

---

## Proposed Fixes for the Repository

### Immediate Fixes (Required)

1. **Fix msgpackr imports** in all three files
2. **Add proper run scripts** to root package.json
3. **Create working example scripts** in examples/
4. **Update README** with verified installation steps

### Feature Additions to Prevent Future Issues

#### 1. Add a Setup/Install Script

Create `scripts/setup-agent.sh`:
```bash
#!/bin/bash
# Setup script for new agent installations
AGENT_NAME=${1:-"worker-1"}
echo "Setting up $AGENT_NAME..."

# Install dependencies
npm install
cd packages/coordination && npm install && npm run build
cd ../dashboard && npm install

# Create agent config from template
cp examples/config.yaml "$AGENT_NAME-config.yaml"

# Test the build
echo "Testing build..."
node -e "require('./packages/coordination/dist/index.js')"

echo "Setup complete! Run with: npm run agent:$AGENT_NAME"
```

#### 2. Add Pre-commit Hook for Import Testing

Create `.husky/pre-commit`:
```bash
#!/bin/bash
# Test that imports actually resolve
npm run test:imports || exit 1
```

Add to package.json:
```json
"scripts": {
  "test:imports": "node -e \"import('./packages/coordination/dist/index.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1); })\""
}
```

#### 3. Add CI Check for msgpackr API

Create a GitHub Action `.github/workflows/test-msgpackr.yml`:
```yaml
name: Test msgpackr API
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - run: npm install
      - run: npm run build
      - run: node -e "import('./packages/coordination/dist/index.js')"
```

#### 4. Update Package.json Scripts

```json
{
  "scripts": {
    "build": "npm run build:coordination",
    "build:coordination": "cd packages/coordination && npm run build",
    "dev": "npm run build -- --watch",
    "agent": "tsx examples/run-agent.ts",
    "agent:vulcan": "CONFIG_PATH=./vulcan-config.yaml npm run agent",
    "agent:minerva": "CONFIG_PATH=./config/minerva.yaml npm run agent"
  }
}
```

#### 5. Add Health Check Script

Create `scripts/health-check.sh`:
```bash
#!/bin/bash
# Check if the coordination package is buildable and importable

echo "Checking coordination package..."
cd packages/coordination

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "ERROR: dist/ directory not found. Run 'npm run build' first."
    exit 1
fi

# Check if index.js exists
if [ ! -f "dist/index.js" ]; then
    echo "ERROR: dist/index.js not found."
    exit 1
fi

# Try to import it
node -e "import('./dist/index.js').then(() => console.log('OK')).catch(e => { console.error('IMPORT ERROR:', e.message); process.exit(1); })"

echo "Health check passed!"
```

## Verification Steps

After fixes, new installations should work with:

```bash
# Clone repo
git clone <repo> agent-swarm
cd agent-swarm

# Run setup (new script)
npm run setup

# Or manual setup
npm install
npm run build

# Run agent
npm run agent:vulcan
```

## Files Modified During Troubleshooting

1. `packages/coordination/src/communication/codec.ts` - Fixed msgpackr imports
2. `packages/coordination/src/communication/mqtt.ts` - Fixed msgpackr imports
3. `packages/coordination/src/optimization/batcher.ts` - Fixed msgpackr imports
4. `package.json` - Added workspaces, tsx dependency
5. `vulcan-config.yaml` - Created new config file
6. `examples/run-agent.ts` - Created working runner with relative imports

## Additional Notes

- The msgpackr issue suggests the code wasn't actually tested after writing
- npm workspaces + ESM modules + tsx is a tricky combination that needs better documentation
- Consider using a build tool like `tsup` that bundles dependencies for easier distribution
