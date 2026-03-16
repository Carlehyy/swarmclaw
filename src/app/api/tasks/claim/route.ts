import { NextRequest, NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { claimPoolTask } from '@/lib/server/runtime/queue'

export async function POST(req: NextRequest) {
  const { data: body, error } = await safeParseBody<{ taskId?: string; agentId?: string }>(req)
  if (error) return error
  const { taskId, agentId } = body
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }
  if (!agentId || typeof agentId !== 'string') {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
  }
  const result = claimPoolTask(taskId, agentId)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
