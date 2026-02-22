/**
 * Task Delegation Types
 *
 * Defines core types for task delegation, results, progress tracking,
 * and dependency management. Extends the existing TaskQueue schema
 * with fields for dependency tracking, timeout monitoring, and retry logic.
 *
 * Per 03-RESEARCH.md Pattern 1: Extended Task Schema with Dependencies.
 * Per CONTEXT.md decisions: Timeout with exponential backoff, DAG-based dependencies.
 */
/**
 * Default role hierarchy levels.
 *
 * Orchestrator at top (100) can do anything.
 * Senior roles (60) can do standard roles (50).
 * Worker at bottom (30) is most restricted.
 */
export const DEFAULT_ROLE_HIERARCHY = {
    'orchestrator': 100,
    'senior-builder': 60,
    'builder': 50,
    'debugger': 50,
    'tester': 40,
    'worker': 30,
};
/**
 * Default timeout in milliseconds (2 minutes per TASK-04).
 */
export const DEFAULT_TIMEOUT_MS = 120000;
/**
 * Default retry limit (ERRO-01).
 */
export const DEFAULT_MAX_RETRIES = 3;
//# sourceMappingURL=types.js.map