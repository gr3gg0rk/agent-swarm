/**
 * Mosquitto configuration checker
 *
 * Detects snap installation with persistence disabled.
 * Per 13-CONTEXT.md: Warning is non-blocking.
 */

import fs from 'node:fs/promises';

export async function checkMosquittoPersistence() {
  const configPaths = [
    '/etc/mosquitto/mosquitto.conf',
    '/var/snap/mosquitto/current/mosquitto.conf',
    '/usr/local/etc/mosquitto/mosquitto.conf'
  ];

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');

      // Check for persistence setting
      const hasPersistence =
        content.includes('persistence true') ||
        content.includes('persistance true'); // Common typo

      const snapInstall = configPath.includes('/snap/');

      if (snapInstall && !hasPersistence) {
        return {
          enabled: false,
          configPath,
          warning: 'Mosquitto installed via snap with persistence disabled. Messages may be lost on restart. Enable persistence in mosquitto.conf or install via apt.',
          message: 'Disabled (snap install)'
        };
      }

      if (hasPersistence) {
        return {
          enabled: true,
          configPath,
          message: `Enabled (${configPath})`
        };
      }

      return {
        enabled: false,
        configPath,
        warning: 'Mosquitto persistence disabled. Messages will be lost on restart.',
        message: `Disabled (${configPath})`
      };
    } catch {
      // Config file not found, try next path
      continue;
    }
  }

  // Mosquitto not installed or config not found
  return {
    enabled: false,
    configPath: 'none',
    warning: 'Mosquitto configuration not found. Is MQTT broker installed?',
    message: 'Not configured'
  };
}
