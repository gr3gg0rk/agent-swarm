/**
 * Systemd Service Template and Supervisor Helper
 *
 * Per RESEARCH.md Pattern 3: systemd services manage agent lifecycle.
 * Auto-restart on crash with exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max).
 * Per LIFE-01: Agents start automatically on machine boot via systemd.
 * Per LIFE-02: Agents that crash are automatically restarted by supervisor.
 */
/**
 * Systemd service template for OpenClaw Swarm agents.
 *
 * Per CONTEXT.md: Exponential backoff strategy with systemd RestartSteps.
 * 1s -> 2s -> 4s -> 8s -> 16s -> 30s max (RestartMaxDelaySec).
 * Per LIFE-03: 30-second graceful shutdown timeout.
 */
export const SYSTEMD_TEMPLATE = `
[Unit]
Description=OpenClaw Swarm Agent (%i)
After=network.target mosquitto.service
Requires=mosquitto.service

[Service]
Type=simple
User={{USER}}
Group={{GROUP}}
WorkingDirectory={{WORKING_DIR}}
ExecStart={{NODE_PATH}} {{SCRIPT_PATH}} --agent-id=%i
Restart=on-failure
RestartSec=1s
RestartSteps=5
RestartMaxDelaySec=30s
StartLimitIntervalSec=60s
StartLimitBurst=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-%i

# Graceful shutdown: allow time to finish current task
TimeoutStopSec=30s
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
`;
/**
 * Generate systemd service file content from configuration.
 *
 * Replaces template placeholders with actual values.
 * Uses defaults for any missing configuration values.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Complete systemd service file content
 */
export function generateSystemdService(config = {}) {
    const defaults = {
        agentId: 'agent',
        nodePath: '/usr/bin/node',
        scriptPath: '/opt/openclaw-swarm/dist/agent.js',
        user: 'openclaw',
        group: 'openclaw',
        workingDirectory: '/opt/openclaw-swarm',
    };
    const final = { ...defaults, ...config };
    return SYSTEMD_TEMPLATE
        .replace('{{USER}}', final.user)
        .replace('{{GROUP}}', final.group)
        .replace('{{WORKING_DIR}}', final.workingDirectory)
        .replace('{{NODE_PATH}}', final.nodePath)
        .replace('{{SCRIPT_PATH}}', final.scriptPath);
}
/**
 * Generate systemd service file content for a specific agent.
 *
 * Returns the generated service file content.
 * Note: Actual installation requires sudo and systemctl commands (human step).
 *
 * @param agentId - Agent ID for service instantiation
 * @param config - Optional partial configuration overrides
 * @returns Generated systemd service file content
 */
export function installSystemdService(agentId, config) {
    const serviceContent = generateSystemdService({ ...config, agentId });
    return serviceContent;
}
/**
 * Installation instructions for systemd service.
 *
 * Provides step-by-step commands for deploying the service file.
 * These commands must be run with sudo privileges.
 */
export const INSTALL_INSTRUCTIONS = `
# Install OpenClaw Agent systemd service
sudo cp config/supervisor/openclaw-agent@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openclaw-agent@minerva
sudo systemctl start openclaw-agent@minerva

# Check status
sudo systemctl status openclaw-agent@minerva

# View logs
journalctl -u openclaw-agent@minerva -f
`;
//# sourceMappingURL=supervisor.js.map