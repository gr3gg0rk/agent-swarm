#!/usr/bin/env node
/**
 * Start API Server Script
 *
 * Usage: npm run api [options]
 * Options:
 *   --config <path>   Path to API config file (default: config/api.json)
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
$.verbose = false;

// Parse CLI arguments per 17-CONTEXT.md
const args = minimist(process.argv.slice(2), {
  alias: {
    quiet: ['q'],
    verbose: ['v'],
    config: ['c'],
  },
  default: {
    config: path.join(__dirname, '..', 'config', 'api.json'),
  },
});

// Logging helper
let logLevel = args.quiet ? 'none' : args.verbose ? 'verbose' : 'info';

function log(message, level = 'info') {
  if (logLevel === 'none') return;
  if (level === 'error' || logLevel === 'verbose') {
    console[level === 'error' ? 'red' : 'log'](message);
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
  if (!config.port || !config.dbPath) {
    console.error(chalk.red('Missing required fields: port, dbPath'));
    console.error(chalk.yellow('Fix: Add these fields to ' + configPath));
    process.exit(1);
  }

  // Resolve dbPath relative to repo root
  const repoRoot = path.resolve(__dirname, '..');
  const dbPath = path.resolve(repoRoot, config.dbPath);

  log(chalk.bold('Starting API server...'));

  // Import from coordination package (SCRIPT-02: automatic database initialization)
  const { createDatabase, initializeSchema } = await import(
    path.join(repoRoot, 'packages', 'coordination', 'dist', 'state', 'index.js')
  );
  const { createStateApi, startServer, stopServer } = await import(
    path.join(repoRoot, 'packages', 'coordination', 'dist', 'api', 'server.js')
  );

  // Check for build artifacts
  const buildPath = path.join(repoRoot, 'packages', 'coordination', 'dist');
  try {
    await readFile(path.join(buildPath, 'state', 'index.js'));
  } catch {
    console.error(chalk.red('Error: Build artifacts not found'));
    console.error(chalk.yellow('Fix: Run "npm run build" first'));
    process.exit(1);
  }

  // Initialize database
  let db;
  try {
    db = createDatabase({ dbPath });
    initializeSchema(db);
    log(chalk.green('Database initialized'), 'info');
  } catch (error) {
    console.error(chalk.red('Failed to initialize database:'), error.message);
    console.error(
      chalk.yellow('Fix: Ensure better-sqlite3 is installed and path is writable')
    );
    process.exit(1);
  }

  // Create Express app
  const app = createStateApi(db);

  // Start server
  let server;
  try {
    server = startServer(app, config.port);
    log(chalk.green(`API server listening on port ${config.port}`), 'info');

    // Small delay to allow server to start, then health check
    await new Promise(resolve => setTimeout(resolve, 100));

    // Health check verification (only in verbose mode to avoid fetch dependency issues)
    if (logLevel === 'verbose') {
      try {
        const response = await fetch(`http://localhost:${config.port}/health`);
        if (response.ok) {
          const health = await response.json();
          log(chalk.green('Health check passed'), 'verbose');
          log(JSON.stringify(health, null, 2), 'verbose');
        }
      } catch (fetchError) {
        // Fetch may not be available in all Node versions, log but don't fail
        log(chalk.yellow('Health check skipped (fetch not available)'), 'verbose');
      }
    }
  } catch (error) {
    // Port conflict handling per 17-RESEARCH.md Pitfall 2
    if (error.code === 'EADDRINUSE') {
      console.error(
        chalk.red(`Error: Port ${config.port} is already in use`)
      );
      console.error(
        chalk.yellow(
          'Fix: Stop the existing process or change the port in config/api.json'
        )
      );
    } else {
      console.error(chalk.red('Failed to start server:'), error.message);
    }
    db.close();
    process.exit(1);
  }

  // Graceful shutdown per 17-CONTEXT.md
  const shutdown = async (signal) => {
    log(chalk.yellow(`\nReceived ${signal}, shutting down gracefully...`));
    await stopServer(server);
    db.close();
    log(chalk.green('API server stopped'));
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(error => {
  console.error(chalk.red('API server error:'), error);
  process.exit(1);
});
