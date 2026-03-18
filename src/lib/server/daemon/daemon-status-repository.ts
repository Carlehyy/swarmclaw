import {
  loadStoredItem,
  patchStoredItem,
  upsertStoredItem,
} from '@/lib/server/storage'
import type {
  DaemonHealthSummaryPayload,
  DaemonStatusPayload,
  PersistedDaemonStatusRecord,
} from '@/lib/server/daemon/types'

const DAEMON_STATUS_ID = 'primary'

function now(): number {
  return Date.now()
}

function normalizeStatusPayload(value: unknown): DaemonStatusPayload | null {
  return value && typeof value === 'object' ? value as DaemonStatusPayload : null
}

function normalizeHealthSummary(value: unknown): DaemonHealthSummaryPayload | null {
  return value && typeof value === 'object' ? value as DaemonHealthSummaryPayload : null
}

function normalizeRecord(value: unknown): PersistedDaemonStatusRecord {
  const record = value && typeof value === 'object' ? value as Partial<PersistedDaemonStatusRecord> : {}
  return {
    pid: typeof record.pid === 'number' && Number.isFinite(record.pid) ? Math.trunc(record.pid) : null,
    adminPort: typeof record.adminPort === 'number' && Number.isFinite(record.adminPort) ? Math.trunc(record.adminPort) : null,
    desiredState: record.desiredState === 'running' ? 'running' : 'stopped',
    manualStopRequested: record.manualStopRequested === true,
    startedAt: typeof record.startedAt === 'number' && Number.isFinite(record.startedAt) ? Math.trunc(record.startedAt) : null,
    stoppedAt: typeof record.stoppedAt === 'number' && Number.isFinite(record.stoppedAt) ? Math.trunc(record.stoppedAt) : null,
    lastHeartbeatAt: typeof record.lastHeartbeatAt === 'number' && Number.isFinite(record.lastHeartbeatAt) ? Math.trunc(record.lastHeartbeatAt) : null,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? Math.trunc(record.updatedAt) : now(),
    lastLaunchSource: typeof record.lastLaunchSource === 'string' ? record.lastLaunchSource : null,
    lastStopSource: typeof record.lastStopSource === 'string' ? record.lastStopSource : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
    lastStatus: normalizeStatusPayload(record.lastStatus),
    lastHealthSummary: normalizeHealthSummary(record.lastHealthSummary),
  }
}

export function loadDaemonStatusRecord(): PersistedDaemonStatusRecord {
  return normalizeRecord(loadStoredItem('daemon_status', DAEMON_STATUS_ID))
}

export function saveDaemonStatusRecord(record: PersistedDaemonStatusRecord | Record<string, unknown>): PersistedDaemonStatusRecord {
  const normalized = normalizeRecord(record)
  upsertStoredItem('daemon_status', DAEMON_STATUS_ID, normalized)
  return normalized
}

export function patchDaemonStatusRecord(
  updater: (current: PersistedDaemonStatusRecord) => PersistedDaemonStatusRecord | Record<string, unknown>,
): PersistedDaemonStatusRecord {
  const next = patchStoredItem<PersistedDaemonStatusRecord>('daemon_status', DAEMON_STATUS_ID, (current) => {
    const normalized = normalizeRecord(current)
    return normalizeRecord(updater(normalized))
  })
  return normalizeRecord(next)
}
