import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

let mod: typeof import('@/lib/server/agents/capability-match')
before(async () => {
  process.env.SWARMCLAW_BUILD_MODE = '1'
  mod = await import('@/lib/server/agents/capability-match')
})
after(() => {
  delete process.env.SWARMCLAW_BUILD_MODE
})

describe('matchesCapabilities', () => {
  it('returns true when no requirements', () => {
    assert.equal(mod.matchesCapabilities(['web'], undefined), true)
    assert.equal(mod.matchesCapabilities(['web'], []), true)
    assert.equal(mod.matchesCapabilities(undefined, undefined), true)
  })

  it('returns false when agent has no capabilities but requirements exist', () => {
    assert.equal(mod.matchesCapabilities(undefined, ['web']), false)
    assert.equal(mod.matchesCapabilities([], ['web']), false)
  })

  it('case-insensitive match', () => {
    assert.equal(mod.matchesCapabilities(['Web', 'CODE'], ['web', 'code']), true)
    assert.equal(mod.matchesCapabilities(['web'], ['WEB']), true)
  })

  it('all-or-nothing — partial match returns false', () => {
    assert.equal(mod.matchesCapabilities(['web'], ['web', 'code']), false)
  })

  it('exact full match returns true', () => {
    assert.equal(mod.matchesCapabilities(['web', 'code'], ['web', 'code']), true)
  })
})

describe('filterAgentsByCapabilities', () => {
  const agents: Record<string, unknown> = {
    a1: { id: 'a1', name: 'A1', capabilities: ['web', 'code'] },
    a2: { id: 'a2', name: 'A2', capabilities: ['web'] },
    a3: { id: 'a3', name: 'A3', capabilities: [] },
  }

  it('returns all agents when no requirements', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mod.filterAgentsByCapabilities(agents as any, undefined)
    assert.equal(result.length, 3)
  })

  it('filters correctly with requirements', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mod.filterAgentsByCapabilities(agents as any, ['web', 'code'])
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'a1')
  })
})

describe('capabilityMatchScore', () => {
  it('returns 1 when no requirements', () => {
    assert.equal(mod.capabilityMatchScore(['web'], undefined), 1)
    assert.equal(mod.capabilityMatchScore(undefined, []), 1)
  })

  it('returns 0 when agent has no capabilities', () => {
    assert.equal(mod.capabilityMatchScore(undefined, ['web']), 0)
    assert.equal(mod.capabilityMatchScore([], ['web']), 0)
  })

  it('returns correct fraction for partial match', () => {
    const score = mod.capabilityMatchScore(['web', 'code'], ['web', 'code', 'deploy'])
    assert.ok(Math.abs(score - 2 / 3) < 0.001)
  })
})
