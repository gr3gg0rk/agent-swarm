#!/usr/bin/env node
/**
 * Start Agent Script
 *
 * Usage: npm run agent [options]
 * Options:
 *   --config <path>   Path to agent config file (default: config/agent.json)
 *   -q, --quiet       Silence output
 *   -v, --verbose     Enable verbose logging
 */

import { $ } from 'zx';
import chalk from 'chalk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import minimist from 'minimist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
$.verbose = false;

// Parse CLI arguments per 17-CONTEXT.md
const args = minimist(process.argv.slice(2), {
  alias: {
    quiet: ['q'],
    verbose: ['v'],
    config: ['c'],
  },
  default: {
    config: path.join(__dirname, '..', 'config', 'agent.json'),
  },
});

// Logging helper per 17-CONTEXT.md startup behavior
let logLevel = args.quiet ? 'none' : args.verbose ? 'verbose' : 'info';

function log(message, level = 'info') {
  if (logLevel === 'none') return;
  if (level === 'error' || logLevel === 'verbose') {
    console[level === 'error' ? chalk.red(message) : message];
  } else if (level === 'info') {
    console.log(message);
  }
}

async function main() {
  // Load and validate config (fail-fast per 17-CONTEXT.md)
  const configPath = args.config;
  let config;
  try {
    const configContent = await readFile(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    console.error(chalk.red('Error loading config:'), error.message);
    console.error(chalk.yellow('Fix: Ensure config file exists at ' + configPath));
    process.exit(1);
  }

  // Validate required fields
  const required = ['agentId', 'role', 'brokerUrl', 'capabilities'];
  const missing = required.filter(field => !config[field]);
  if (missing.length > 0) {
    console.error(chalk.red('Missing required fields:'), missing.join(', '));
    console.error(chalk.yellow('Fix: Add these fields to ' + configPath));
    process.exit(1);
  }

  log(chalk.bold(`Starting agent ${config.agentId}...`));

  // Import from coordination package (SCRIPT-04: workspace imports)
  const { connectToBroker } = await import(
    '@openclaw-swarm/coordination/dist/communication/mqtt'
  );
  const { BasicAgent } = await import('../examples/basic-agent.js');

  // Connect to broker
  let mqttClient;
  try {
    mqttClient = await connectToBroker({
      brokerUrl: config.brokerUrl,
      clientId: config.agentId,
    });
    log(chalk.green('Connected to broker'), 'info');
  } catch (error) {
    console.error(chalk.red('Failed to connect to broker:'), error.message);
    console.error(
      chalk.yellow('Fix: Ensure Mosquitto is running at ' + config.brokerUrl)
    );
    process.exit(1);
  }

  // Create and start agent (SCRIPT-01: start agent with example config)
  const agent = new BasicAgent(config, mqttClient);

  // Graceful shutdown per 17-CONTEXT.md
  const shutdown = async signal => {
    log(chalk.yellow(`\nReceived ${signal}, shutting down gracefully...`));
    await agent.stop();
    await mqttClient.end();
    log(chalk.green('Agent stopped'));
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await agent.start();
    log(chalk.green('Agent started'), 'info');
    log(chalk.dim(`Press Ctrl+C to stop`));
  } catch (error) {
    console.error(chalk.red('Failed to start agent:'), error.message);
    await shutdown('ERROR');
  }
}

main().catch(error => {
  console.error(chalk.red('Agent error:'), error);
  process.exit(1);
});
