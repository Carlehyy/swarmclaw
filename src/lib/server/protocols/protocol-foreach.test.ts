import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

let resolveForEachItems: typeof import('@/lib/server/protocols/protocol-foreach').resolveForEachItems

before(async () => {
  process.env.SWARMCLAW_BUILD_MODE = '1'
  const mod = await import('@/lib/server/protocols/protocol-foreach')
  resolveForEachItems = mod.resolveForEachItems
})

after(() => {
  delete process.env.SWARMCLAW_BUILD_MODE
})

function makeRun(overrides: Record<string, unknown> = {}): never {
  return {
    id: 'run-1',
    title: 'Test Run',
    status: 'running',
    steps: [],
    artifacts: [],
    stepOutputs: {},
    ...overrides,
  } as never
}

describe('resolveForEachItems', () => {
  it('literal source returns items array', async () => {
    const items = await resolveForEachItems(
      makeRun(),
      { itemsSource: { type: 'literal', items: ['a', 'b', 'c'] } } as never,
    )
    assert.deepEqual(items, ['a', 'b', 'c'])
  })

  it('step_output source extracts from step data', async () => {
    const run = makeRun({
      stepOutputs: {
        'step-1': { structuredData: ['x', 'y'] },
      },
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'step_output', stepId: 'step-1' } } as never,
    )
    assert.deepEqual(items, ['x', 'y'])
  })

  it('step_output with path extracts nested field', async () => {
    const run = makeRun({
      stepOutputs: {
        'step-1': { structuredData: { results: [1, 2, 3] } },
      },
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'step_output', stepId: 'step-1', path: 'results' } } as never,
    )
    assert.deepEqual(items, [1, 2, 3])
  })

  it('step_output extracts items field from object', async () => {
    const run = makeRun({
      stepOutputs: {
        'step-1': { structuredData: { items: ['a', 'b'] } },
      },
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'step_output', stepId: 'step-1' } } as never,
    )
    assert.deepEqual(items, ['a', 'b'])
  })

  it('step_output wraps non-array object as single item', async () => {
    const run = makeRun({
      stepOutputs: {
        'step-1': { structuredData: { key: 'value' } },
      },
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'step_output', stepId: 'step-1' } } as never,
    )
    assert.deepEqual(items, [{ key: 'value' }])
  })

  it('artifact source by ID', async () => {
    const run = makeRun({
      artifacts: [
        { id: 'art-1', kind: 'report', content: 'Report 1' },
        { id: 'art-2', kind: 'summary', content: 'Summary' },
      ],
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'artifact', artifactId: 'art-1' } } as never,
    )
    assert.deepEqual(items, ['Report 1'])
  })

  it('artifact source by kind', async () => {
    const run = makeRun({
      artifacts: [
        { id: 'art-1', kind: 'report', content: 'R1' },
        { id: 'art-2', kind: 'report', content: 'R2' },
        { id: 'art-3', kind: 'summary', content: 'S1' },
      ],
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'artifact', artifactKind: 'report' } } as never,
    )
    assert.deepEqual(items, ['R1', 'R2'])
  })

  it('artifact source all', async () => {
    const run = makeRun({
      artifacts: [
        { id: 'art-1', kind: 'report', content: 'R1' },
        { id: 'art-2', kind: 'summary', content: 'S1' },
      ],
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'artifact' } } as never,
    )
    assert.deepEqual(items, ['R1', 'S1'])
  })

  it('empty/missing source → empty array', async () => {
    const run = makeRun({ stepOutputs: {} })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'step_output', stepId: 'missing' } } as never,
    )
    assert.deepEqual(items, [])
  })

  it('handles non-array step output path gracefully', async () => {
    const run = makeRun({
      stepOutputs: {
        'step-1': { structuredData: { results: 'not-an-array' } },
      },
    })
    const items = await resolveForEachItems(
      run,
      { itemsSource: { type: 'step_output', stepId: 'step-1', path: 'results' } } as never,
    )
    assert.deepEqual(items, [])
  })
})
