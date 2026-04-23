import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/server/runtime/session-run-manager'
import { listProtocolRuns } from '@/lib/server/protocols/protocol-queries'
import { protocolRunToSessionRunRecord } from '@/lib/server/runs/unified-run-records'
import type { ProtocolRunStatus, SessionRunStatus } from '@/types'

export const dynamic = 'force-dynamic'

function protocolStatusesForRunStatus(status?: SessionRunStatus): ProtocolRunStatus[] {
  switch (status) {
    case 'queued':
      return ['draft']
    case 'running':
      return ['running', 'waiting', 'paused']
    case 'completed':
      return ['completed']
    case 'failed':
      return ['failed']
    case 'cancelled':
      return ['cancelled', 'archived']
    default:
      return []
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId') || undefined
  const status = (searchParams.get('status') || undefined) as SessionRunStatus | undefined
  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined

  const sessionRuns = listRuns({ sessionId, status, limit })
  const fetchLimit = limit || 200
  const scopedProtocolRuns = status
    ? protocolStatusesForRunStatus(status).flatMap((protocolStatus) => listProtocolRuns({
      includeSystemOwned: true,
      sessionId,
      status: protocolStatus,
      limit: fetchLimit,
    }))
    : listProtocolRuns({
      includeSystemOwned: true,
      sessionId,
      limit: fetchLimit,
    })
  const protocolRuns = Array.from(new Map(scopedProtocolRuns.map((run) => [run.id, run])).values())
    .filter((run) => run.status !== 'archived')
    .map(protocolRunToSessionRunRecord)
    .filter((run) => !status || run.status === status)
  const runs = [...sessionRuns, ...protocolRuns]
    .sort((left, right) => (right.queuedAt || 0) - (left.queuedAt || 0))
    .slice(0, fetchLimit)
  return NextResponse.json(runs)
}
