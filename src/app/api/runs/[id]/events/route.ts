import { NextResponse } from 'next/server'
import { getRunById, listRunEvents } from '@/lib/server/runtime/session-run-manager'
import { listProtocolRunEventsForRun, loadProtocolRunById } from '@/lib/server/protocols/protocol-queries'
import { protocolEventToRunEventRecord } from '@/lib/server/runs/unified-run-records'

export const dynamic = 'force-dynamic'

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = getRunById(id)
  if (run) {
    const url = new URL(req.url)
    const limit = parseLimit(url.searchParams.get('limit'))
    return NextResponse.json(listRunEvents(id, limit))
  }
  const protocolRun = loadProtocolRunById(id)
  if (!protocolRun) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const url = new URL(req.url)
  const limit = parseLimit(url.searchParams.get('limit'))
  const events = listProtocolRunEventsForRun(id, limit || 200).map((event) => protocolEventToRunEventRecord(protocolRun, event))
  return NextResponse.json(events)
}
