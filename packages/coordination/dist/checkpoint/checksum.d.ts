/**
 * Checksum Utilities for Checkpoint Corruption Detection
 *
 * Provides CRC32 checksum computation and validation for local checkpoint files.
 * Checksums are computed before write and validated on load to detect corruption early.
 *
 * Per 08-CONTEXT.md: Validate CRC32 on local files only (SQLite is less prone to corruption).
 * Per 08-RESEARCH.md: Use crc-32 library for lightweight C-optimized implementation.
 *
 * Note: Checksums are for local file corruption detection only. SQLite has built-in integrity.
 */
/**
 * Computes CRC32 checksum of data.
 *
 * @param data - Input data as string or Buffer
 * @returns Checksum as lowercase hex string
 */
export declare function computeChecksum(data: string | Buffer): string;
/**
 * Validates data against expected CRC32 checksum.
 *
 * @param data - Input data to validate
 * @param expectedChecksum - Expected checksum (hex string, case-insensitive)
 * @returns True if checksums match, false otherwise
 */
export declare function validateChecksum(data: string | Buffer, expectedChecksum: string): boolean;
//# sourceMappingURL=checksum.d.ts.map