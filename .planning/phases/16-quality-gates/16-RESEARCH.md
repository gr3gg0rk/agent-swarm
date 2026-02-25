# Phase 16: Quality Gates - Research

**Researched:** 2026-02-24
**Domain:** CI/CD, pre-commit hooks, linting, TypeScript, npm package quality gates
**Confidence:** HIGH

## Summary

Phase 16 requires implementing quality gates for an npm package (monorepo with workspaces). The research shows clear best practices for 2026: GitHub Actions for CI with npm caching, Husky for pre-commit hooks, TypeScript ESLint with strict mode, and Vitest for integration testing. The key insight is that quality gates should be layered: pre-commit hooks catch local errors quickly, CI provides comprehensive verification on every push/PR, and integration tests verify the actual database operations work.

**Primary recommendation:** Use GitHub Actions with setup-node@v4 for CI (npm ci, build, lint, typecheck, test), Husky v9 with lint-staged for pre-commit hooks (format, lint, typecheck, import verification), TypeScript ESLint v8 with strict-type-checked preset, Vitest for integration tests with better-sqlite3 using in-memory databases.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- CI runs on every push and PR
- CI blocks merges on failure (required check)
- CI runs all checks: build, verify exports, lint, typecheck, and integration tests
- Pre-commit hooks auto-install via postinstall (Husky)
- Hooks are blocking — commit fails if checks don't pass
- Hooks run 4 checks: format, lint, typecheck, import verification
- Developers can bypass with `git commit --no-verify` (documented in CONTRIBUTING.md)
- Integration tests follow QA-03 scope: INSERT works, schema initialization succeeds, pragma calls return expected values

### Claude's Discretion
- CI platform choice (GitHub Actions recommended for npm package)
- CI environment (Node versions to test)
- TypeScript strict mode
- ESLint configuration preset vs custom
- Auto-fix behavior in lint hooks
- Prettier vs ESLint for formatting
- Test database: in-memory vs temp file
- MQTT inclusion in integration tests
- Test data cleanup strategy

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QA-01 | CI workflow verifies all exports can be imported from built dist/ | npm pack + import verification pattern; Node.js test runner import verification |
| QA-02 | Pre-commit hooks run: lint, typecheck, import verification | Husky v9, lint-staged, TypeScript ESLint strict-type-checked preset |
| QA-03 | Integration tests verify database operations (INSERT, schema init, pragma) | Vitest with better-sqlite3, in-memory database for isolation |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions | latest (v4 actions) | CI/CD platform | Standard for npm packages, free for public repos, excellent Node.js support |
| actions/checkout@v4 | v4 | Checkout code | Official GitHub action, de facto standard |
| actions/setup-node@v4 | v4 | Setup Node.js | Official action, supports npm caching |
| Husky | ^9.0.0 | Git hooks | Modern standard, ESM support, postinstall auto-setup |
| lint-staged | ^15.0.0 | Run lint on staged files | Efficient pre-commit filtering, wide ecosystem adoption |
| Vitest | ^2.0.0 | Integration tests | Already in project (critical-fixes.test.ts), native ESM, fast |
| TypeScript ESLint | ^8.0.0 | TypeScript linting | Official typescript-eslint, strict-type-checked preset |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eslint | ^9.0.0 | Core ESLint | Required for typescript-eslint |
| eslint-config-prettier | ^9.0.0 | Disable conflicting rules | If using Prettier for formatting |
| prettier | ^3.0.0 | Code formatting | Optional, can use ESLint for formatting |
| @typescript-eslint/eslint-plugin | ^8.0.0 | TypeScript rules | Required for strict-type-checked preset |
| better-sqlite3 | ^11.9.0 | Database for integration tests | Already in project, use in-memory :memory: |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions | GitLab CI, CircleCI | GitHub Actions is free for public repos and integrates natively with required checks |
| Husky | pre-commit (Python), simple-git-hooks | Husky has native npm ecosystem support and postinstall auto-setup |
| Prettier | ESLint formatting, Biome | Prettier is standard but adds a dependency; ESLint alone is simpler |
| Vitest | Node.js test runner (node:test), Jest | Vitest already in project, native ESM support; node:test is built-in but less familiar |

**Installation:**
```bash
# Root devDependencies (add to package.json)
npm install --save-dev husky lint-staged eslint prettier \
  @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  typescript-eslint eslint-config-prettier

# Husky setup (run from root)
npx husky init

# Vitest already installed in packages/coordination
```

## Architecture Patterns

### Recommended Project Structure

