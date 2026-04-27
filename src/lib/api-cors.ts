import type { NextRequest } from 'next/server'

// Public helpers for CORS handling on the API surface

// Default origins that are commonly used in development and production
const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://swarmclaw.ai',
  'https://www.swarmclaw.ai',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // added port variants for local development
  'http://localhost:3456',
  'http://127.0.0.1:3456',
]

/**
 * Resolve the CORS origin for a given raw Origin header value.
 * - If SWARMCLAW_ALLOWED_ORIGINS contains '*', any origin is allowed and will be echoed back.
 * - Otherwise, only origins present in the allow-list are echoed back.
 * - Returns null if the origin is not allowed.
 */
export function resolveApiCorsOrigin(rawOrigin: string | null | undefined): string | null {
  const origin = normalizeOrigin(rawOrigin)
  if (!origin) return null

  // Build allow-list from env or defaults
  const allowRaw = (process.env.SWARMCLAW_ALLOWED_ORIGINS ?? '').trim()
  const allowList = allowRaw
    ? allowRaw.split(',').map((x) => x.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS

  // If wildcard is enabled, allow any origin
  if (allowList.includes('*')) {
    return origin
  }

  // Otherwise only echo back if origin is in the allow-list
  return allowList.includes(origin) ? origin : null
}

/**
 * Build CORS response headers for an API response.
 * If origin is provided, returns a Headers instance containing the standard CORS headers.
 * If origin is null, returns a minimal set (Vary: Origin) so caches can distinguish origins.
 */
export function buildApiCorsHeaders(origin: string | null): Headers {
  // When there is no origin, still signal Vary for proper caching behavior
  if (!origin) {
    const h = new Headers()
    h.set('Vary', 'Origin')
    return h
  }

  // Use a real Headers instance for rich header support
  const headers = new Headers()
  headers.set('Vary', 'Origin')
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Access-Key')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  // Do not allow credentials when wildcard origin is configured
  const allowAll = (process.env.SWARMCLAW_ALLOWED_ORIGINS ?? '').trim() === '*'
  headers.set('Access-Control-Allow-Credentials', allowAll ? 'false' : 'true')
  headers.set('Access-Control-Max-Age', '86400')
  return headers
}

/** Helper to detect a CORS preflight OPTIONS request for API routes. */
export function isPreflightRequest(req: NextRequest): boolean {
  if (!req || req.method !== 'OPTIONS') return false
  const origin = req.headers.get('origin')
  const acrm = req.headers.get('Access-Control-Request-Method')
  return !!origin && !!acrm
}

/** Normalize a raw origin into a sanitized origin string, or null if invalid. */
function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/** Warn when wildcard origins are allowed. */
if ((process.env.SWARMCLAW_ALLOWED_ORIGINS ?? '').trim() === '*') {
  console.warn(
    '⚠ SWARMCLAW_ALLOWED_ORIGINS=* allows any origin. Ensure access is protected by ACCESS_KEY, firewall, or reverse proxy.'
  )
}
