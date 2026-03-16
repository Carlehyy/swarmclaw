import { NextResponse } from 'next/server'
import { genId } from '@/lib/id'
import { loadCredentials, saveCredentials, encryptKey } from '@/lib/server/storage'
import { safeParseBody } from '@/lib/server/safe-parse-body'
export const dynamic = 'force-dynamic'


export async function GET(_req: Request) {
  const creds = loadCredentials()
  const safe: Record<string, Record<string, unknown>> = {}
  for (const [id, c] of Object.entries(creds) as [string, Record<string, unknown>][]) {
    safe[id] = { id: c.id, provider: c.provider, name: c.name, createdAt: c.createdAt }
  }
  return NextResponse.json(safe)
}

export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody<{ provider: string; name: string; apiKey: string }>(req)
  if (error) return error
  const { provider, name, apiKey } = body
  if (!provider || !apiKey) {
    return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 })
  }
  const id = 'cred_' + genId(6)
  const creds = loadCredentials()
  creds[id] = {
    id,
    provider,
    name: name || `${provider} key`,
    encryptedKey: encryptKey(apiKey),
    createdAt: Date.now(),
  }
  saveCredentials(creds)
  return NextResponse.json({ id, provider, name: creds[id].name, createdAt: creds[id].createdAt })
}
