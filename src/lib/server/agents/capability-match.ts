import type { Agent } from '@/types'

/**
 * Check if an agent's capabilities satisfy a task's required capabilities.
 * Returns true if ALL required capabilities are present (case-insensitive).
 * Returns true if requiredCapabilities is empty/undefined (no requirements = always match).
 */
export function matchesCapabilities(
  agentCapabilities: string[] | undefined,
  requiredCapabilities: string[] | undefined,
): boolean {
  if (!requiredCapabilities?.length) return true
  if (!agentCapabilities?.length) return false
  const agentSet = new Set(agentCapabilities.map((c) => c.toLowerCase()))
  return requiredCapabilities.every((req) => agentSet.has(req.toLowerCase()))
}

/**
 * From a list of agents, return those matching all required capabilities.
 * Falls back to full list if requiredCapabilities is empty/undefined.
 */
export function filterAgentsByCapabilities(
  agents: Record<string, Agent>,
  requiredCapabilities: string[] | undefined,
): Agent[] {
  const all = Object.values(agents)
  if (!requiredCapabilities?.length) return all
  return all.filter((a) => matchesCapabilities(a.capabilities, requiredCapabilities))
}

/**
 * Score how well an agent matches required capabilities (0-1).
 * Used for ranking when multiple agents qualify.
 * Returns 1 if all required capabilities are met.
 * Returns fraction of matched capabilities otherwise.
 * Returns 1 if no requirements (vacuously satisfied).
 */
export function capabilityMatchScore(
  agentCapabilities: string[] | undefined,
  requiredCapabilities: string[] | undefined,
): number {
  if (!requiredCapabilities?.length) return 1
  if (!agentCapabilities?.length) return 0
  const agentSet = new Set(agentCapabilities.map((c) => c.toLowerCase()))
  const matched = requiredCapabilities.filter((req) => agentSet.has(req.toLowerCase())).length
  return matched / requiredCapabilities.length
}
