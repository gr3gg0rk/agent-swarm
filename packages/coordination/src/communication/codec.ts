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
// @ts-ignore - msgpackr types exist but package.json exports are misconfigured
import { MessagePack } from 'msgpackr';

/**
 * Codec type indicator in message envelope.
 */
type CodecType = 'json' | 'msgpack';

/**
 * Extended message envelope with codec metadata.
 * Used internally for encoding/decoding.
 */
interface CodecEnvelope extends MessageEnvelope {
  /** Serialization format used for payload */
  codec?: CodecType;
}

/**
 * Determines if MessagePack should be used for payload.
 *
 * Per HARD-05: Returns true if serialized size > 1024 bytes (1KB threshold).
 * Implements check by trying JSON.stringify and checking length.
 *
 * @param payload - Payload to check
 * @returns true if MessagePack should be used
 */
export function shouldUseMessagePack(payload: unknown): boolean {
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 1024;
  } catch {
    // If serialization fails, default to MessagePack (more permissive)
    return true;
  }
}

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
export function encodeMessage(envelope: MessageEnvelope): Buffer {
  const codecEnvelope: CodecEnvelope = { ...envelope };

  // Determine if MessagePack should be used
  if (shouldUseMessagePack(envelope.payload)) {
    codecEnvelope.codec = 'msgpack';
    // Encode full envelope with MessagePack
    return Buffer.from(MessagePack.encode(codecEnvelope));
  } else {
    codecEnvelope.codec = 'json';
    // Encode full envelope as JSON
    return Buffer.from(JSON.stringify(codecEnvelope));
  }
}

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
export function decodeMessage(buffer: Buffer): MessageEnvelope {
  try {
    // First decode as JSON to check for codec field
    const asJson = JSON.parse(buffer.toString()) as CodecEnvelope;

    if (asJson.codec === 'msgpack') {
      // Re-decode with MessagePack
      const decoded = MessagePack.decode(buffer) as CodecEnvelope;
      // Remove codec field before returning (it's metadata, not part of envelope)
      const { codec, ...envelope } = decoded;
      return envelope;
    } else {
      // JSON encoded (or legacy without codec field)
      const { codec, ...envelope } = asJson;
      return envelope;
    }
  } catch (error) {
    // JSON parse failed, try MessagePack
    try {
      const decoded = MessagePack.decode(buffer) as CodecEnvelope;
      const { codec, ...envelope } = decoded;
      return envelope;
    } catch (msgpackError) {
      throw new Error(
        `Failed to decode message: ${(error as Error).message}. MessagePack also failed: ${(msgpackError as Error).message}`
      );
    }
  }
}

/**
 * Calculates size of message in bytes.
 *
 * Utility function for monitoring message sizes.
 *
 * @param envelope - Message envelope
 * @returns Size in bytes
 */
export function getMessageSize(envelope: MessageEnvelope): number {
  return encodeMessage(envelope).length;
}
