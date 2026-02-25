// scripts/verify-exports.mjs
// Source: 16-RESEARCH.md - npm pack testing pattern for import verification

import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

console.log('Verifying package exports from built dist/...');

// Check if dist exists
const distPath = join(process.cwd(), 'packages/coordination/dist');
if (!existsSync(distPath)) {
  console.error('ERROR: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Test imports from dist/ only (not src/ - addresses Pitfall 4)
// Using actual exports from the coordination package based on source analysis
const testImports = `
  // Test all main exports from coordination package
  import { initializeSchema, validateSchema } from './packages/coordination/dist/state/schema.js';
  import { createDatabase } from './packages/coordination/dist/state/database.js';
  import { createTaskQueue } from './packages/coordination/dist/state/task-queue.js';
  import { MessageBatcher, ConnectionPoolManager, loadOptimizationConfig } from './packages/coordination/dist/optimization/index.js';
  import { encodeMessage, decodeMessage } from './packages/coordination/dist/communication/codec.js';
  import { MqttClient } from './packages/coordination/dist/communication/mqtt.js';
  import { CheckpointManager, LocalFileStore, SQLiteSync, ResumeLogic } from './packages/coordination/dist/checkpoint/index.js';
  import { TaskDelegator } from './packages/coordination/dist/delegation/index.js';

  console.log('All main exports imported successfully from dist/');
`;

// Write test file to temp location
const testFile = join(process.cwd(), 'dist-import-test.mjs');
import { writeFileSync } from 'node:fs';
writeFileSync(testFile, testImports);

try {
  // Run test import from dist
  execSync(`node ${testFile}`, { stdio: 'inherit' });
  console.log('Export verification passed');
} catch (error) {
  console.error('Export verification FAILED');
  process.exit(1);
} finally {
  // Cleanup test file
  if (existsSync(testFile)) {
    unlinkSync(testFile);
  }
}
