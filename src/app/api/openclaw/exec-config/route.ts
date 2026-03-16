import { NextResponse } from 'next/server'
import { getExecConfig, setExecConfig } from '@/lib/server/openclaw/exec-config'
import type { ExecApprovalConfig } from '@/types'
import { errorMessage } from '@/lib/shared-utils'
import { safeParseBody } from '@/lib/server/safe-parse-body'

/** GET ?agentId=X — fetch exec approval config */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')
  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
  }

  try {
    const snapshot = await getExecConfig(agentId)
    return NextResponse.json(snapshot)
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** PUT { agentId, config, baseHash } — save exec approval config */
export async function PUT(req: Request) {
  const { data: body, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const { agentId, config, baseHash } = body as {
    agentId?: string
    config?: ExecApprovalConfig
    baseHash?: string
  }
  if (!agentId || !config) {
    return NextResponse.json({ error: 'Missing agentId or config' }, { status: 400 })
  }

  try {
    const result = await setExecConfig(agentId, config, baseHash ?? '')
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
