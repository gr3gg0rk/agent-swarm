---
phase: 03-task-delegation
plan: 01
title: "Task Delegation Infrastructure"
oneLiner: "Role-based task routing, DAG-based dependency scheduler with Kahn's algorithm, and timeout monitoring with exponential backoff"
subsystem: "task-delegation"
tags: ["task-routing", "dependency-tracking", "timeout-monitoring", "exponential-backoff", "dag-scheduling"]
status: "complete"
completedDate: "2026-02-21"
executionDuration: 192

# Dependency Graph
provides:
  - id: "delegation-types"
    description: "Task, TaskResult, TaskProgress, TaskCommandPayload types with dependency and retry fields"
  - id: "role-based-router"
    description: "TaskRouter class with hierarchical fallback (senior-builder can do builder tasks)"
  - id: "dependency-scheduler"
    description: "DependencyScheduler with Kahn's algorithm for cycle detection"
  - id: "timeout-monitor"
    description: "TimeoutMonitor with exponential backoff and error classification"
  - id: "task-topics"
    description: "MQTT topic factory functions for task command, result, progress, cancel messages"

requires:
  - phase: "02-shared-state-lifecycle"
    provides: "TaskQueue with better-sqlite3 database"
  - phase: "01-communication-discovery"
    provides: "MQTT message bus and topic hierarchy"

affects: []

# Tech Stack
added:
  - library: "none"
    version: "N/A"
    purpose: "Using existing stack (MQTT.js, better-sqlite3, uuid)"

patterns:
  - "Extended Task schema with dependency and timeout fields"
  - "Role-based routing with hierarchical fallback"
  - "DAG-based dependency scheduling using Kahn's algorithm"
  - "Exponential backoff with jitter for timeout retries"
  - "Error classification: transient vs permanent"
  - "Prepared statements for database operations"
  - "Factory functions for module creation"

# Key Files
created:
  - path: "packages/coordination/src/delegation/types.ts"
    lines: 157
    description: "Task, TaskResult, TaskProgress, TaskCommandPayload types with DEFAULT_ROLE_HIERARCHY constant"
  - path: "packages/coordination/src/delegation/router.ts"
    lines: 175
    description: "TaskRouter class with findAgentForTask, getRoleLevel, canDoTask, filterByRole, filterByCapability, filterByCapacity"
  - path: "packages/coordination/src/delegation/dependencies.ts"
    lines: 335
    description: "DependencyScheduler with validateDependencies, getReadyTasks, hasCircularDependency, getExecutionOrder"
  - path: "packages/coordination/src/delegation/timeout.ts"
    lines: 304
    description: "TimeoutMonitor with startTimeout, cancelTimeout, classifyError, calculateBackoffDelay"
  - path: "packages/coordination/src/delegation/index.ts"
    lines: 61
    description: "Delegation module public API exports"

modified:
  - path: "packages/coordination/src/state/task-queue.ts"
    changes: "Extended to import Task from delegation/types.ts, added updateTaskRetry and updateTaskProgress methods, updated prepared statements for new columns"
  - path: "packages/coordination/src/state/schema.ts"
    changes: "Added ALTER TABLE statements for new columns: dependencies, timeout_ms, retry_count, max_retries, last_progress_at, result_payload, error_type"
  - path: "packages/coordination/src/communication/topics.ts"
    changes: "Added taskCommand, taskResult, taskProgress, taskCancel factory functions and TaskDelegationPatterns"
  - path: "packages/coordination/src/index.ts"
    changes: "Added re-export for delegation module"

# Decisions Made
decisions:
  - "Excluded Task and TaskCreate from delegation/index.ts exports to avoid naming conflicts with state module (Task already exported there)"
  - "Used ALTER TABLE with try-catch for schema migration to support backward compatibility with existing databases"
  - "Serialize dependencies array to JSON string for database storage, parse on read"
  - "Reject circular dependencies at task creation time using Kahn's algorithm (O(V+E) complexity)"
  - "Default to 'transient' error classification for unknown errors (fail open for retry)"
  - "Cap exponential backoff delay at 30 seconds per AWS guidance"

# Deviations from Plan
deviations:

None - plan executed exactly as written.

# Verification Results
verification:
  build: "PASS - TypeScript compilation successful with no errors"
  types: "PASS - Task, TaskResult, TaskProgress, TaskCommandPayload types defined in types.ts"
  taskQueue: "PASS - Extended Task schema with dependencies, timeoutMs, maxRetries fields in task-queue.ts"
  topics: "PASS - taskCommand, taskResult, taskProgress, taskCancel factory functions in topics.ts"
  router: "PASS - TaskRouter class with findAgentForTask, ROLE_HIERARCHY in router.ts"
  scheduler: "PASS - DependencyScheduler with validateDependencies, getReadyTasks in dependencies.ts"
  timeout: "PASS - TimeoutMonitor with exponential backoff, classifyError in timeout.ts"
  exports: "PASS - Delegation module exported from coordination package index.ts"

# Metrics
metrics:
  duration: 192
  tasksCompleted: 5
  filesCreated: 5
  filesModified: 4
  totalLinesAdded: 1207
  commits: 5
  artifacts:
    - "Extended Task interface with 7 new fields: dependencies, timeoutMs, retryCount, maxRetries, lastProgressAt, resultPayload, errorType"
    - "DEFAULT_ROLE_HIERARCHY with 6 roles: orchestrator (100), senior-builder (60), builder (50), debugger (50), tester (40), worker (30)"
    - "TaskRouter with 6 public methods for role-based agent selection"
    - "DependencyScheduler using Kahn's algorithm for O(V+E) cycle detection"
    - "TimeoutMonitor with exponential backoff: 2^n * 1000ms + jitter (0-1000ms), capped at 30s"
    - "classifyError function with transient/permanent pattern matching"
    - "4 task delegation topic factory functions"
    - "TaskDelegationPatterns subscription patterns"

