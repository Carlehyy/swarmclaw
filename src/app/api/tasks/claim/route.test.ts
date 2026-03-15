import assert from 'node:assert/strict'
import test from 'node:test'
import { runWithTempDataDir } from '@/lib/server/test-utils/run-with-temp-data-dir'

test('task claim route claims eligible pool tasks and rejects double claims', () => {
  const output = runWithTempDataDir<{
    firstStatus: number
    firstOk: boolean
    secondStatus: number
    secondError: string | null
  }>(`
    const storageMod = await import('./src/lib/server/storage')
    const routeMod = await import('./src/app/api/tasks/claim/route')
    const storage = storageMod.default || storageMod
    const route = routeMod.default || routeMod

    storage.saveTasks({
      pooled: {
        id: 'pooled',
        title: 'Competitive task',
        description: 'Claim me',
        status: 'queued',
        agentId: '',
        assignmentMode: 'pool',
        poolCandidateAgentIds: ['agent-a'],
        claimedByAgentId: null,
        createdAt: 1,
        updatedAt: 1,
      },
    })

    const first = await route.POST(new Request('http://local/api/tasks/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: 'pooled', agentId: 'agent-a' }),
    }))
    const firstPayload = await first.json()

    const second = await route.POST(new Request('http://local/api/tasks/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: 'pooled', agentId: 'agent-a' }),
    }))
    const secondPayload = await second.json()

    console.log(JSON.stringify({
      firstStatus: first.status,
      firstOk: firstPayload?.ok === true,
      secondStatus: second.status,
      secondError: secondPayload?.error || null,
    }))
  `, { prefix: 'swarmclaw-task-claim-route-' })

  assert.equal(output.firstStatus, 200)
  assert.equal(output.firstOk, true)
  assert.equal(output.secondStatus, 409)
  assert.match(String(output.secondError || ''), /already claimed/i)
})
