/**
 * Pure functions for the org-chart feature.
 * No server imports — usable from both client and server.
 */

import type { Agent } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgTreeNode {
  agent: Agent
  children: OrgTreeNode[]
  depth: number
  teamLabel: string | null
  teamColor: string | null
}

// ---------------------------------------------------------------------------
// 1. buildOrgTree
// ---------------------------------------------------------------------------

export function buildOrgTree(agents: Record<string, Agent>): {
  roots: OrgTreeNode[]
  unattached: Agent[]
} {
  // Filter out trashed agents
  const live = Object.values(agents).filter((a) => !a.trashedAt)

  // Index by id for fast lookup
  const byId = new Map<string, Agent>()
  for (const a of live) byId.set(a.id, a)

  // Build children map: parentId -> child agents
  const childrenOf = new Map<string, Agent[]>()
  for (const a of live) {
    const pid = a.orgChart?.parentId
    if (pid && byId.has(pid)) {
      const list = childrenOf.get(pid)
      if (list) list.push(a)
      else childrenOf.set(pid, [a])
    }
  }

  // Track IDs that appear as children of some parent
  const hasParent = new Set<string>()
  for (const a of live) {
    const pid = a.orgChart?.parentId
    if (pid && byId.has(pid)) hasParent.add(a.id)
  }

  // Recursive tree builder (with cycle detection for corrupt parentId chains)
  function buildNode(agent: Agent, depth: number, visited = new Set<string>()): OrgTreeNode {
    if (visited.has(agent.id)) {
      return { agent, children: [], depth, teamLabel: null, teamColor: null }
    }
    visited.add(agent.id)
    const kids = childrenOf.get(agent.id) ?? []
    return {
      agent,
      children: kids.map((c) => buildNode(c, depth + 1, visited)),
      depth,
      teamLabel: agent.orgChart?.teamLabel ?? null,
      teamColor: agent.orgChart?.teamColor ?? null,
    }
  }

  const roots: OrgTreeNode[] = []
  const unattached: Agent[] = []

  for (const a of live) {
    // Skip agents that have a valid parent in the tree
    if (hasParent.has(a.id)) continue

    const isCoordinator = a.role === 'coordinator'
    const hasChildren = (childrenOf.get(a.id)?.length ?? 0) > 0
    const hasExplicitPosition = a.orgChart?.x != null && a.orgChart?.y != null

    if (isCoordinator || hasChildren || hasExplicitPosition) {
      roots.push(buildNode(a, 0))
    } else {
      unattached.push(a)
    }
  }

  return { roots, unattached }
}

// ---------------------------------------------------------------------------
// 2. layoutTree — Reingold-Tilford-style top-down layout
// ---------------------------------------------------------------------------

interface LayoutOpts {
  nodeWidth?: number
  nodeHeight?: number
  levelGap?: number
  siblingGap?: number
}

export function layoutTree(
  roots: OrgTreeNode[],
  opts?: LayoutOpts,
): Map<string, { x: number; y: number }> {
  const nodeWidth = opts?.nodeWidth ?? 200
  const nodeHeight = opts?.nodeHeight ?? 110
  const levelGap = opts?.levelGap ?? 120
  const siblingGap = opts?.siblingGap ?? 40

  const positions = new Map<string, { x: number; y: number }>()
  const cellWidth = nodeWidth + siblingGap

  // First pass: compute subtree width (in cells) for each node
  function subtreeWidth(node: OrgTreeNode): number {
    if (node.children.length === 0) return 1
    let total = 0
    for (const c of node.children) total += subtreeWidth(c)
    return total
  }

  // Second pass: assign x positions given a left offset (in px)
  function assignPositions(node: OrgTreeNode, leftX: number): void {
    const w = subtreeWidth(node)
    const span = w * cellWidth - siblingGap // total span of this subtree
    const centerX = leftX + span / 2
    const y = node.depth * (nodeHeight + levelGap)

    // Store left-edge x (not center) for CSS positioning
    positions.set(node.agent.id, { x: centerX - nodeWidth / 2, y })

    // Lay out children left to right within this subtree's span
    let childLeft = leftX
    for (const c of node.children) {
      assignPositions(c, childLeft)
      childLeft += subtreeWidth(c) * cellWidth
    }
  }

  // Lay out each root tree side by side
  let offsetX = 0
  for (const root of roots) {
    assignPositions(root, offsetX)
    offsetX += subtreeWidth(root) * cellWidth
  }

  return positions
}

