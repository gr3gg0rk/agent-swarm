/**
 * Systemd Service Template and Supervisor Helper
 *
 * Per RESEARCH.md Pattern 3: systemd services manage agent lifecycle.
 * Auto-restart on crash with exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max).
 * Per LIFE-01: Agents start automatically on machine boot via systemd.
 * Per LIFE-02: Agents that crash are automatically restarted by supervisor.
 */
/**
 * Configuration for systemd service generation.
 */
export interface SupervisorConfig {
    /** Agent ID for service instantiation */
    agentId: string;
    /** Path to Node.js binary */
    nodePath: string;
    /** Path to agent script */
    scriptPath: string;
    /** User to run service as */
    user: string;
    /** Group to run service as */
    group: string;
    /** Working directory for service */
    workingDirectory: string;
}
/**
 * Systemd service template for OpenClaw Swarm agents.
 *
 * Per CONTEXT.md: Exponential backoff strategy with systemd RestartSteps.
 * 1s -> 2s -> 4s -> 8s -> 16s -> 30s max (RestartMaxDelaySec).
 * Per LIFE-03: 30-second graceful shutdown timeout.
 */
export declare const SYSTEMD_TEMPLATE = "\n[Unit]\nDescription=OpenClaw Swarm Agent (%i)\nAfter=network.target mosquitto.service\nRequires=mosquitto.service\n\n[Service]\nType=simple\nUser={{USER}}\nGroup={{GROUP}}\nWorkingDirectory={{WORKING_DIR}}\nExecStart={{NODE_PATH}} {{SCRIPT_PATH}} --agent-id=%i\nRestart=on-failure\nRestartSec=1s\nRestartSteps=5\nRestartMaxDelaySec=30s\nStartLimitIntervalSec=60s\nStartLimitBurst=5\nStandardOutput=journal\nStandardError=journal\nSyslogIdentifier=openclaw-%i\n\n# Graceful shutdown: allow time to finish current task\nTimeoutStopSec=30s\nKillMode=mixed\nKillSignal=SIGTERM\n\n[Install]\nWantedBy=multi-user.target\n";
/**
 * Generate systemd service file content from configuration.
 *
 * Replaces template placeholders with actual values.
 * Uses defaults for any missing configuration values.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Complete systemd service file content
 */
export declare function generateSystemdService(config?: Partial<SupervisorConfig>): string;
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
export declare function installSystemdService(agentId: string, config?: Partial<SupervisorConfig>): string;
/**
 * Installation instructions for systemd service.
 *
 * Provides step-by-step commands for deploying the service file.
 * These commands must be run with sudo privileges.
 */
export declare const INSTALL_INSTRUCTIONS = "\n# Install OpenClaw Agent systemd service\nsudo cp config/supervisor/openclaw-agent@.service /etc/systemd/system/\nsudo systemctl daemon-reload\nsudo systemctl enable openclaw-agent@minerva\nsudo systemctl start openclaw-agent@minerva\n\n# Check status\nsudo systemctl status openclaw-agent@minerva\n\n# View logs\njournalctl -u openclaw-agent@minerva -f\n";
//# sourceMappingURL=supervisor.d.ts.map