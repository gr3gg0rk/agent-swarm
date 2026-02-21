/**
 * Structured Error Logging with Full Context
 *
 * Per ERRO-03: All errors logged with full context (task ID, agent, timestamp, stack trace).
 * Per RESEARCH.md Pitfall 6: Inadequate error context prevents debugging distributed issues.
 *
 * Structured JSON logging enables:
 * - Parseable logs for analysis tools
 * - Distributed tracing with correlation IDs
 * - Full context capture for debugging
 */

/**
 * Error context information for structured logging.
 *
 * Per ERRO-03: Captures all required fields for debugging distributed issues.
 */
export interface ErrorContext {
  /** Optional task ID for correlation */
  taskId?: string;

  /** Agent ID that encountered the error */
  agentId: string;

  /** Message ID for tracing */
  messageId: string;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Error details */
  error: {
    /** Error message */
    message: string;
    /** Optional error code */
    code?: string;
    /** Stack trace if available */
    stack?: string;
  };

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Log level for filtering.
 */
type LogLevel = 'error' | 'info' | 'debug';

/**
 * Logger interface for structured error logging.
 */
export interface Logger {
  /** Log error with full context (ERRO-03) */
  error(message: string, context: ErrorContext): void;

  /** Log info message with optional context */
  info(message: string, context?: Record<string, unknown>): void;

  /** Log debug message with optional context */
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Structured logger implementation.
 *
 * Uses console methods with JSON formatting for parseable output.
 * Includes stack traces, timestamps, and all context fields per ERRO-03.
 *
 * Per plan specification: DO NOT use winston (adds dependency,
 * console with JSON format sufficient).
 */
class StructuredLogger implements Logger {
  private readonly agentId: string;
  private readonly minLevel: LogLevel;

  constructor(agentId: string, minLevel: LogLevel = 'info') {
    this.agentId = agentId;
    this.minLevel = minLevel;
  }

  /**
   * Log error with full context.
   *
   * Per ERRO-03: Includes task ID, agent, timestamp, stack trace.
   *
   * @param message - Error message
   * @param context - Error context with all required fields
   */
  error(message: string, context: ErrorContext): void {
    const logEntry = {
      level: 'error' as const,
      message,
      agentId: context.agentId,
      taskId: context.taskId,
      messageId: context.messageId,
      timestamp: context.timestamp || new Date().toISOString(),
      error: {
        message: context.error.message,
        code: context.error.code,
        stack: context.error.stack,
      },
      context: context.context,
    };

    console.error(JSON.stringify(logEntry));
  }

  /**
   * Log info message with optional context.
   *
   * @param message - Info message
   * @param context - Optional context data
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) {
      return;
    }

    const logEntry = {
      level: 'info' as const,
      message,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      context,
    };

    console.info(JSON.stringify(logEntry));
  }

  /**
   * Log debug message with optional context.
   *
   * @param message - Debug message
   * @param context - Optional context data
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) {
      return;
    }

    const logEntry = {
      level: 'debug' as const,
      message,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      context,
    };

    console.debug(JSON.stringify(logEntry));
  }

  /**
   * Check if message should be logged based on level.
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'error'];
    const currentLevelIndex = levels.indexOf(this.minLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }
}

/**
 * Default logger instance.
 * Agent ID is placeholder - should be configured per agent.
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create default logger instance.
 *
 * @param agentId - Agent ID for log attribution
 * @param minLevel - Minimum log level (default: info)
 * @returns Logger instance
 */
export function getLogger(agentId?: string, minLevel?: LogLevel): Logger {
  if (!defaultLogger || agentId) {
    defaultLogger = new StructuredLogger(
      agentId || 'unknown-agent',
      minLevel || 'info'
    );
  }
  return defaultLogger;
}

/**
 * Convenience function to log error with full context.
 *
 * Per ERRO-03: Captures task ID, agent, timestamp, stack trace.
 *
 * @param message - Error message
 * @param context - Error context
 */
export function logError(message: string, context: ErrorContext): void {
  getLogger().error(message, context);
}

/**
 * Convenience function to log info message.
 *
 * @param message - Info message
 * @param context - Optional context
 */
export function logInfo(message: string, context?: Record<string, unknown>): void {
  getLogger().info(message, context);
}

/**
 * Convenience function to log debug message.
 *
 * @param message - Debug message
 * @param context - Optional context
 */
export function logDebug(message: string, context?: Record<string, unknown>): void {
  getLogger().debug(message, context);
}

/**
 * Create error context from Error object.
 *
 * Utility function to build ErrorContext from caught errors.
 *
 * @param error - Caught error
 * @param agentId - Agent ID
 * @param messageId - Message ID
 * @param taskId - Optional task ID
 * @param additionalContext - Additional context data
 * @returns ErrorContext for logging
 */
export function createErrorContext(
  error: Error | unknown,
  agentId: string,
  messageId: string,
  taskId?: string,
  additionalContext?: Record<string, unknown>
): ErrorContext {
  const isError = error instanceof Error;

  return {
    taskId,
    agentId,
    messageId,
    timestamp: new Date().toISOString(),
    error: {
      message: isError ? error.message : String(error),
      code: isError && 'code' in error ? String(error.code) : undefined,
      stack: isError ? error.stack : undefined,
    },
    context: additionalContext,
  };
}
