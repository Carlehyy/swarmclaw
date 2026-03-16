import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { createLoader, createInflightDeduplicator } from './store-utils'

// ── createLoader ────────────────────────────────────────────────────

describe('createLoader', () => {
  it('calls setIfChanged with fetched value on success', async () => {
    const calls: Array<{ key: string; value: unknown }> = []
    const set = (partial: Partial<{ items: string[] }>) => {
      for (const [k, v] of Object.entries(partial)) calls.push({ key: k, value: v })
    }
    const fetcher = async () => ['a', 'b']

    const loader = createLoader<{ items: string[] }>(set, 'items', fetcher)
    await loader()

    assert.equal(calls.length, 1)
    assert.equal(calls[0].key, 'items')
    assert.deepEqual(calls[0].value, ['a', 'b'])
  })

  it('logs warning and writes fallback on error', async () => {
    const calls: Array<{ key: string; value: unknown }> = []
    const set = (partial: Partial<{ items: string[] }>) => {
      for (const [k, v] of Object.entries(partial)) calls.push({ key: k, value: v })
    }
    const fetcher = async (): Promise<string[]> => {
      throw new Error('network fail')
    }

    const warn = mock.method(console, 'warn', () => {})
    try {
      const loader = createLoader<{ items: string[] }>(set, 'items', fetcher, [])
      await loader()

      assert.equal(warn.mock.callCount(), 1)
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0].value, [])
    } finally {
      warn.mock.restore()
    }
  })

  it('logs warning and leaves store unchanged when no fallback', async () => {
    const calls: Array<{ key: string; value: unknown }> = []
    const set = (partial: Partial<{ items: string[] }>) => {
      for (const [k, v] of Object.entries(partial)) calls.push({ key: k, value: v })
    }
    const fetcher = async (): Promise<string[]> => {
      throw new Error('boom')
    }

    const warn = mock.method(console, 'warn', () => {})
    try {
      const loader = createLoader<{ items: string[] }>(set, 'items', fetcher)
      await loader()

      assert.equal(warn.mock.callCount(), 1)
      assert.equal(calls.length, 0)
    } finally {
      warn.mock.restore()
    }
  })
})

// ── createInflightDeduplicator ──────────────────────────────────────

describe('createInflightDeduplicator', () => {
  it('returns same promise for concurrent calls with same ID', async () => {
    const { dedup } = createInflightDeduplicator('test_dedup_same_id')
    let callCount = 0
    const fn = async () => {
      callCount++
      await new Promise((r) => setTimeout(r, 10))
    }

    await Promise.all([dedup('x', fn), dedup('x', fn), dedup('x', fn)])

    assert.equal(callCount, 1)
  })

  it('runs fn separately for different IDs', async () => {
    const { dedup } = createInflightDeduplicator('test_dedup_diff_ids')
    let callCount = 0
    const fn = async () => {
      callCount++
      await new Promise((r) => setTimeout(r, 10))
    }

    await Promise.all([dedup('a', fn), dedup('b', fn)])

    assert.equal(callCount, 2)
  })

  it('cleans up after resolve', async () => {
    const key = 'test_dedup_cleanup_resolve'
    const { dedup } = createInflightDeduplicator(key)
    const g = globalThis as Record<string, unknown>
    const inflight = g[key] as Map<string, Promise<void>>

    await dedup('z', async () => {})

    assert.equal(inflight.has('z'), false)
  })

  it('cleans up after reject', async () => {
    const key = 'test_dedup_cleanup_reject'
    const { dedup } = createInflightDeduplicator(key)
    const g = globalThis as Record<string, unknown>
    const inflight = g[key] as Map<string, Promise<void>>

    await assert.rejects(() => dedup('z', async () => { throw new Error('fail') }))

    assert.equal(inflight.has('z'), false)
  })

  it('allows new call after previous completes', async () => {
    const { dedup } = createInflightDeduplicator('test_dedup_after_complete')
    let callCount = 0
    const fn = async () => { callCount++ }

    await dedup('x', fn)
    await dedup('x', fn)

    assert.equal(callCount, 2)
  })
})