# Success Criteria Validation
successCriteria:
  - criterion: "Minerva can import task delegation types and classes from coordination package"
    status: "PASS"
    evidence: "import { TaskRouter, DependencyScheduler, TimeoutMonitor, classifyError } from '@openclaw-swarm/coordination'"
  - criterion: "TaskRouter can match agents by role with hierarchical fallback (senior-builder does builder work)"
    status: "PASS"
    evidence: "findAgentForTask filters agents by role level >= required level, sorts by highest level then least loaded"
  - criterion: "DependencyScheduler detects circular dependencies at task creation time using Kahn's algorithm"
    status: "PASS"
    evidence: "validateDependencies builds DAG, runs Kahn's topological sort, throws if visited < total tasks"
  - criterion: "TimeoutMonitor implements exponential backoff with jitter capped at 30 seconds"
    status: "PASS"
    evidence: "startTimeout calculates baseDelay = 2^retryCount * 1000, adds random jitter 0-1000ms, caps at maxDelayMs (30000)"
  - criterion: "classifyError distinguishes transient (retryable) from permanent (abort) errors based on error message patterns"
    status: "PASS"
    evidence: "transient patterns: timeout, econnrefused, enotfound; permanent patterns: einvalid, epermission, validation; defaults to transient"
  - criterion: "TaskQueue schema extended with dependencies, timeout, retry, and progress fields"
    status: "PASS"
    evidence: "schema.ts uses ALTER TABLE to add: dependencies (TEXT), timeout_ms (INTEGER), retry_count (INTEGER), max_retries (INTEGER), last_progress_at (INTEGER), result_payload (TEXT), error_type (TEXT)"
  - criterion: "Topic factory functions exist for task command, result, progress, and cancel messages"
    status: "PASS"
    evidence: "topics.ts has taskCommand(agentId), taskResult(agentId), taskProgress(agentId), taskCancel(agentId) functions"

# Commits
commits:
  - hash: "efad436"
    message: "feat(03-01): create task delegation types and extend TaskQueue schema"
    timestamp: "2026-02-21T22:28:21Z"
  - hash: "fa9685f"
    message: "feat(03-01): implement role-based router with hierarchical fallback"
    timestamp: "2026-02-21T22:28:40Z"
  - hash: "afddc87"
    message: "feat(03-01): implement DAG-based dependency scheduler with cycle detection"
    timestamp: "2026-02-21T22:29:03Z"
  - hash: "f03e20e"
    message: "feat(03-01): implement timeout monitor with exponential backoff and error classification"
    timestamp: "2026-02-21T22:29:25Z"
  - hash: "1753e9f"
    message: "feat(03-01): create delegation module index and export from coordination package"
    timestamp: "2026-02-21T22:29:45Z"

---

# Phase 3 Plan 01: Task Delegation Infrastructure - Summary

## Overview

Implemented the core task delegation infrastructure enabling Minerva to assign tasks to agents by ID or role, with DAG-based dependency tracking using Kahn's algorithm, role-based routing with hierarchical fallback, and timeout monitoring with exponential backoff. The solution extends the existing TaskQueue schema with dependency and retry fields, creates a TaskRouter for intelligent agent selection, implements DependencyScheduler for cycle detection, and provides TimeoutMonitor with error classification.

## Key Deliverables

1. **Task Types** (`types.ts`): Extended Task interface with 7 new fields (dependencies, timeoutMs, retryCount, maxRetries, lastProgressAt, resultPayload, errorType), TaskResult, TaskProgress, TaskCommandPayload, DEFAULT_ROLE_HIERARCHY with 6 roles

2. **Role-Based Router** (`router.ts`): TaskRouter class with findAgentForTask for hierarchical fallback, helper methods for filtering by role/capability/capacity

3. **Dependency Scheduler** (`dependencies.ts`): DependencyScheduler using Kahn's algorithm for O(V+E) cycle detection, validateDependencies rejects circular dependencies at creation time, getReadyTasks returns executable tasks

4. **Timeout Monitor** (`timeout.ts`): TimeoutMonitor with exponential backoff (2^n * 1000ms + jitter, capped at 30s), classifyError for transient vs permanent errors

5. **Schema Migration** (`schema.ts`, `task-queue.ts`): ALTER TABLE for backward compatibility, new prepared statements, updateTaskRetry and updateTaskProgress methods

## Technical Highlights

- **Performance**: Kahn's algorithm O(V+E) for cycle detection, prepared statements for database operations
- **Reliability**: Reject circular dependencies at creation time (prevents deadlocks), exponential backoff prevents thundering herd
- **Maintainability**: Factory functions for module creation, comprehensive JSDoc documentation
- **Compatibility**: ALTER TABLE with try-catch for existing database migration

## Requirements Satisfied

- TASK-01: Minerva can delegate a task to a specific agent by agent ID
- TASK-02: Minerva can delegate a task to any agent with a specific role
- TASK-04: Tasks have explicit timeout values (default 2 minutes)
- TASK-06: Task dependencies are tracked (DAG-based scheduling)
- ERRO-01: Failed tasks automatically retried with exponential backoff
- ERRO-02: Errors classified as retryable (transient) vs abort (permanent)

---

*Plan completed: 2026-02-21*
*Execution time: 192 seconds*
*Phase: 03-task-delegation*
