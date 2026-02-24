#!/usr/bin/env node
/**
 * OpenClaw Swarm Setup Script
 *
 * Validates environment and initializes database.
 * Per 13-CONTEXT.md: Structured table output, fail-fast on errors, non-blocking warnings.
 */

import { $ } from 'zx';
import chalk from 'chalk';
import Table from 'cli-table3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const utilsPath = path.join(__dirname, 'utils');

$.verbose = false;

// Import utility functions dynamically
const envCheckPath = path.join(utilsPath, 'env-check.mjs');
const mqttCheckPath = path.join(utilsPath, 'mqtt-check.mjs');

// Create table for output
const table = new Table({
  head: [chalk.cyan('Check'), chalk.cyan('Status'), chalk.cyan('Details')],
  style: { head: [], border: ['grey'] }
});

async function runSetup() {
  console.log(chalk.bold('\n=== OpenClaw Swarm Setup ===\n'));

  // Import utility functions
  const { checkNodeVersion, checkWorkspaces, checkDatabase } = await import(envCheckPath);
  const { checkMosquittoPersistence } = await import(mqttCheckPath);

  // Check 1: Node.js version
  const nodeCheck = await checkNodeVersion();
  table.push([
    'Node.js version',
    nodeCheck.pass ? chalk.green('✓') : chalk.red('✗'),
    nodeCheck.message
  ]);
  if (!nodeCheck.pass) {
    console.log(table.toString());
    console.log(chalk.red('\nSetup failed! Fix: ' + nodeCheck.fix));
    process.exit(1);
  }

  // Check 2: Workspace links
  const workspaceCheck = await checkWorkspaces();
  table.push([
    'Workspace links',
    workspaceCheck.pass ? chalk.green('✓') : chalk.red('✗'),
    workspaceCheck.message
  ]);
  if (!workspaceCheck.pass) {
    console.log(table.toString());
    console.log(chalk.red('\nSetup failed! Fix: ' + workspaceCheck.fix));
    process.exit(1);
  }

  // Check 3: Database accessibility
  const dbCheck = await checkDatabase();
  table.push([
    'Database',
    dbCheck.pass ? chalk.green('✓') : chalk.red('✗'),
    dbCheck.message
  ]);
  if (!dbCheck.pass) {
    console.log(table.toString());
    console.log(chalk.red('\nSetup failed! Fix: ' + dbCheck.fix));
    process.exit(1);
  }

  // Check 4: Mosquitto persistence (warning only, non-blocking)
  const mqttCheck = await checkMosquittoPersistence();
  const mqttStatus = mqttCheck.enabled ? chalk.green('✓') : chalk.yellow('⚠');
  table.push([
    'Mosquitto persistence',
    mqttStatus,
    mqttCheck.message || 'Enabled'
  ]);
  if (!mqttCheck.enabled && mqttCheck.warning) {
    console.log(table.toString());
    console.log(chalk.yellow('\n⚠ ' + mqttCheck.warning));
  }

  // Check 5: Initialize database schema
  try {
    const { initializeSchema } = await import('../packages/coordination/dist/state/schema.js');
    const dbPath = path.join(__dirname, '..', 'packages', 'coordination', 'swarm.db');
    await initializeSchema(dbPath);
    table.push([
      'Database schema',
      chalk.green('✓'),
      'Initialized'
    ]);
  } catch (error) {
    table.push([
      'Database schema',
      chalk.red('✗'),
      error instanceof Error ? error.message : 'Failed to initialize'
    ]);
    console.log(table.toString());
    console.log(chalk.red('\nSetup failed! Fix: Run npm run build first'));
    process.exit(1);
  }

  console.log(table.toString());
  console.log(chalk.green('\n✓ Setup complete! System is ready.\n'));
}

runSetup().catch(error => {
  console.error(chalk.red('Setup error:'), error);
  process.exit(1);
});
