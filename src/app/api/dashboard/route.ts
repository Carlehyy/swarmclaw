import { NextResponse } from 'next/server'
import {
  loadAgents,
  loadTasks,
  loadUsage,
  loadActivity,
  loadConnectors,
  loadSessions,
} from '@/lib/server/storage'
import { checkAgentBudgetLimits } from '@/lib/server/cost'
import type { Agent, BoardTask, UsageRecord } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  // Load all data
  const agents = loadAgents() as Record<string, Agent>
  const tasks = loadTasks() as Record<string, BoardTask>
  const usage = loadUsage()
  const activity = loadActivity() as Record<string, Record<string, unknown>>
  const connectors = loadConnectors() as Record<string, Record<string, unknown>>
  const sessions = loadSessions()

  // --- Agent stats ---
  const allAgents = Object.values(agents)
  const activeAgents = allAgents.filter((a) => !a.trashedAt)
  const budgetWarnings: string[] = []
  for (const agent of activeAgents) {
    const check = checkAgentBudgetLimits(agent, now, { sessions: sessions as unknown as Record<string, Record<string, unknown>>, usage })
    if (check.warnings.length > 0 || !check.ok) {
      budgetWarnings.push(agent.id)
    }
  }

  // --- Task stats ---
  const allTasks = Object.values(tasks)
  const tasksByStatus: Record<string, number> = {}
  for (const t of allTasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1
  }
  const completed7d = allTasks.filter((t) => t.status === 'completed' && typeof t.completedAt === 'number' && t.completedAt >= sevenDaysAgo).length
  const completed30d = allTasks.filter((t) => t.status === 'completed' && typeof t.completedAt === 'number' && t.completedAt >= thirtyDaysAgo).length
  const total7d = allTasks.filter((t) => typeof t.createdAt === 'number' && t.createdAt >= sevenDaysAgo).length
  const total30d = allTasks.filter((t) => typeof t.createdAt === 'number' && t.createdAt >= thirtyDaysAgo).length

  // --- Cost stats ---
  let totalSpend = 0
  let spend7d = 0
  let spend30d = 0
  const spendByAgent: Record<string, number> = {}
  const dailySpend: Record<string, number> = {}

  for (const records of Object.values(usage)) {
    if (!Array.isArray(records)) continue
    for (const record of records) {
      const r = record as UsageRecord
      const cost = typeof r?.estimatedCost === 'number' ? r.estimatedCost : 0
      if (!Number.isFinite(cost) || cost <= 0) continue
      const ts = typeof r?.timestamp === 'number' ? r.timestamp : 0

      totalSpend += cost
      if (ts >= sevenDaysAgo) spend7d += cost
      if (ts >= thirtyDaysAgo) spend30d += cost

      // Per-agent spend (use agentId from record if available)
      const agentId = r.agentId || null
      if (agentId) {
        spendByAgent[agentId] = (spendByAgent[agentId] || 0) + cost
      }

      // Daily trend (last 30 days)
      if (ts >= thirtyDaysAgo) {
        const day = new Date(ts).toISOString().slice(0, 10)
        dailySpend[day] = (dailySpend[day] || 0) + cost
      }
    }
  }

  const topAgentsByCost = Object.entries(spendByAgent)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([agentId, cost]) => ({
      agentId,
      agentName: agents[agentId]?.name || agentId,
      cost: Math.round(cost * 10000) / 10000,
    }))

  // --- Connector stats ---
  const allConnectors = Object.values(connectors)
  const activeConnectors = allConnectors.filter((c) => c.status === 'running' || c.isEnabled === true).length

  // --- Recent activity ---
  const activityEntries = Object.values(activity) as Array<Record<string, unknown>>
  activityEntries.sort((a, b) => (b.timestamp as number) - (a.timestamp as number))
  const recentActivity = activityEntries.slice(0, 10)

  return NextResponse.json({
    agents: {
      total: activeAgents.length,
      budgetWarnings: budgetWarnings.length,
      budgetWarningAgentIds: budgetWarnings,
    },
    tasks: {
      total: allTasks.length,
      byStatus: tasksByStatus,
      completedVsCreated7d: total7d > 0 ? Math.round((completed7d / total7d) * 100) : 0,
      completedVsCreated30d: total30d > 0 ? Math.round((completed30d / total30d) * 100) : 0,
      completed7d,
      completed30d,
    },
    cost: {
      total: Math.round(totalSpend * 10000) / 10000,
      spend7d: Math.round(spend7d * 10000) / 10000,
      spend30d: Math.round(spend30d * 10000) / 10000,
      topAgentsByCost,
      dailyTrend: Object.entries(dailySpend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, cost]) => ({ date, cost: Math.round(cost * 10000) / 10000 })),
    },
    connectors: {
      total: allConnectors.length,
      active: activeConnectors,
    },
    recentActivity,
  })
}
