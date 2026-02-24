/**
 * Environment validation utilities
 */

import { $ } from 'zx';
import os from 'node:os';

export async function checkNodeVersion() {
  const output = await $`node --version`.quiet();
  const version = output.stdout.trim().replace('v', '');
  const major = parseInt(version.split('.')[0]);

  if (major < 22) {
    return {
      pass: false,
      message: `Node.js ${version} (requires >=22.0.0)`,
      fix: 'Upgrade Node.js to version 22 or later'
    };
  }

  return {
    pass: true,
    message: `Node.js ${version}`
  };
}

export async function checkWorkspaces() {
  try {
    // Check if workspace symlink exists
    const fs = await import('node:fs/promises');
    const symlinkPath = 'node_modules/@openclaw-swarm/coordination';

    try {
      await fs.access(symlinkPath);
      const stats = await fs.lstat(symlinkPath);
      if (stats.isSymbolicLink()) {
        return {
          pass: true,
          message: 'All packages linked'
        };
      }
    } catch {
      // Symlink doesn't exist
    }

    return {
      pass: false,
      message: 'Package links not found',
      fix: 'Run npm install to create workspace symlinks'
    };
  } catch (error) {
    return {
      pass: false,
      message: 'Could not verify workspaces',
      fix: 'Run npm install'
    };
  }
}

export async function checkDatabase() {
  try {
    // Try to import better-sqlite3
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(':memory:');

    // Test query
    const result = db.prepare('SELECT 1 AS test').get();
    db.close();

    if (result && result.test === 1) {
      return {
        pass: true,
        message: 'Accessible'
      };
    }

    return {
      pass: false,
      message: 'Database query failed',
      fix: 'Install better-sqlite3: npm install better-sqlite3'
    };
  } catch (error) {
    return {
      pass: false,
      message: error instanceof Error ? error.message : 'Database error',
      fix: 'Install better-sqlite3: npm install better-sqlite3'
    };
  }
}
