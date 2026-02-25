#!/usr/bin/env node
/**
 * Start Dashboard Script
 *
 * Usage: npm run dashboard [options]
 * Options:
 *   --production    Use production mode (vite preview)
 *   --config <path> Path to dashboard config file (default: config/dashboard.json)
 *   -q, --quiet     Silence output
 *   -v, --verbose   Enable verbose logging
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
  boolean: ['production'],
  default: {
    config: path.join(__dirname, '..', 'config', 'dashboard.json'),
    production: false,
  },
});

// Logging helper
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
  // Load config to display port
  let port = 5173;
  try {
    const configContent = await readFile(args.config, 'utf-8');
    const config = JSON.parse(configContent);
    port = config.port || 5173;
  } catch {
    // Use default
  }

  const mode = args.production ? 'production' : 'dev';
  log(chalk.bold(`Starting dashboard in ${mode} mode...`));

  // Dashboard workspace package
  const dashboardPkg = '@openclaw-swarm/dashboard';

  if (args.production) {
    // Production mode: use vite preview per 17-RESEARCH.md Open Question 2
    log(chalk.yellow('Building dashboard...'));
    await $`npm run build --workspace=${dashboardPkg}`;

    log(chalk.green('✓ Dashboard built'));
    log(chalk.dim(`Starting preview server on port ${port}...`));

    // Start preview server
    $.verbose = logLevel === 'verbose';
    await $`npm run preview --workspace=${dashboardPkg}`;
  } else {
    // Dev mode: use vite dev server with HMR
    log(chalk.dim(`Starting dev server on port ${port} with HMR...`));

    $.verbose = logLevel === 'verbose';
    await $`npm run dev --workspace=${dashboardPkg}`;
  }
}

main().catch(error => {
  console.error(chalk.red('Dashboard error:'), error);
  process.exit(1);
});