```
.github/
  workflows/
    ci.yml                    # GitHub Actions CI workflow
.husky/
  pre-commit                  # Git hook (auto-generated by Husky)
packages/
  coordination/
    src/
      __tests__/
        critical-fixes.test.ts # Existing unit tests
        integration.test.ts    # NEW: Database integration tests (QA-03)
    test/
      # Legacy tests (node:test runner)
scripts/
  verify-exports.mjs          # NEW: Import verification script (QA-01)
.eslintrc.json                # NEW: ESLint configuration (or eslint.config.js)
.prettierrc                   # NEW: Prettier configuration (optional)
package.json                  # Root with lint-staged config
CONTRIBUTING.md               # NEW: Document pre-commit bypass
```

### Pattern 1: GitHub Actions CI Workflow (QA-01)

**What:** CI runs on every push and PR, verifies package builds and exports can be imported.

**When to use:** Every npm package should have CI to catch integration issues before merge.

**Example:**
```yaml
# Source: https://dev.to/hasanulmukit/setting-up-a-modern-web-development-environment-in-2025-3i59
# https://dev.to/pipscript/building-a-secure-cicd-pipeline-for-a-typescript-application-using-github-actions-and-argocd-2142
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run verify-exports  # NEW: Custom script to verify dist imports
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm test --workspace @openclaw-swarm/coordination
```

### Pattern 2: Pre-commit Hooks with Husky (QA-02)

**What:** Auto-installed git hooks that run linting on staged files before commit.

**When to use:** Every project to catch errors locally before pushing.

**Example:**
```json
// package.json (root)
{
  "scripts": {
    "prepare": "husky",
    "format": "prettier --write .",
    "lint": "eslint .",
    "lint:fix": "eslint --fix .",
    "typecheck": "tsc --noEmit",
    "verify-exports": "node scripts/verify-exports.mjs"
  },
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

```bash
# .husky/pre-commit (auto-generated)
npx lint-staged
npm run typecheck
npm run verify-exports
```

### Pattern 3: TypeScript ESLint Strict Configuration

**What:** ESLint with TypeScript support and strict type checking.

**When to use:** All TypeScript projects to catch type errors at lint time.

**Example:**
```json
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": true,
    "tsconfigRootDir": __dirname
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/strict-type-checked",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```

### Pattern 4: Integration Tests with Vitest (QA-03)

**What:** Database integration tests using Vitest and better-sqlite3 in-memory databases.

**When to use:** Test actual database operations (INSERT, schema init, pragma).

**Example:**
```typescript
// packages/coordination/src/__tests__/integration.test.ts
import { describe, it, beforeEach, afterEach } from 'vitest';
import { initializeSchema, validateSchema } from '../state/schema.js';
import { createTaskQueue } from '../state/task-queue.js';
import Database from 'better-sqlite3';

describe('Database Integration (QA-03)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:'); // In-memory for isolation
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize schema successfully', () => {
    initializeSchema(db);
    expect(validateSchema(db)).toBe(true);
  });

  it('should INSERT task without errors', () => {
    initializeSchema(db);
    const queue = createTaskQueue(db);
    const task = queue.createTask({
      status: 'pending',
      priority: 5,
      payload: JSON.stringify({ test: 'data' })
    });
    expect(task.id).toBeDefined();
  });

  it('should return string from pragma with simple option', () => {
    const result = db.pragma('journal_mode = WAL', { simple: true }) as string;
    expect(typeof result).toBe('string');
    expect(result.toLowerCase()).toBe('wal');
  });
});
```

### Anti-Patterns to Avoid

- **Skipping CI on pushes:** CI should run on every push, not just PRs, to catch broken branches early
- **Pre-commit hooks that can be silently bypassed:** Always document --no-verify in CONTRIBUTING.md
- **Linting entire project on pre-commit:** Use lint-staged to only check staged files for speed
- **In-memory databases with persistent state:** Always create new :memory: database in beforeEach
- **Testing exports without building:** Always verify dist/ imports, not src/ imports
- **Blocking MQTT in integration tests:** MQTT requires broker; skip or mock in CI

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git hooks management | Custom pre-commit script | Husky v9 | Handles platform differences, postinstall auto-setup, native ESM |
| Lint staged files only | Custom glob matching | lint-staged | Efficient, parallel execution, community standard |
| Import verification | Custom import script | npm pack + test | Leverages npm's own packaging logic |
| TypeScript linting | Custom AST traversal | TypeScript ESLint | Handles all edge cases, type-aware linting |
| Code formatting | Custom prettier config | Prettier or ESLint | Consistent formatting, auto-fixable |
| Database test isolation | Manual temp file cleanup | Vitest beforeEach/afterEach with :memory: | Automatic cleanup, faster tests |

**Key insight:** Custom pre-commit scripts fail on Windows, don't handle merge commits properly, and require manual installation. Husky handles all these edge cases and is the de facto standard.

## Common Pitfalls

### Pitfall 1: CI Runs on Only PRs, Not Pushes

