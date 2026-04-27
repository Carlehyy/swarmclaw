import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolveApiCorsOrigin, buildApiCorsHeaders, isPreflightRequest } from '@/lib/api-cors'
import type { NextRequest } from 'next/server'

// Helper to create a minimal NextRequest-like object for tests
function makeFakeRequest(opts: {
  method?: string
  origin?: string
  acrm?: string
  pathname?: string
}): NextRequest {
  const headers = new Headers()
  if (opts.origin) headers.set('Origin', opts.origin)
  if (opts.acrm) headers.set('Access-Control-Request-Method', opts.acrm)

  const req = {
    method: opts.method ?? 'GET',
    nextUrl: { pathname: opts.pathname ?? '/api/test' },
    headers,
  } as unknown as NextRequest
  return req
}

describe('API CORS helpers', () => {
  beforeEach(() => {
    delete process.env.SWARMCLAW_ALLOWED_ORIGINS
  })

  test('resolveApiCorsOrigin respects wildcard', () => {
    process.env.SWARMCLAW_ALLOWED_ORIGINS = '*'
    const origin = resolveApiCorsOrigin('https://example.org')
    assert.equal(origin, 'https://example.org')
  })

  test('resolveApiCorsOrigin respects explicit allow-list', () => {
    process.env.SWARMCLAW_ALLOWED_ORIGINS = 'https://example.org,https://swarmclaw.ai'
    assert.equal(resolveApiCorsOrigin('https://example.org'), 'https://example.org')
    assert.equal(resolveApiCorsOrigin('https://not-allowed.com'), null)
  })
})

describe('CORS header builder', () => {
  test('buildApiCorsHeaders returns headers with origin', () => {
    const origin = 'https://example.org'
    const headers = buildApiCorsHeaders(origin)
    assert.equal(headers.get('Access-Control-Allow-Origin'), origin)
    assert.equal(headers.get('Access-Control-Allow-Credentials'), 'true')
    assert.equal(headers.get('Vary'), 'Origin')
  })

  test('buildApiCorsHeaders wildcard disables credentials', () => {
    process.env.SWARMCLAW_ALLOWED_ORIGINS = '*'
    const origin = 'https://example.org'
    const headers = buildApiCorsHeaders(origin)
    assert.equal(headers.get('Access-Control-Allow-Credentials'), 'false')
  })

  test('isPreflightRequest detects proper preflight', () => {
    const req = makeFakeRequest({ method: 'OPTIONS', origin: 'https://example.org', acrm: 'GET' })
    assert.equal(isPreflightRequest(req), true)
  })
})
