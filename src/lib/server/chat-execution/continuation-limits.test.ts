import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

let ContinuationLimits: typeof import('@/lib/server/chat-execution/continuation-limits').ContinuationLimits

before(async () => {
  process.env.SWARMCLAW_BUILD_MODE = '1'
  const mod = await import('@/lib/server/chat-execution/continuation-limits')
  ContinuationLimits = mod.ContinuationLimits
})

after(() => {
  delete process.env.SWARMCLAW_BUILD_MODE
})

describe('ContinuationLimits', () => {
  describe('constructor (non-connector)', () => {
    it('all budgets have correct defaults', () => {
      const limits = new ContinuationLimits(false)
      // Spot-check known defaults
      assert.deepEqual(limits.getStatus('recursion'), { count: 0, max: 3 })
      assert.deepEqual(limits.getStatus('transient'), { count: 0, max: 3 })
      assert.deepEqual(limits.getStatus('required_tool'), { count: 0, max: 2 })
      assert.deepEqual(limits.getStatus('memory_write_followthrough'), { count: 0, max: 2 })
      assert.deepEqual(limits.getStatus('execution_followthrough'), { count: 0, max: 1 })
      assert.deepEqual(limits.getStatus('execution_kickoff_followthrough'), { count: 0, max: 1 })
      assert.deepEqual(limits.getStatus('attachment_followthrough'), { count: 0, max: 1 })
      assert.deepEqual(limits.getStatus('deliverable_followthrough'), { count: 0, max: 2 })
      assert.deepEqual(limits.getStatus('unfinished_tool_followthrough'), { count: 0, max: 2 })
      assert.deepEqual(limits.getStatus('tool_error_followthrough'), { count: 0, max: 2 })
      assert.deepEqual(limits.getStatus('tool_summary'), { count: 0, max: 2 })
      assert.deepEqual(limits.getStatus('coordinator_synthesis'), { count: 0, max: 2 })
    })
  })

  describe('constructor (connector)', () => {
    it('zeroes deliverable/execution/attachment, reduces tool_summary and unfinished_tool', () => {
      const limits = new ContinuationLimits(true)
      assert.deepEqual(limits.getStatus('deliverable_followthrough'), { count: 0, max: 0 })
      assert.deepEqual(limits.getStatus('execution_followthrough'), { count: 0, max: 0 })
      assert.deepEqual(limits.getStatus('attachment_followthrough'), { count: 0, max: 0 })
      assert.deepEqual(limits.getStatus('tool_summary'), { count: 0, max: 1 })
      assert.deepEqual(limits.getStatus('unfinished_tool_followthrough'), { count: 0, max: 1 })
      // Unchanged budgets
      assert.deepEqual(limits.getStatus('recursion'), { count: 0, max: 3 })
      assert.deepEqual(limits.getStatus('transient'), { count: 0, max: 3 })
    })
  })

  describe('canContinue', () => {
    it('returns true when count < max', () => {
      const limits = new ContinuationLimits(false)
      assert.equal(limits.canContinue('recursion'), true)
    })

    it('returns false when count >= max', () => {
      const limits = new ContinuationLimits(false)
      limits.increment('recursion')
      limits.increment('recursion')
      limits.increment('recursion')
      assert.equal(limits.canContinue('recursion'), false)
    })
  })

  describe('increment', () => {
    it('increments count and returns new value', () => {
      const limits = new ContinuationLimits(false)
      assert.equal(limits.increment('recursion'), 1)
      assert.equal(limits.increment('recursion'), 2)
      assert.equal(limits.increment('recursion'), 3)
    })

    it('can exceed max — canContinue returns false after', () => {
      const limits = new ContinuationLimits(false)
      for (let i = 0; i < 5; i++) limits.increment('recursion')
      assert.equal(limits.getStatus('recursion').count, 5)
      assert.equal(limits.canContinue('recursion'), false)
    })
  })

  describe('getStatus', () => {
    it('returns correct count and max', () => {
      const limits = new ContinuationLimits(false)
      limits.increment('tool_summary')
      const status = limits.getStatus('tool_summary')
      assert.equal(status.count, 1)
      assert.equal(status.max, 2)
    })
  })

  describe('maxIterations', () => {
    it('equals sum of all limit maxes (non-connector)', () => {
      const limits = new ContinuationLimits(false)
      // 3+3+2+2+1+1+1+2+2+2+2+2 = 23
      assert.equal(limits.maxIterations, 23)
    })

    it('equals reduced sum for connector session', () => {
      const limits = new ContinuationLimits(true)
      // 3+3+2+2+0+1+0+0+1+2+1+2 = 17
      assert.equal(limits.maxIterations, 17)
    })
  })

  describe('cross-type independence', () => {
    it('incrementing one type does not affect others', () => {
      const limits = new ContinuationLimits(false)
      limits.increment('recursion')
      limits.increment('recursion')
      assert.equal(limits.getStatus('recursion').count, 2)
      assert.equal(limits.getStatus('transient').count, 0)
      assert.equal(limits.canContinue('transient'), true)
    })

    it('budget exhaustion for one type leaves others unaffected', () => {
      const limits = new ContinuationLimits(false)
      for (let i = 0; i < 3; i++) limits.increment('recursion')
      assert.equal(limits.canContinue('recursion'), false)
      assert.equal(limits.canContinue('transient'), true)
      assert.equal(limits.canContinue('tool_summary'), true)
    })
  })
})
