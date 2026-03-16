import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

let mod: typeof import('@/lib/app/navigation')

before(async () => {
  process.env.SWARMCLAW_BUILD_MODE = '1'
  mod = await import('@/lib/app/navigation')
})

after(() => {
  delete process.env.SWARMCLAW_BUILD_MODE
})

describe('getViewPath', () => {
  it('returns correct path for common views', () => {
    assert.equal(mod.getViewPath('home'), '/home')
    assert.equal(mod.getViewPath('agents'), '/agents')
    assert.equal(mod.getViewPath('mcp_servers'), '/mcp-servers')
    assert.equal(mod.getViewPath('org_chart'), '/org-chart')
  })

  it('appends encoded ID for agents view', () => {
    assert.equal(mod.getViewPath('agents', 'abc-123'), '/agents/abc-123')
  })

  it('appends encoded ID for chatrooms view', () => {
    assert.equal(mod.getViewPath('chatrooms', 'room-1'), '/chatrooms/room-1')
  })

  it('ignores ID for views that do not support it', () => {
    assert.equal(mod.getViewPath('tasks', 'some-id'), '/tasks')
    assert.equal(mod.getViewPath('settings', 'x'), '/settings')
  })

  it('encodes special characters in ID', () => {
    assert.equal(mod.getViewPath('agents', 'foo/bar'), '/agents/foo%2Fbar')
    assert.equal(mod.getViewPath('chatrooms', 'a b&c'), '/chatrooms/a%20b%26c')
  })
})

describe('getMissionPath', () => {
  it('returns /missions when no ID is provided', () => {
    assert.equal(mod.getMissionPath(), '/missions')
    assert.equal(mod.getMissionPath(null), '/missions')
    assert.equal(mod.getMissionPath(''), '/missions')
  })

  it('returns /missions/{encoded} with an ID', () => {
    assert.equal(mod.getMissionPath('m-42'), '/missions/m-42')
    assert.equal(mod.getMissionPath('has/slash'), '/missions/has%2Fslash')
  })
})

describe('pathToView', () => {
  it('matches exact path', () => {
    assert.equal(mod.pathToView('/agents'), 'agents')
    assert.equal(mod.pathToView('/settings'), 'settings')
  })

  it('matches path prefix with trailing segment', () => {
    assert.equal(mod.pathToView('/agents/123'), 'agents')
    assert.equal(mod.pathToView('/missions/m-1/details'), 'missions')
  })

  it('returns null for unknown paths', () => {
    assert.equal(mod.pathToView('/unknown'), null)
    assert.equal(mod.pathToView('/agent'), null)
  })

  it('returns null for empty string', () => {
    assert.equal(mod.pathToView(''), null)
  })
})