**What goes wrong:** Broken commits get pushed to main, CI never runs, main branch breaks.

**Why it happens:** GitHub Actions configured with `on: pull_request:` only.

**How to avoid:** Always include both `push:` and `pull_request:` triggers.

**Warning signs:** Merged PRs show "no status checks" on commits.

### Pitfall 2: Pre-commit Hooks Not Auto-Installed

**What goes wrong:** Developers clone repo, commit without hooks, push broken code.

**Why it happens:** Husky not configured with `npm run prepare` or `.husky/` not committed.

**How to avoid:** Add `"prepare": "husky"` to root package.json scripts.

**Warning signs:** Team members report "hooks don't work for me."

### Pitfall 3: Linting Entire Project on Pre-commit

**What goes wrong:** Pre-commit takes 30+ seconds, developers disable it.

**Why it happens:** Direct `npm run lint` in pre-commit hook instead of lint-staged.

**How to avoid:** Use lint-staged to only lint changed files.

**Warning signs:** Pre-commit noticeably slow, commits feel sluggish.

### Pitfall 4: Testing src/ Instead of dist/ Exports

**What goes wrong:** Tests pass but published package has wrong exports.

**Why it happens:** Tests import from `../src/` instead of built `../dist/`.

**How to avoid:** Import verification script should import from dist/ only.

**Warning signs:** Integration tests pass but `npm pack + npm install` fails.

### Pitfall 5: In-memory Databases Reused Between Tests

**What goes wrong:** Tests interfere with each other, flaky failures.

**Why it happens:** Database created in `describe` block instead of `beforeEach`.

**How to avoid:** Always create new `:memory:` database in `beforeEach`, close in `afterEach`.

**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 6: ESLint and Prettier Conflicts

**What goes wrong:** ESLint auto-fix and Prettier format fight, files keep changing.

**Why it happens:** Prettier config not loaded last in ESLint extends array.

**How to avoid:** Add `"prettier"` to end of ESLint extends, or use `eslint-config-prettier`.

**Warning signs:** Running `eslint --fix` then `prettier --write` changes files again.

### Pitfall 7: Forgetting to Cache npm Dependencies in CI

**What goes wrong:** CI takes 5+ minutes, developers skip running it.

**Why it happens:** Not using `actions/setup-node@v4` with `cache: 'npm'`.

**How to avoid:** Always enable caching in GitHub Actions.

**Warning signs:** CI workflow shows "npm ci" taking >2 minutes.

## Code Examples

Verified patterns from official sources:

### Import Verification Script (QA-01)

```javascript
// scripts/verify-exports.mjs
// Source: Based on npm pack testing pattern from
// https://m.blog.csdn.net/gitblog_00448/article/details/154323755

import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

console.log('Verifying package exports...');

// Build first
execSync('npm run build', { stdio: 'inherit' });

// Create tarball
const tarball = execSync('npm pack', { encoding: 'utf-8' }).trim();
const tarballPath = `./${tarball}`;

try {
  // Try importing from the built dist directly
  const testCode = `
    import { initializeSchema, validateSchema } from './packages/coordination/dist/index.js';
    import { MessageBatcher } from './packages/coordination/dist/optimization/index.js';
    console.log('✓ All exports imported successfully');
  `;

  const testFile = `${tmpdir()}/verify-imports.mjs`;
  require('fs').writeFileSync(testFile, testCode);
  execSync(`node ${testFile}`, { stdio: 'inherit' });

  console.log('✓ Export verification passed');
} finally {
  unlinkSync(tarballPath);
}
```

### TypeScript ESLint Strict Config (QA-02)

```javascript
// eslint.config.js
// Source: https://juejin.cn/post/7592518897463820340
// https://blog.csdn.net/gitblog_01019/article/details/151168133

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
];
```

### Database Integration Test (QA-03)

