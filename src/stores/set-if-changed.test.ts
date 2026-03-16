import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setIfChanged, invalidateFingerprint } from './set-if-changed'

type TestStore = { agents: string[]; settings: Record<string, unknown> | null }

function makeSetter() {
  const calls: Partial<TestStore>[] = []
  const set = (partial: Partial<TestStore>) => { calls.push(partial) }
  return { set, calls }
}

describe('setIfChanged', () => {
  it('returns true and calls set() on first write', () => {
    invalidateFingerprint('agents')
    const { set, calls } = makeSetter()
    const result = setIfChanged<TestStore>(set, 'agents', ['a', 'b'])
    assert.equal(result, true)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], { agents: ['a', 'b'] })
  })

  it('returns false and skips set() when JSON matches', () => {
    invalidateFingerprint('agents')
    const { set, calls } = makeSetter()
    setIfChanged<TestStore>(set, 'agents', ['x'])
    const result = setIfChanged<TestStore>(set, 'agents', ['x'])
    assert.equal(result, false)
    assert.equal(calls.length, 1)
  })

  it('returns true when value changes', () => {
    invalidateFingerprint('agents')
    const { set, calls } = makeSetter()
    setIfChanged<TestStore>(set, 'agents', ['a'])
    const result = setIfChanged<TestStore>(set, 'agents', ['a', 'b'])
    assert.equal(result, true)
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1], { agents: ['a', 'b'] })
  })

  it('handles arrays, nested objects, and null values', () => {
    invalidateFingerprint('settings')
    const { set, calls } = makeSetter()

    const nested = { foo: { bar: [1, 2, 3] }, baz: true }
    assert.equal(setIfChanged<TestStore>(set, 'settings', nested), true)
    assert.equal(setIfChanged<TestStore>(set, 'settings', { foo: { bar: [1, 2, 3] }, baz: true }), false)

    assert.equal(setIfChanged<TestStore>(set, 'settings', null), true)
    assert.equal(setIfChanged<TestStore>(set, 'settings', null), false)
    assert.equal(calls.length, 2)
  })
})

describe('invalidateFingerprint', () => {
  it('forces next write through', () => {
    invalidateFingerprint('agents')
    const { set, calls } = makeSetter()
    setIfChanged<TestStore>(set, 'agents', ['same'])
    assert.equal(setIfChanged<TestStore>(set, 'agents', ['same']), false)

    invalidateFingerprint('agents')
    const result = setIfChanged<TestStore>(set, 'agents', ['same'])
    assert.equal(result, true)
    assert.equal(calls.length, 2)
  })

  it('is a no-op for unknown key', () => {
    assert.doesNotThrow(() => invalidateFingerprint('nonexistent_key'))
  })
})
