import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { ensureGatewayConnected } from '@/lib/server/openclaw/gateway'
import type { GatewayCronJob } from '@/types'
import { errorMessage } from '@/lib/shared-utils'

/** GET — list all cron jobs from gateway */
export async function GET() {
  const gw = await ensureGatewayConnected()
  if (!gw) {
    return NextResponse.json({ error: 'Gateway not connected' }, { status: 503 })
  }

  try {
    const result = await gw.rpc('cron.list', { includeDisabled: true }) as GatewayCronJob[] | undefined
    return NextResponse.json(result ?? [])
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** POST { action, ...params } — add/run/remove cron jobs */
export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody<{ action: string; [key: string]: unknown }>(req)
  if (error) return error
  const { action, ...params } = body

  const gw = await ensureGatewayConnected()
  if (!gw) {
    return NextResponse.json({ error: 'Gateway not connected' }, { status: 503 })
  }

  try {
    switch (action) {
      case 'add': {
        const result = await gw.rpc('cron.add', params.job)
        return NextResponse.json({ ok: true, result })
      }
      case 'run': {
        const result = await gw.rpc('cron.run', { id: params.id, mode: 'force' })
        return NextResponse.json({ ok: true, result })
      }
      case 'remove': {
        await gw.rpc('cron.remove', { id: params.id })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
