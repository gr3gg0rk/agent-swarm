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
 * Get or create default logger instance.
 *
 * @param agentId - Agent ID for log attribution
 * @param minLevel - Minimum log level (default: info)
 * @returns Logger instance
 */
export declare function getLogger(agentId?: string, minLevel?: LogLevel): Logger;
/**
 * Convenience function to log error with full context.
 *
 * Per ERRO-03: Captures task ID, agent, timestamp, stack trace.
 *
 * @param message - Error message
 * @param context - Error context
 */
export declare function logError(message: string, context: ErrorContext): void;
/**
 * Convenience function to log info message.
 *
 * @param message - Info message
 * @param context - Optional context
 */
export declare function logInfo(message: string, context?: Record<string, unknown>): void;
/**
 * Convenience function to log debug message.
 *
 * @param message - Debug message
 * @param context - Optional context
 */
export declare function logDebug(message: string, context?: Record<string, unknown>): void;
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
export declare function createErrorContext(error: Error | unknown, agentId: string, messageId: string, taskId?: string, additionalContext?: Record<string, unknown>): ErrorContext;
export {};
//# sourceMappingURL=logger.d.ts.map