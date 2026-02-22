/**
 * Message Codec with JSON/MessagePack Selection
 *
 * Per HARD-05: Message payloads over 1KB use MessagePack for efficiency.
 * Per RESEARCH.md: MessagePack is 3.5x faster than JSON, 15-50% smaller.
 *
 * This codec automatically selects the best serialization format based on
 * payload size, encoding envelope metadata to indicate which format was used.
 */
import type { MessageEnvelope } from './message.js';
/**
 * Determines if MessagePack should be used for payload.
 *
 * Per HARD-05: Returns true if serialized size > 1024 bytes (1KB threshold).
 * Implements check by trying JSON.stringify and checking length.
 *
 * @param payload - Payload to check
 * @returns true if MessagePack should be used
 */
export declare function shouldUseMessagePack(payload: unknown): boolean;
/**
 * Encodes a message envelope for transmission.
 *
 * Checks if payload exceeds 1KB threshold:
 * - If true: encodes with MessagePack, marks codec = 'msgpack'
 * - If false: uses JSON.stringify, marks codec = 'json'
 *
 * Returns Buffer containing the full serialized envelope.
 *
 * Per HARD-05: MessagePack used for efficiency on large payloads.
 *
 * @param envelope - Message envelope to encode
 * @returns Buffer with encoded envelope
 */
export declare function encodeMessage(envelope: MessageEnvelope): Buffer;
/**
 * Decodes a message buffer received from MQTT.
 *
 * Parses envelope metadata to determine serialization format:
 * - If codec === 'msgpack': decodes with msgpackr
 * - If codec === 'json': parses with JSON.parse
 *
 * Handles legacy messages without codec field (assumes JSON).
 *
 * @param buffer - Buffer containing encoded message
 * @returns Decoded message envelope
 */
export declare function decodeMessage(buffer: Buffer): MessageEnvelope;
/**
 * Calculates size of message in bytes.
 *
 * Utility function for monitoring message sizes.
 *
 * @param envelope - Message envelope
 * @returns Size in bytes
 */
export declare function getMessageSize(envelope: MessageEnvelope): number;
//# sourceMappingURL=codec.d.ts.map