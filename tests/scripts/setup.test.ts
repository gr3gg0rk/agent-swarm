import { beforeAll, afterEach, vi, describe, it, expect } from 'vitest';

/**
 * Global test setup for script testing
 *
 * This file provides common test infrastructure for testing Node.js ESM scripts.
 * It silences console output during tests and provides mock utilities.
 */

// Silence console output during tests unless explicitly needed
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

/**
 * Mock MQTT broker connection
 */
export const mockBroker = {
  connect: vi.fn().mockResolvedValue({
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }),
};

/**
 * Mock SQLite database connection
 */
export const mockDatabase = {
  close: vi.fn(),
  prepare: vi.fn(),
  exec: vi.fn(),
};

/**
 * Mock HTTP server
 */
export const mockServer = {
  close: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(),
  on: vi.fn(),
};

/**
 * Create mock agent configuration
 *
 * @param overrides - Optional config overrides
 * @returns Mock agent configuration object
 */
export function createMockConfig(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'test-agent',
    role: 'worker',
    brokerUrl: 'mqtt://localhost:1883',
    capabilities: ['test'],
    heartbeatInterval: 30000,
    ...overrides,
  };
}

describe('Test Framework Setup', () => {
  it('should provide mock utilities for script testing', () => {
    expect(mockBroker.connect).toBeDefined();
    expect(mockDatabase.close).toBeDefined();
    expect(mockServer.close).toBeDefined();
    expect(createMockConfig).toBeDefined();
  });

  it('should create valid mock config', () => {
    const config = createMockConfig();
    expect(config).toHaveProperty('agentId');
    expect(config).toHaveProperty('brokerUrl');
    expect(config).toHaveProperty('capabilities');
  });
});
