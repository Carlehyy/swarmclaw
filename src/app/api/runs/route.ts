import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/server/runtime/session-run-manager'
import { listProtocolRuns } from '@/lib/server/protocols/protocol-queries'
import { protocolRunToSessionRunRecord } from '@/lib/server/runs/unified-run-records'
import type { SessionRunStatus } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId') || undefined
  const status = (searchParams.get('status') || undefined) as SessionRunStatus | undefined
  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined

  const sessionRuns = listRuns({ sessionId, status, limit })
  const protocolRuns = listProtocolRuns({ includeSystemOwned: true, limit: limit || 200 })
    .filter((run) => run.status !== 'archived')
    .map(protocolRunToSessionRunRecord)
    .filter((run) => !sessionId || run.sessionId === sessionId)
    .filter((run) => !status || run.status === status)
  const runs = [...sessionRuns, ...protocolRuns]
    .sort((left, right) => (right.queuedAt || 0) - (left.queuedAt || 0))
    .slice(0, limit || 200)
  return NextResponse.json(runs)
}
