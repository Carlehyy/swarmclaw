import { NextResponse } from 'next/server'
import type { PermissionPreset } from '@/types'
import { getExecConfig } from '@/lib/server/openclaw/exec-config'
import { resolvePresetFromConfig, applyPreset } from '@/lib/server/openclaw/permission-presets'
import { errorMessage } from '@/lib/shared-utils'
import { safeParseBody } from '@/lib/server/safe-parse-body'

/** GET ?agentId=X — resolve current permission preset */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')
  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
  }

  try {
    const snap = await getExecConfig(agentId)
    const preset = resolvePresetFromConfig(snap.file)
    return NextResponse.json({ preset, config: snap.file })
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** PUT { agentId, preset } — apply a permission preset */
export async function PUT(req: Request) {
  const { data: body, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const { agentId, preset } = body as { agentId?: string; preset?: PermissionPreset }
  if (!agentId || !preset) {
    return NextResponse.json({ error: 'Missing agentId or preset' }, { status: 400 })
  }

  try {
    await applyPreset(agentId, preset)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
