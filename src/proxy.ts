import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/auth'
import {
  buildExtensionInstallCorsHeaders,
  isExtensionInstallCorsPath,
  resolveExtensionInstallCorsOrigin,
} from '@/lib/extension-install-cors'
import { resolveApiCorsOrigin, buildApiCorsHeaders } from '@/lib/api-cors'
import { isProductionRuntime } from '@/lib/runtime/runtime-env'
import { hmrSingleton } from '@/lib/shared-utils'

/* ------------------------------------------------------------------ */
/*  Rate-limit state — HMR-safe via globalThis                        */
/* ------------------------------------------------------------------ */

interface RateLimitEntry {
  count: number
  lockedUntil: number
}

const rateLimitMap = hmrSingleton('__swarmclaw_rate_limit__', () => new Map<string, RateLimitEntry>())

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes
const PRUNE_THRESHOLD = 1000

function isRateLimitEnabled(): boolean {
  return isProductionRuntime()
}

/** Prune expired entries when the map grows too large. */
function pruneRateLimitMap() {
  if (rateLimitMap.size <= PRUNE_THRESHOLD) return
  const now = Date.now()
  rateLimitMap.forEach((entry, ip) => {
    if (entry.lockedUntil < now && entry.count < MAX_ATTEMPTS) {
      rateLimitMap.delete(ip)
    }
  })
}

/** Extract client IP from the request. */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return (request as unknown as { ip?: string }).ip ?? 'unknown'
}

function withExtensionInstallCorsHeaders(pathname: string, origin: string | null, headers?: HeadersInit): Headers {
  const merged = new Headers(headers)
  if (!isExtensionInstallCorsPath(pathname)) return merged
  const corsHeaders = buildExtensionInstallCorsHeaders(origin)
  new Headers(corsHeaders).forEach((value, key) => {
    merged.set(key, value)
  })
  return merged
}

/** Mutate a NextResponse with API-CORS headers when origin is allowed. */
function augmentResponseWithApiCors(res: NextResponse, requestOrigin: string | null): NextResponse {
  const origin = resolveApiCorsOrigin(requestOrigin)
  if (!origin) {
    // Ensure Vary header exists when no origin is allowed
    res.headers.set('Vary', 'Origin')
    return res
  }
  const corsHeaders = buildApiCorsHeaders(origin)
  corsHeaders.forEach((value, key) => {
    res.headers.set(key, value)
  })
  return res
}

/* ------------------------------------------------------------------ */
/*  Proxy                                                              */
/* ------------------------------------------------------------------ */

/** Access key auth proxy with brute-force rate limiting.
 *  Checks X-Access-Key header or auth cookie on all /api/ routes except /api/auth.
 *  The key is validated against the ACCESS_KEY env var.
 *  After 5 failed attempts from a single IP the client is locked out for 15 minutes.
 */
export function proxy(request: NextRequest) {
  const rateLimitEnabled = isRateLimitEnabled()
  const { pathname } = request.nextUrl
  const corsOrigin = resolveExtensionInstallCorsOrigin(request.headers.get('origin'))
  const isWebhookTrigger = request.method === 'POST'
    && /^\/api\/webhooks\/[^/]+\/?$/.test(pathname)
  const isConnectorWebhook = request.method === 'POST'
    && /^\/api\/connectors\/[^/]+\/webhook\/?$/.test(pathname)

  if (request.method === 'OPTIONS' && isExtensionInstallCorsPath(pathname)) {
    if (!corsOrigin) {
      const resp = NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
      return augmentResponseWithApiCors(resp, request.headers.get('Origin'))
    }
    const resp = new NextResponse(null, {
      status: 204,
      headers: buildExtensionInstallCorsHeaders(corsOrigin),
    })
    return augmentResponseWithApiCors(resp, request.headers.get('Origin'))
  }

  // General API CORS preflight for all /api/ routes
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const apiCorsOrigin = resolveApiCorsOrigin(request.headers.get('origin'))
    if (!apiCorsOrigin) {
      const resp = new NextResponse(null, { status: 204, headers: { 'Vary': 'Origin' } })
      return augmentResponseWithApiCors(resp, request.headers.get('Origin'))
    }
    const resp = new NextResponse(null, {
      status: 204,
      headers: buildApiCorsHeaders(apiCorsOrigin),
    })
    return augmentResponseWithApiCors(resp, request.headers.get('Origin'))
  }

  // A2A endpoints use their own authentication (Authorization: Bearer / x-a2a-access-key)
  const isA2ARoute = pathname === '/api/a2a'
    || pathname.startsWith('/api/a2a/')
    || pathname === '/api/.well-known/agent-card'

  // Only protect API routes (not auth, inbound webhooks, or A2A)
  if (
    !pathname.startsWith('/api/')
    || pathname === '/api/auth'
    || pathname === '/api/healthz'
    || isWebhookTrigger
    || isConnectorWebhook
    || isA2ARoute
  ) {
    return augmentResponseWithApiCors(NextResponse.next(), request.headers.get('Origin'))
  }

  const accessKey = process.env.ACCESS_KEY
  if (!accessKey) {
    // No key configured — allow all (dev mode)
    return augmentResponseWithApiCors(NextResponse.next(), request.headers.get('Origin'))
  }

  // --- Rate-limit housekeeping ---
  if (rateLimitEnabled) pruneRateLimitMap()

  const clientIp = getClientIp(request)
  const entry = rateLimitEnabled ? rateLimitMap.get(clientIp) : undefined

  // Check lockout before even validating the key
  if (rateLimitEnabled && entry && entry.lockedUntil > Date.now()) {
    const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000)
    const resp = NextResponse.json(
      { error: 'Too many failed attempts. Try again later.', retryAfter },
      {
        status: 429,
        headers: withExtensionInstallCorsHeaders(pathname, corsOrigin, { 'Retry-After': String(retryAfter) }),
      },
    )
    return augmentResponseWithApiCors(resp, request.headers.get('Origin'))
  }

  const cookieKey = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim() || ''
  const headerKey = request.headers.get('x-access-key')?.trim() || ''
  const providedKey = cookieKey || headerKey

  if (providedKey !== accessKey) {
    let remaining = MAX_ATTEMPTS
    if (rateLimitEnabled) {
      const current = rateLimitMap.get(clientIp) ?? { count: 0, lockedUntil: 0 }
      current.count += 1

      if (current.count >= MAX_ATTEMPTS) {
        current.lockedUntil = Date.now() + LOCKOUT_MS
      }

      rateLimitMap.set(clientIp, current)
      remaining = Math.max(0, MAX_ATTEMPTS - current.count)
    }
    const resp = NextResponse.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: withExtensionInstallCorsHeaders(pathname, corsOrigin, { 'X-RateLimit-Remaining': String(remaining) }),
      },
    )
    return augmentResponseWithApiCors(resp, request.headers.get('Origin'))
  }

  // Successful auth — clear any prior failed-attempt tracking for this IP
  if (rateLimitEnabled && entry) {
    rateLimitMap.delete(clientIp)
  }

  return augmentResponseWithApiCors(NextResponse.next(), request.headers.get('Origin'))
}

export const config = {
  matcher: '/api/:path*',
}
