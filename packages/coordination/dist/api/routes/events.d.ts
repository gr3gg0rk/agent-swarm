import { Router } from 'express';
import Database from 'better-sqlite3';
import type { MqttClient } from '../../communication/mqtt.js';
/**
 * SSE event types for dashboard updates
 */
export interface DashboardEvent {
    type: 'agents' | 'tasks' | 'metrics';
    data: unknown;
    timestamp: number;
}
/**
 * Throttled broadcaster for SSE updates
 * Limits broadcasts to 10 updates/second (100ms interval)
 * Per VIZ-05 requirement
 */
export declare class ThrottledBroadcaster {
    private broadcast;
    private maxFrequencyMs;
    private pendingUpdate;
    private buffer;
    private broadcastInterval;
    constructor(broadcast: (data: DashboardEvent) => void, maxFrequencyMs?: number);
    /**
     * Buffer an update for next broadcast cycle
     */
    enqueue(type: string, data: unknown): void;
    /**
     * Send buffered updates at throttled rate
     */
    private flush;
    /**
     * Stop broadcasting and clean up interval
     */
    stop(): void;
}
/**
 * Creates SSE event routes for dashboard real-time updates
 *
 * Endpoints:
 * - GET /api/events - SSE endpoint for dashboard updates
 *
 * @param db - Database instance for querying current state
 * @param mqttClient - MQTT client for subscribing to load metrics
 * @returns Express router with SSE routes
 */
export declare function createEventRoutes(db: Database.Database, mqttClient: MqttClient): {
    router: Router;
    broadcaster: ThrottledBroadcaster;
};
//# sourceMappingURL=events.d.ts.map