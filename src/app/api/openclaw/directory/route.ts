import { NextResponse } from 'next/server'
import { listDaemonRunningConnectors } from '@/lib/server/daemon/controller'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const openclawConnectors = await listDaemonRunningConnectors('openclaw')

    if (!openclawConnectors.length) {
      return NextResponse.json({ devices: [], note: 'No running OpenClaw connector.' })
    }

    // The directory.list RPC requires gateway support — degrade gracefully
    return NextResponse.json({
      devices: [],
      connectors: openclawConnectors.map((c) => ({
        id: c.id,
        name: c.name,
        platform: c.platform,
      })),
      note: 'Directory listing requires OpenClaw gateway directory.list RPC support.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Directory listing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
