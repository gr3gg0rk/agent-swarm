/**
 * Type declarations for msgpackr 0.6.0
 *
 * msgpackr exports pack/unpack functions but its package.json lacks
 * "types" in the exports field, causing TypeScript Node16 module resolution to fail.
 * This declaration file provides the missing type information.
 */

declare module 'msgpackr' {
  /**
   * Encodes a JavaScript value to MessagePack format.
   * @param value - Any JavaScript value to encode
   * @returns Buffer containing MessagePack-encoded data
   */
  export function pack(value: any): Buffer;

  /**
   * Decodes MessagePack data to JavaScript values.
   * @param messagePack - Buffer containing MessagePack-encoded data
   * @returns Decoded JavaScript value
   */
  export function unpack(messagePack: Buffer): any;

  /**
   * Alias for pack() function
   */
  export function encode(value: any): Buffer;

  /**
   * Alias for unpack() function
   */
  export function decode(messagePack: Buffer): any;
}