// ---------------------------------------------------------------------------
// 3. computeOrgChartMove
// ---------------------------------------------------------------------------

export function computeOrgChartMove(
  agents: Record<string, Agent>,
  agentId: string,
  newParentId: string | null,
): Array<{ id: string; patch: Partial<Agent> }> {
  const agent = agents[agentId]
  if (!agent || agentId === newParentId) return []

  const patches: Array<{ id: string; patch: Partial<Agent> }> = []
  const oldParentId = agent.orgChart?.parentId ?? null

  // Patch the moved agent
  patches.push({
    id: agentId,
    patch: {
      orgChart: {
        ...agent.orgChart,
        parentId: newParentId,
      },
    },
  })

  // Remove from old parent's delegation target list if applicable
  if (oldParentId && oldParentId !== newParentId) {
    const oldParent = agents[oldParentId]
    if (
      oldParent &&
      oldParent.delegationTargetMode === 'selected' &&
      oldParent.delegationTargetAgentIds?.includes(agentId)
    ) {
      patches.push({
        id: oldParentId,
        patch: {
          delegationTargetAgentIds: oldParent.delegationTargetAgentIds.filter(
            (id) => id !== agentId,
          ),
        },
      })
    }
  }

  // Add to new parent's delegation target list if applicable
  if (newParentId && newParentId !== oldParentId) {
    const newParent = agents[newParentId]
    if (
      newParent &&
      newParent.role === 'coordinator' &&
      newParent.delegationTargetMode === 'selected'
    ) {
      const existing = newParent.delegationTargetAgentIds ?? []
      if (!existing.includes(agentId)) {
        patches.push({
          id: newParentId,
          patch: {
            delegationTargetAgentIds: [...existing, agentId],
          },
        })
      }
    }
  }

  return patches
}

// ---------------------------------------------------------------------------
// 4. getDescendantIds
// ---------------------------------------------------------------------------

export function getDescendantIds(roots: OrgTreeNode[], agentId: string): Set<string> {
  const result = new Set<string>()
  function findAndCollect(node: OrgTreeNode): boolean {
    if (node.agent.id === agentId) {
      // Found the node — collect all descendants
      function collectAll(n: OrgTreeNode) {
        for (const child of n.children) {
          result.add(child.agent.id)
          collectAll(child)
        }
      }
      collectAll(node)
      return true
    }
    for (const child of node.children) {
      if (findAndCollect(child)) return true
    }
    return false
  }
  for (const root of roots) {
    if (findAndCollect(root)) break
  }
  return result
}

// ---------------------------------------------------------------------------
// 5. resolveTeamColor
// ---------------------------------------------------------------------------

export function resolveTeamColor(agents: Record<string, Agent>, teamLabel: string): string | null {
  const colorCounts = new Map<string, number>()
  for (const agent of Object.values(agents)) {
    if (agent.orgChart?.teamLabel === teamLabel && agent.orgChart?.teamColor) {
      const c = agent.orgChart.teamColor
      colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1)
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [color, count] of colorCounts) {
    if (count > bestCount) { best = color; bestCount = count }
  }
  return best
}

// ---------------------------------------------------------------------------
// 6. deriveTeams
// ---------------------------------------------------------------------------

export function deriveTeams(
  agents: Record<string, Agent>,
): Array<{ label: string; color: string | null; agentIds: string[] }> {
  const teamMap = new Map<string, { color: string | null; agentIds: string[] }>()

  for (const agent of Object.values(agents)) {
    const label = agent.orgChart?.teamLabel
    if (!label) continue

    const existing = teamMap.get(label)
    if (existing) {
      existing.agentIds.push(agent.id)
      // Prefer first non-null color found
      if (existing.color === null && agent.orgChart?.teamColor) {
        existing.color = agent.orgChart.teamColor
      }
    } else {
      teamMap.set(label, {
        color: agent.orgChart?.teamColor ?? null,
        agentIds: [agent.id],
      })
    }
  }

  return Array.from(teamMap.entries()).map(([label, data]) => ({
    label,
    color: data.color,
    agentIds: data.agentIds,
  }))
}
