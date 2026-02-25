# Contributing to OpenClaw Swarm

Thank you for your interest in contributing! This document covers the development workflow.

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Commit your changes (pre-commit hooks will run automatically)
5. Push to your fork: `git push origin feature/my-feature`
6. Open a pull request

## Pre-commit Hooks

This project uses Husky for git hooks and lint-staged for efficient pre-commit checks. When you run `npm install`, the hooks are automatically configured.

### What Gets Checked

On every commit, the following checks run:
- **lint-staged**: ESLint and Prettier on changed TypeScript/JavaScript files
- **typecheck**: TypeScript type checking via `tsc --noEmit`
- **verify-exports**: Verifies all exports can be imported from built dist/

### Bypassing Pre-commit Hooks (Emergency Only)

If you need to bypass pre-commit hooks (e.g., during a rebase or emergency fix):

```bash
git commit --no-verify -m "Your commit message"
```

**Warning**: Use `--no-verify` sparingly. Bypassed commits may contain issues that CI will catch.

### Fixing Pre-commit Failures

If a pre-commit check fails:

1. **Lint/Format issues**: Run `npm run lint:fix` to auto-fix most issues
2. **Type errors**: Check the TypeScript error output and fix the type issues
3. **Export errors**: Run `npm run build && npm run verify-exports` to diagnose

## Running Tests

- All tests: `npm test`
- Coordination package tests: `npm test --workspace @openclaw-swarm/coordination`
- Integration tests only: `npm run test:integration --workspace @openclaw-swarm/coordination`

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- No `any` types (enforced by ESLint)
- Use `undefined` instead of `null` (consistency with existing codebase)

## CI/CD

All pull requests must pass CI checks before merging. CI runs:
- Build verification
- Export verification (imports from dist/)
- Linting
- Type checking
- All tests

See .github/workflows/ci.yml for details.
