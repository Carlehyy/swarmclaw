import { NextResponse } from 'next/server'
import {
  ensureDaemonProcessRunning,
  getDaemonStatusSnapshot,
  stopDaemonProcess,
} from '@/lib/server/daemon/controller'
import { notify } from '@/lib/server/ws-hub'
export const dynamic = 'force-dynamic'


export async function GET() {
  return NextResponse.json(await getDaemonStatusSnapshot())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  if (action === 'start') {
    await ensureDaemonProcessRunning('api/daemon:post:start', { manualStart: true })
    notify('daemon')
    return NextResponse.json(await getDaemonStatusSnapshot())
  } else if (action === 'stop') {
    await stopDaemonProcess({ source: 'api/daemon:post:stop', manualStop: true })
    notify('daemon')
    return NextResponse.json(await getDaemonStatusSnapshot())
  }

  return NextResponse.json({ error: 'Invalid action. Use "start" or "stop".' }, { status: 400 })
}