```typescript
// packages/coordination/src/__tests__/integration.test.ts
// Source: Based on Vitest patterns from
// https://vitest.dev/guide/

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema, validateSchema } from '../state/schema.js';
import { createTaskQueue } from '../state/task-queue.js';

describe('Database Integration (QA-03)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize schema and validate successfully', () => {
    initializeSchema(db);
    expect(validateSchema(db)).toBe(true);
  });

  it('should INSERT task with all 15 columns', () => {
    initializeSchema(db);
    const queue = createTaskQueue(db);

    const task = queue.createTask({
      status: 'pending',
      priority: 5,
      assignedAgent: 'test-agent',
      payload: JSON.stringify({ test: 'data' }),
      dependencies: ['task-1', 'task-2'],
      timeoutMs: 30000,
      retryCount: 0,
      maxRetries: 3,
    });

    expect(task.id).toBeDefined();
    expect(task.assignedAgent).toBe('test-agent');
  });

  it('should return string from pragma with simple option', () => {
    const result = db.pragma('journal_mode = WAL', { simple: true }) as string;
    expect(typeof result).toBe('string');
    expect(result.toLowerCase()).toBe('wal');
  });

  it('should return expected value from user_version pragma', () => {
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(typeof version).toBe('number');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Travis CI, CircleCI | GitHub Actions | 2023-2024 | Free for public repos, native integration |
| Husky v4 (legacy) | Husky v9 (ESM) | 2024 | Native ESM support, postinstall setup |
| ESLint + TSLint | TypeScript ESLint only | 2021-2022 | TSLint deprecated, use typescript-eslint |
| .eslintrc.json | eslint.config.js (flat config) | 2024-2025 | Flat config is new standard, simpler |
| `npm install` in CI | `npm ci` | 2019 | Faster, reproducible installs |
| Jest for all tests | Vitest for unit/integration | 2023-2024 | Native ESM, faster, already in project |
| Prettier + ESLint conflicts | eslint-config-prettier | 2020+ | Separates concerns, no conflicts |

**Deprecated/outdated:**
- TSLint: Deprecated in 2019, use TypeScript ESLint
- Husky v4: Legacy config, use Husky v9
- Travis CI: No longer free for open source, use GitHub Actions
- `npm install` in CI: Use `npm ci` for reproducible builds
- `@typescript-eslint/parser` without type-aware linting: Enable `project: true` for strict checking

## Open Questions

1. **MQTT integration test scope**
   - What we know: MQTT requires running broker, tests use mocks (activation.test.ts)
   - What's unclear: Should QA-03 integration tests start actual Mosquitto broker?
   - Recommendation: Skip MQTT in integration tests; requires external dependency, adds complexity. Test MQTT with mocks only.

2. **Test data cleanup for temp file databases**
   - What we know: In-memory `:memory:` databases auto-clean on close
   - What's unclear: If using temp file databases for WAL mode testing, how to clean?
   - Recommendation: Use `:memory:` for all integration tests; WAL mode works in-memory. If temp files needed, use `fs.mkdtemp()` and cleanup in `afterEach`.

3. **Multiple Node version testing in CI**
   - What we know: project requires Node >=22.0.0 (engines field)
   - What's unclear: Should CI test Node 20 and 22, or just 22?
   - Recommendation: Test only Node 22 LTS (current) to speed up CI. Add matrix if compatibility with Node 20 is needed.

## Sources

### Primary (HIGH confidence)
- [GitHub Actions TypeScript CI/CD](https://dev.to/pipscript/building-a-secure-cicd-pipeline-for-a-typescript-application-using-github-actions-and-argocd-2142) - Complete CI workflow with security scanning
- [TypeScript ESLint Strict Config](https://juejin.cn/post/7592518897463820340) - Modern flat config for 2026
- [Husky + lint-staged Integration](https://m.blog.csdn.net/gitblog_00001/article/details/153104202) - Zero-error commit workflow with TypeScript
- [npm pack Testing Pattern](https://m.blog.csdn.net/gitblog_00448/article/details/154323755) - Local package testing before publish
- [Vitest Documentation](https://vitest.dev/guide/) - Official Vitest testing framework docs

### Secondary (MEDIUM confidence)
- [Modern Web Development Environment 2025](https://dev.to/hasanulmukit/setting-up-a-modern-web-development-environment-in-2025-3i59) - Package manager and tooling landscape
- [@antfu/eslint-config GitHub Actions](https://m.blog.csdn.net/gitblog_00283/article/details/152157370) - ESLint preset with CI integration
- [Prettier + ESLint Integration](https://m.php.cn/faq/2030253.html) - VSCode settings for auto-format on save
- [ESLint Config Tutorial](https://blog.csdn.net/gitblog_01019/article/details/151168133) - TypeScript ESLint configuration template
- [React Redux TypeScript CI](https://m.blog.csdn.net/gitblog_00825/article/details/153166150) - Multi-step testing workflow

### Tertiary (LOW confidence)
- [Slint Code Reviews](https://m.blog.csdn.net/gitblog_00729/article/details/151235667) - Mentions linting tools but unrelated to Prettier
- [SQLite Testing Methods](https://m.blog.csdn.net/qq_33565390/article/details/146582188) - General SQLite testing, Chinese translation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are well-established, versions verified via web search
- Architecture: HIGH - Patterns verified from multiple official sources (GitHub, ESLint, Vitest)
- Pitfalls: HIGH - Based on documented best practices and common failure modes from web search

**Research date:** 2026-02-24
**Valid until:** 2026-05-24 (90 days - fast-moving ecosystem, versions may update)

---
*Research complete. Planner can now create detailed PLAN.md files.*
