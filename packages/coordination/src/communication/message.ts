/**
 * Message Envelope Types
 *
 * Per RESEARCH.md Pattern 1: Standard message wrapper for inter-agent communication.
 * Enables reliable request/response and deduplication with idempotency keys (COMM-04).
 */

/**
 * Message type determines routing and processing behavior.
 */
export type MessageType =
  | 'task'
  | 'result'
  | 'heartbeat'
  | 'error'
  | 'discovery'
  | 'status'
  | 'progress'
  | 'cancel'
  | 'guidance_request'
  | 'guidance_response'
  | 'task_failed'
  | 'load_metrics'
  | 'task_rejected'
  | 'context_ref';

/**
 * Task delegation message types for task execution flow.
 * These are subtypes of MessageType for task-related messages.
 */
export type TaskMessageType = 'task' | 'result' | 'progress' | 'cancel';

/**
 * Standard message envelope for all inter-agent communication.
 *
 * Per RESEARCH.md Pattern 1:
 * - messageId: Unique message identifier
 * - idempotencyKey: Deduplicates re-deliveries (COMM-04)
 * - correlationId: Links response to request
 * - from/to: Agent IDs for routing
 * - qos: Override default QoS (0 for heartbeats COMM-07, 1 for tasks COMM-06)
 */
export interface MessageEnvelope {
  /** Unique message identifier (UUID) */
  messageId: string;

  /** Deduplicates re-deliveries (UUID) - COMM-04 */
  idempotencyKey: string;

  /** Links response to request (optional, for request-reply) */
  correlationId?: string;

  /** Sender agent ID */
  from: string;

  /** Target agent ID (undefined for broadcast) */
  to?: string;

  /** Message type for routing */
  type: MessageType;

  /** Unix timestamp (milliseconds) */
  timestamp: number;

  /** Message payload (MessagePack or JSON) */
  payload: unknown;

  /** Override default QoS level */
  qos?: 0 | 1;

  /** Set retain flag for discovery/heartbeat messages */
  retain?: boolean;
}
