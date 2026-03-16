import { NextResponse } from 'next/server'
import { ensureGatewayConnected } from '@/lib/server/openclaw/gateway'
import { errorMessage } from '@/lib/shared-utils'
import { safeParseBody } from '@/lib/server/safe-parse-body'

/** POST { skillKey, source } — remove a skill via gateway */
export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const { skillKey, source } = body as { skillKey?: string; source?: string }
  if (!skillKey) {
    return NextResponse.json({ error: 'Missing skillKey' }, { status: 400 })
  }

  const gw = await ensureGatewayConnected()
  if (!gw) {
    return NextResponse.json({ error: 'Gateway not connected' }, { status: 503 })
  }

  try {
    await gw.rpc('skills.remove', { skillKey, source })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
