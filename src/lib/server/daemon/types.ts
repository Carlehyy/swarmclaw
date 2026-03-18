import type { EstopState } from '@/types'

export interface DaemonStatusPayload {
  running: boolean
  schedulerActive: boolean
  autostartEnabled: boolean
  backgroundServicesEnabled: boolean
  reducedMode: boolean
  manualStopRequested: boolean
  estop: EstopState
  queueLength: number
  lastProcessed: number | null
  nextScheduled: number | null
  heartbeat: Record<string, unknown> | null
  health: {
    monitorActive: boolean
    connectorMonitorActive: boolean
    staleSessions: number
    connectorsInBackoff: number
    connectorsExhausted: number
    checkIntervalSec: number
    connectorCheckIntervalSec: number
    integrity: {
      enabled: boolean
      lastCheckedAt: number | null
      lastDriftCount: number
    }
  }
  webhookRetry: {
    pendingRetries: number
    deadLettered: number
  }
  guards: {
    healthCheckRunning: boolean
    connectorHealthCheckRunning: boolean
    shuttingDown: boolean
    providerCircuitBreakers: number
  }
}

export interface DaemonHealthSummaryPayload {
  ok: boolean
  uptime: number
  components: {
    daemon: { status: 'healthy' | 'stopped' | 'degraded' }
    connectors: { healthy: number; errored: number; total: number }
    providers: { healthy: number; cooldown: number; total: number }
    gateways: { healthy: number; degraded: number; total: number }
  }
  estop: boolean
  nextScheduledTask: number | null
}

export interface PersistedDaemonStatusRecord {
  pid: number | null
  adminPort: number | null
  desiredState: 'running' | 'stopped'
  manualStopRequested: boolean
  startedAt: number | null
  stoppedAt: number | null
  lastHeartbeatAt: number | null
  updatedAt: number
  lastLaunchSource: string | null
  lastStopSource: string | null
  lastError: string | null
  lastStatus: DaemonStatusPayload | null
  lastHealthSummary: DaemonHealthSummaryPayload | null
}

export interface DaemonAdminMetadata {
  pid: number
  port: number
  token: string
  launchedAt: number
  source: string | null
}

export interface DaemonConnectorRuntimeState {
  status: 'running' | 'stopped' | 'error'
  authenticated?: boolean
  hasCredentials?: boolean
  qrDataUrl?: string | null
  reconnectAttempts?: number
  nextRetryAt?: number
  reconnectError?: string | null
  reconnectExhausted?: boolean
  presence?: {
    lastMessageAt: number | null
    channelId: string | null
  } | null
}

export interface DaemonRunningConnectorInfo {
  id: string
  name: string
  platform: string
  agentId: string | null
  supportsSend: boolean
  configuredTargets: string[]
  recentChannelId: string | null
}
