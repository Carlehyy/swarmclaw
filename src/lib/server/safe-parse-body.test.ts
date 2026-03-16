import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

let safeParseBody: typeof import('@/lib/server/safe-parse-body').safeParseBody
before(async () => {
  process.env.SWARMCLAW_BUILD_MODE = '1'
  const mod = await import('@/lib/server/safe-parse-body')
  safeParseBody = mod.safeParseBody
})
after(() => { delete process.env.SWARMCLAW_BUILD_MODE })

function jsonRequest(body: string): Request {
  return new Request('http://test', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('safeParseBody', () => {
  it('returns { data } for valid JSON', async () => {
    const result = await safeParseBody(jsonRequest(JSON.stringify({ foo: 'bar', n: 42 })))
    assert.equal(result.error, undefined)
    assert.deepEqual(result.data, { foo: 'bar', n: 42 })
  })

  it('returns { error } with 400 for malformed JSON', async () => {
    const result = await safeParseBody(jsonRequest('not-json'))
    assert.equal(result.data, undefined)
    assert.ok(result.error)
    assert.equal(result.error.status, 400)
    const body = await result.error.json()
    assert.equal(body.error, 'Invalid or missing request body')
  })

  it('returns { error } with 400 for empty body', async () => {
    const req = new Request('http://test', { method: 'POST' })
    const result = await safeParseBody(req)
    assert.equal(result.data, undefined)
    assert.ok(result.error)
    assert.equal(result.error.status, 400)
  })

  it('supports generic type parameter', async () => {
    interface Payload { name: string; count: number }
    const result = await safeParseBody<Payload>(
      jsonRequest(JSON.stringify({ name: 'test', count: 7 })),
    )
    assert.equal(result.error, undefined)
    assert.equal(result.data!.name, 'test')
    assert.equal(result.data!.count, 7)
  })
})
