import { NextResponse } from 'next/server'

type SafeResult<T> = { data: T; error?: never } | { data?: never; error: NextResponse }

/**
 * Wraps `req.json()` so malformed/empty bodies return a 400
 * instead of throwing an unhandled error (500).
 */
export async function safeParseBody<T = Record<string, unknown>>(req: Request): Promise<SafeResult<T>> {
  try {
    const data = (await req.json()) as T
    return { data }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid or missing request body' }, { status: 400 }) }
  }
}
