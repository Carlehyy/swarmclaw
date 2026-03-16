import { NextResponse } from 'next/server'
import { detectConfigIssues, repairConfigIssue } from '@/lib/server/openclaw/config-sync'
import { errorMessage } from '@/lib/shared-utils'
import { safeParseBody } from '@/lib/server/safe-parse-body'

/** GET — detect configuration issues */
export async function GET() {
  try {
    const issues = await detectConfigIssues()
    return NextResponse.json({ issues })
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** POST { issueId } — repair a specific issue */
export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const { issueId } = body as { issueId?: string }
  if (!issueId) {
    return NextResponse.json({ error: 'Missing issueId' }, { status: 400 })
  }

  try {
    const result = await repairConfigIssue(issueId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = errorMessage(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
