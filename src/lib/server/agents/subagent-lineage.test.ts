import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

let lineage: typeof import('@/lib/server/agents/subagent-lineage')

before(async () => {
  process.env.SWARMCLAW_BUILD_MODE = '1'
  lineage = await import('@/lib/server/agents/subagent-lineage')
})

after(() => {
  delete process.env.SWARMCLAW_BUILD_MODE
})

describe('subagent-lineage', () => {
  before(() => {
    lineage._clearLineage()
  })

  describe('createLineageNode', () => {
    it('creates a root node with depth 0 and initializing status', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'session-root',
        agentId: 'agent-1',
        agentName: 'Agent One',
        task: 'Do something',
      })

      assert.equal(node.depth, 0)
      assert.equal(node.parentId, null)
      assert.equal(node.parentSessionId, null)
      assert.equal(node.sessionId, 'session-root')
      assert.equal(node.agentId, 'agent-1')
      assert.equal(node.agentName, 'Agent One')
      assert.equal(node.status, 'initializing')
      assert.equal(node.task, 'Do something')
      assert.ok(node.id)
      assert.ok(node.createdAt > 0)
      assert.equal(node.completedAt, null)
      assert.equal(node.resultPreview, null)
      assert.equal(node.error, null)
    })

    it('creates a child node with correct depth and parent reference', () => {
      lineage._clearLineage()
      const parent = lineage.createLineageNode({
        sessionId: 'session-parent',
        agentId: 'agent-1',
        agentName: 'Parent Agent',
        task: 'Parent task',
      })

      const child = lineage.createLineageNode({
        sessionId: 'session-child',
        agentId: 'agent-2',
        agentName: 'Child Agent',
        parentSessionId: 'session-parent',
        task: 'Child task',
      })

      assert.equal(child.depth, 1)
      assert.equal(child.parentId, parent.id)
      assert.equal(child.parentSessionId, 'session-parent')
    })

    it('creates deeply nested nodes with increasing depth', () => {
      lineage._clearLineage()
      lineage.createLineageNode({
        sessionId: 's-0',
        agentId: 'a',
        agentName: 'A',
        task: 'Level 0',
      })
      lineage.createLineageNode({
        sessionId: 's-1',
        agentId: 'b',
        agentName: 'B',
        parentSessionId: 's-0',
        task: 'Level 1',
      })
      const deep = lineage.createLineageNode({
        sessionId: 's-2',
        agentId: 'c',
        agentName: 'C',
        parentSessionId: 's-1',
        task: 'Level 2',
      })

      assert.equal(deep.depth, 2)
    })
  })

  describe('lifecycle status', () => {
    it('follows happy path: initializing → ready → running → completed', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'happy',
        agentId: 'ag',
        agentName: 'Happy',
        task: 'test',
      })

      lineage.setLineageStatus(node.id, 'ready')
      assert.equal(lineage.getLineageNode(node.id)?.status, 'ready')

      lineage.setLineageStatus(node.id, 'running')
      assert.equal(lineage.getLineageNode(node.id)?.status, 'running')

      const completed = lineage.completeLineageNode(node.id, 'done')
      assert.equal(completed?.status, 'completed')
      assert.ok(completed?.completedAt)
    })

    it('handles waiting state: running → waiting → running → completed', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'spawn-path',
        agentId: 'ag',
        agentName: 'Spawn',
        task: 'test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')
      lineage.setLineageStatus(node.id, 'waiting')
      assert.equal(lineage.getLineageNode(node.id)?.status, 'waiting')

      lineage.setLineageStatus(node.id, 'running')
      assert.equal(lineage.getLineageNode(node.id)?.status, 'running')

      lineage.completeLineageNode(node.id, 'done')
      assert.equal(lineage.getLineageNode(node.id)?.status, 'completed')
    })

    it('handles failure from running state', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'fail-running',
        agentId: 'ag',
        agentName: 'Fail',
        task: 'test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')

      const failed = lineage.failLineageNode(node.id, 'Something broke')
      assert.equal(failed?.status, 'failed')
      assert.equal(failed?.error, 'Something broke')
    })

    it('handles failure from initializing state', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'fail-init',
        agentId: 'ag',
        agentName: 'FailInit',
        task: 'test',
      })
      const failed = lineage.failLineageNode(node.id, 'Init error')
      assert.equal(failed?.status, 'failed')
    })

    it('handles cancellation from any non-terminal state', () => {
      const states: Array<{ label: string; status: import('@/lib/server/agents/subagent-lineage').SubagentState }> = [
        { label: 'initializing', status: 'initializing' },
        { label: 'ready', status: 'ready' },
        { label: 'running', status: 'running' },
        { label: 'waiting', status: 'waiting' },
      ]

      for (const { label, status } of states) {
        lineage._clearLineage()
        const node = lineage.createLineageNode({
          sessionId: `cancel-from-${label}`,
          agentId: 'ag',
          agentName: 'Cancel',
          task: 'test',
        })
        if (status !== 'initializing') {
          lineage.setLineageStatus(node.id, status)
        }
        const cancelled = lineage.cancelLineageNode(node.id)
        assert.equal(cancelled?.status, 'cancelled', `Should cancel from ${label}`)
      }
    })

    it('does not update terminal nodes via setLineageStatus', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'terminal',
        agentId: 'ag',
        agentName: 'T',
        task: 'test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')
      lineage.completeLineageNode(node.id, 'done')

      // setLineageStatus should be a no-op on terminal nodes
      const result = lineage.setLineageStatus(node.id, 'running')
      assert.equal(result?.status, 'completed')
    })

    it('completeLineageNode is a no-op on already terminal node', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'double-complete',
        agentId: 'ag',
        agentName: 'T',
        task: 'test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')
      lineage.failLineageNode(node.id, 'failed first')

      // Trying to complete a failed node returns the node unchanged
      const result = lineage.completeLineageNode(node.id, 'should not work')
      assert.equal(result?.status, 'failed')
      assert.equal(result?.error, 'failed first')
    })
  })

  describe('isTerminalState', () => {
    it('identifies terminal states correctly', () => {
      assert.equal(lineage.isTerminalState('completed'), true)
      assert.equal(lineage.isTerminalState('failed'), true)
      assert.equal(lineage.isTerminalState('cancelled'), true)
      assert.equal(lineage.isTerminalState('timed_out'), true)
      assert.equal(lineage.isTerminalState('initializing'), false)
      assert.equal(lineage.isTerminalState('ready'), false)
      assert.equal(lineage.isTerminalState('running'), false)
      assert.equal(lineage.isTerminalState('waiting'), false)
    })
  })

  describe('getLineageNode / getLineageNodeBySession', () => {
    it('retrieves by node ID', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'sess-get',
        agentId: 'ag',
        agentName: 'Ag',
        task: 'Get test',
      })

      const retrieved = lineage.getLineageNode(node.id)
      assert.deepEqual(retrieved, node)
    })

    it('retrieves by session ID', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'sess-by-session',
        agentId: 'ag',
        agentName: 'Ag',
        task: 'By session test',
      })

      const retrieved = lineage.getLineageNodeBySession('sess-by-session')
      assert.equal(retrieved?.id, node.id)
    })

    it('returns null for unknown IDs', () => {
      assert.equal(lineage.getLineageNode('nonexistent'), null)
      assert.equal(lineage.getLineageNodeBySession('nonexistent'), null)
    })
  })

  describe('status updates', () => {
    it('completes a node with result preview', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'sess-complete',
        agentId: 'ag',
        agentName: 'Ag',
        task: 'Complete test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')

      const completed = lineage.completeLineageNode(node.id, 'Task finished successfully')
      assert.equal(completed?.status, 'completed')
      assert.equal(completed?.resultPreview, 'Task finished successfully')
      assert.ok(completed?.completedAt)
    })

    it('fails a node with error', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'sess-fail',
        agentId: 'ag',
        agentName: 'Ag',
        task: 'Fail test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')

      const failed = lineage.failLineageNode(node.id, 'Something went wrong')
      assert.equal(failed?.status, 'failed')
      assert.equal(failed?.error, 'Something went wrong')
      assert.ok(failed?.completedAt)
    })

    it('cancels a node', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'sess-cancel',
        agentId: 'ag',
        agentName: 'Ag',
        task: 'Cancel test',
      })

      const cancelled = lineage.cancelLineageNode(node.id)
      assert.equal(cancelled?.status, 'cancelled')
      assert.ok(cancelled?.completedAt)
    })
  })

  describe('tree queries', () => {
    function buildTree() {
      lineage._clearLineage()
      const root = lineage.createLineageNode({
        sessionId: 'root',
        agentId: 'ag-root',
        agentName: 'Root',
        task: 'Root task',
      })
      const childA = lineage.createLineageNode({
        sessionId: 'child-a',
        agentId: 'ag-a',
        agentName: 'Child A',
        parentSessionId: 'root',
        task: 'Child A task',
      })
      const childB = lineage.createLineageNode({
        sessionId: 'child-b',
        agentId: 'ag-b',
        agentName: 'Child B',
        parentSessionId: 'root',
        task: 'Child B task',
      })
      const gcA1 = lineage.createLineageNode({
        sessionId: 'gc-a1',
        agentId: 'ag-gc1',
        agentName: 'GC A1',
        parentSessionId: 'child-a',
        task: 'GC A1 task',
      })
      const gcA2 = lineage.createLineageNode({
        sessionId: 'gc-a2',
        agentId: 'ag-gc2',
        agentName: 'GC A2',
        parentSessionId: 'child-a',
        task: 'GC A2 task',
      })
      return { root, childA, childB, gcA1, gcA2 }
    }

    it('getChildren returns direct children', () => {
      const { root, childA, childB } = buildTree()
      const children = lineage.getChildren(root.id)
      assert.equal(children.length, 2)
      assert.ok(children.some((c) => c.id === childA.id))
      assert.ok(children.some((c) => c.id === childB.id))
    })

    it('getAncestors returns path to root', () => {
      const { root, childA, gcA1 } = buildTree()
      const ancestors = lineage.getAncestors(gcA1.id)
      assert.equal(ancestors.length, 2)
      assert.equal(ancestors[0].id, childA.id)
      assert.equal(ancestors[1].id, root.id)
    })

    it('getAncestors returns empty for root', () => {
      const { root } = buildTree()
      const ancestors = lineage.getAncestors(root.id)
      assert.equal(ancestors.length, 0)
    })

    it('getDescendants returns all descendants', () => {
      const { root } = buildTree()
      const descendants = lineage.getDescendants(root.id)
      assert.equal(descendants.length, 4)
    })

    it('getSiblings returns sibling nodes', () => {
      const { childA, childB } = buildTree()
      const siblings = lineage.getSiblings(childA.id)
      assert.equal(siblings.length, 1)
      assert.equal(siblings[0].id, childB.id)
    })

    it('buildLineageTree builds recursive tree', () => {
      const { root, childA, gcA1, gcA2 } = buildTree()
      const tree = lineage.buildLineageTree(root.id)
      assert.ok(tree)
      assert.equal(tree.node.id, root.id)
      assert.equal(tree.children.length, 2)

      const treeA = tree.children.find((c) => c.node.id === childA.id)
      assert.ok(treeA)
      assert.equal(treeA.children.length, 2)
      assert.ok(treeA.children.some((c) => c.node.id === gcA1.id))
      assert.ok(treeA.children.some((c) => c.node.id === gcA2.id))
    })

    it('getRootNodes returns only root-level nodes', () => {
      buildTree()
      const roots = lineage.getRootNodes()
      assert.equal(roots.length, 1)
      assert.equal(roots[0].sessionId, 'root')
    })

    it('getRootAncestor finds the root from any descendant', () => {
      const { root, gcA2 } = buildTree()
      const rootAncestor = lineage.getRootAncestor(gcA2.id)
      assert.equal(rootAncestor?.id, root.id)
    })

    it('getMaxDepth returns deepest level', () => {
      const { root } = buildTree()
      const maxDepth = lineage.getMaxDepth(root.id)
      assert.equal(maxDepth, 2)
    })
  })

  describe('cancelSubtree', () => {
    it('cancels a node and all active descendants', () => {
      lineage._clearLineage()
      const root = lineage.createLineageNode({
        sessionId: 'st-root',
        agentId: 'ag',
        agentName: 'R',
        task: 'Root',
      })
      const child = lineage.createLineageNode({
        sessionId: 'st-child',
        agentId: 'ag',
        agentName: 'C',
        parentSessionId: 'st-root',
        task: 'Child',
      })
      lineage.createLineageNode({
        sessionId: 'st-gc',
        agentId: 'ag',
        agentName: 'GC',
        parentSessionId: 'st-child',
        task: 'Grandchild',
      })

      // Complete the child first so it should NOT be cancelled
      lineage.setLineageStatus(child.id, 'ready')
      lineage.setLineageStatus(child.id, 'running')
      lineage.completeLineageNode(child.id, 'done')

      const cancelled = lineage.cancelSubtree(root.id)
      // root (initializing) + grandchild (initializing) = 2 cancelled, child (completed) skipped
      assert.equal(cancelled, 2)
      assert.equal(lineage.getLineageNode(root.id)?.status, 'cancelled')
      assert.equal(lineage.getLineageNode(child.id)?.status, 'completed') // untouched
      assert.equal(lineage.getLineageNodeBySession('st-gc')?.status, 'cancelled')
    })
  })

  describe('cleanupTerminalNodes', () => {
    it('removes old terminal nodes', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'cleanup-sess',
        agentId: 'ag',
        agentName: 'Cleanup',
        task: 'test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')
      lineage.completeLineageNode(node.id, 'done')

      const removed = lineage.cleanupTerminalNodes(-1)
      assert.equal(removed.length, 1)
      assert.equal(lineage.getLineageNode(node.id), null)
      assert.equal(lineage.getLineageNodeBySession('cleanup-sess'), null)
    })

    it('does not remove active nodes', () => {
      lineage._clearLineage()
      const node = lineage.createLineageNode({
        sessionId: 'active-sess',
        agentId: 'ag',
        agentName: 'Active',
        task: 'test',
      })
      lineage.setLineageStatus(node.id, 'ready')
      lineage.setLineageStatus(node.id, 'running')

      const removed = lineage.cleanupTerminalNodes(0)
      assert.equal(removed.length, 0)
      assert.ok(lineage.getLineageNode(node.id))
    })
  })

  describe('listLineageNodes with query', () => {
    it('filters by status', () => {
      lineage._clearLineage()
      const a = lineage.createLineageNode({
        sessionId: 'q-a',
        agentId: 'ag',
        agentName: 'A',
        task: 'Task A',
      })
      lineage.createLineageNode({
        sessionId: 'q-b',
        agentId: 'ag',
        agentName: 'B',
        task: 'Task B',
      })
      lineage.setLineageStatus(a.id, 'ready')
      lineage.setLineageStatus(a.id, 'running')
      lineage.completeLineageNode(a.id, 'done')

      const initializing = lineage.listLineageNodes({ status: 'initializing' })
      assert.equal(initializing.length, 1)
      assert.equal(initializing[0].sessionId, 'q-b')

      const completed = lineage.listLineageNodes({ status: 'completed' })
      assert.equal(completed.length, 1)
      assert.equal(completed[0].sessionId, 'q-a')
    })

    it('filters by depth range', () => {
      lineage._clearLineage()
      lineage.createLineageNode({
        sessionId: 'd-0',
        agentId: 'ag',
        agentName: 'D0',
        task: 'Depth 0',
      })
      lineage.createLineageNode({
        sessionId: 'd-1',
        agentId: 'ag',
        agentName: 'D1',
        parentSessionId: 'd-0',
        task: 'Depth 1',
      })
      lineage.createLineageNode({
        sessionId: 'd-2',
        agentId: 'ag',
        agentName: 'D2',
        parentSessionId: 'd-1',
        task: 'Depth 2',
      })

      const deep = lineage.listLineageNodes({ minDepth: 1, maxDepth: 1 })
      assert.equal(deep.length, 1)
      assert.equal(deep[0].sessionId, 'd-1')
    })
  })
})
