import { NextResponse } from 'next/server'
import { getRunById } from '@/lib/server/runtime/session-run-manager'
import { loadProtocolRunById } from '@/lib/server/protocols/protocol-queries'
import { protocolRunToSessionRunRecord } from '@/lib/server/runs/unified-run-records'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = getRunById(id)
  if (run) return NextResponse.json(run)
  const protocolRun = loadProtocolRunById(id)
  if (protocolRun) return NextResponse.json(protocolRunToSessionRunRecord(protocolRun))
  return NextResponse.json({ error: 'Run not found' }, { status: 404 })
}
