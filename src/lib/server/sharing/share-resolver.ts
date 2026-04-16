import type { ShareEntityType, ShareLink } from './share-link-repository'
import { loadStoredItem } from '@/lib/server/storage'
import { listMissionReports } from '@/lib/server/missions/mission-repository'

export interface SharedMissionPayload {
  kind: 'mission'
  id: string
  title: string
  goal: string
  successCriteria: string[]
  status: string
  createdAt: number
  milestones: Array<{ at: number; note: string; kind: string }>
  reports: Array<{ at: number; format: string; content: string }>
}

export interface SharedSkillPayload {
  kind: 'skill'
  id: string
  name: string
  description: string
  tags: string[]
  content: string
  sourceFormat: string | null
  createdAt: number | null
}

export interface SharedSessionPayload {
  kind: 'session'
  id: string
  name: string
  agentName: string | null
  messages: Array<{ role: string; text: string; at: number | null }>
  createdAt: number
}

export type SharedPayload = SharedMissionPayload | SharedSkillPayload | SharedSessionPayload

const MAX_MESSAGES = 60
const MAX_MILESTONES = 40
const MAX_REPORTS = 10

export function resolveSharedEntity(link: ShareLink): SharedPayload | null {
  switch (link.entityType) {
    case 'mission':
      return resolveMission(link.entityId)
    case 'skill':
      return resolveSkill(link.entityId)
    case 'session':
      return resolveSession(link.entityId)
    default:
      return null
  }
}

function resolveMission(id: string): SharedMissionPayload | null {
  const raw = loadStoredItem('agent_missions', id) as Record<string, unknown> | null
  if (!raw) return null
  const milestonesRaw = Array.isArray(raw.milestones) ? raw.milestones : []
  const milestones = milestonesRaw
    .slice(-MAX_MILESTONES)
    .map((m) => {
      const entry = (m || {}) as Record<string, unknown>
      return {
        at: typeof entry.at === 'number' ? entry.at : 0,
        note: typeof entry.note === 'string' ? entry.note : '',
        kind: typeof entry.kind === 'string' ? entry.kind : 'note',
      }
    })

  let reports: SharedMissionPayload['reports'] = []
  try {
    const rows = listMissionReports(id, MAX_REPORTS)
    reports = rows.map((r) => ({
      at: r.generatedAt,
      format: String(r.format),
      content: r.body,
    }))
  } catch {
    reports = []
  }

  return {
    kind: 'mission',
    id,
    title: typeof raw.title === 'string' ? raw.title : 'Untitled Mission',
    goal: typeof raw.goal === 'string' ? raw.goal : '',
    successCriteria: Array.isArray(raw.successCriteria)
      ? (raw.successCriteria as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    milestones,
    reports,
  }
}

function resolveSkill(id: string): SharedSkillPayload | null {
  const raw = loadStoredItem('skills', id) as Record<string, unknown> | null
  if (!raw) return null
  return {
    kind: 'skill',
    id,
    name: typeof raw.name === 'string' ? raw.name : 'Unnamed Skill',
    description: typeof raw.description === 'string' ? raw.description : '',
    tags: Array.isArray(raw.tags)
      ? (raw.tags as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    content: typeof raw.content === 'string' ? raw.content : '',
    sourceFormat: typeof raw.sourceFormat === 'string' ? raw.sourceFormat : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : null,
  }
}

function resolveSession(id: string): SharedSessionPayload | null {
  const raw = loadStoredItem('sessions', id) as Record<string, unknown> | null
  if (!raw) return null
  const messagesRaw = Array.isArray(raw.messages) ? raw.messages : []
  const messages = messagesRaw.slice(-MAX_MESSAGES).map((m) => {
    const entry = (m || {}) as Record<string, unknown>
    return {
      role: typeof entry.role === 'string' ? entry.role : 'unknown',
      text: typeof entry.content === 'string' ? entry.content : '',
      at: typeof entry.at === 'number' ? entry.at : null,
    }
  })

  let agentName: string | null = null
  const agentId = typeof raw.agentId === 'string' ? raw.agentId : null
  if (agentId) {
    const agent = loadStoredItem('agents', agentId) as Record<string, unknown> | null
    if (agent && typeof agent.name === 'string') agentName = agent.name
  }

  return {
    kind: 'session',
    id,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled Session',
    agentName,
    messages,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
  }
}

/**
 * Shape enforced on every outbound shared payload: fields that should never
 * leak off-instance. Reasons kept on the function to keep the allowlist obvious.
 */
export const SHARE_ALLOWED_ENTITY_TYPES: readonly ShareEntityType[] = [
  'mission',
  'skill',
  'session',
] as const
