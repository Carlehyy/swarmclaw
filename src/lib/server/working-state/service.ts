import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

import { genId } from '@/lib/id'
import { buildLLM } from '@/lib/server/build-llm'
import { log } from '@/lib/server/logger'
import type {
  EvidenceRef,
  MessageToolEvent,
  Mission,
  SessionWorkingState,
  WorkingArtifact,
  WorkingArtifactPatch,
  WorkingBlocker,
  WorkingBlockerPatch,
  WorkingDecision,
  WorkingDecisionPatch,
  WorkingFact,
  WorkingFactPatch,
  WorkingHypothesis,
  WorkingHypothesisPatch,
  WorkingPlanStep,
  WorkingPlanStepPatch,
  WorkingQuestion,
  WorkingQuestionPatch,
  WorkingStateItemStatus,
  WorkingStatePatch,
  WorkingStateStatus,
} from '@/types'

import {
  deletePersistedWorkingState,
  loadPersistedWorkingState,
  upsertPersistedWorkingState,
} from './repository'

const TAG = 'working-state'

const MAX_PLAN_STEPS = 12
const MAX_CONFIRMED_FACTS = 20
const MAX_ARTIFACTS = 20
const MAX_DECISIONS = 12
const MAX_BLOCKERS = 8
const MAX_OPEN_QUESTIONS = 8
const MAX_HYPOTHESES = 8
const MAX_EVIDENCE_REFS = 40
const EXTRACTION_TIMEOUT_MS = 7_500

const ACTIVE_STATUS: WorkingStateItemStatus = 'active'

const WorkingItemStatusSchema = z.enum(['active', 'resolved', 'superseded'])
const WorkingStateStatusSchema = z.enum(['idle', 'progress', 'blocked', 'waiting', 'completed'])

const WorkingPlanStepPatchSchema = z.object({
  id: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
})

const WorkingFactPatchSchema = z.object({
  id: z.string().optional().nullable(),
  statement: z.string().optional().nullable(),
  source: z.enum(['user', 'tool', 'assistant', 'mission', 'system']).optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
  evidenceIds: z.array(z.string()).optional().nullable(),
})

const WorkingArtifactPatchSchema = z.object({
  id: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  kind: z.enum(['file', 'url', 'approval', 'message', 'other']).optional().nullable(),
  path: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  sourceTool: z.string().optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
  evidenceIds: z.array(z.string()).optional().nullable(),
})

const WorkingDecisionPatchSchema = z.object({
  id: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  rationale: z.string().optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
  evidenceIds: z.array(z.string()).optional().nullable(),
})

const WorkingBlockerPatchSchema = z.object({
  id: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  kind: z.enum(['approval', 'credential', 'human_input', 'external_dependency', 'error', 'other']).optional().nullable(),
  nextAction: z.string().optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
  evidenceIds: z.array(z.string()).optional().nullable(),
})

const WorkingQuestionPatchSchema = z.object({
  id: z.string().optional().nullable(),
  question: z.string().optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
  evidenceIds: z.array(z.string()).optional().nullable(),
})

const WorkingHypothesisPatchSchema = z.object({
  id: z.string().optional().nullable(),
  statement: z.string().optional().nullable(),
  confidence: z.enum(['low', 'medium', 'high']).optional().nullable(),
  status: WorkingItemStatusSchema.optional().nullable(),
  evidenceIds: z.array(z.string()).optional().nullable(),
})

const WorkingStatePatchSchema = z.object({
  objective: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  constraints: z.array(z.string()).optional().nullable(),
  successCriteria: z.array(z.string()).optional().nullable(),
  status: WorkingStateStatusSchema.optional().nullable(),
  nextAction: z.string().optional().nullable(),
  planSteps: z.array(WorkingPlanStepPatchSchema).optional().nullable(),
  factsUpsert: z.array(WorkingFactPatchSchema).optional().nullable(),
  artifactsUpsert: z.array(WorkingArtifactPatchSchema).optional().nullable(),
  decisionsAppend: z.array(WorkingDecisionPatchSchema).optional().nullable(),
  blockersUpsert: z.array(WorkingBlockerPatchSchema).optional().nullable(),
  questionsUpsert: z.array(WorkingQuestionPatchSchema).optional().nullable(),
  hypothesesUpsert: z.array(WorkingHypothesisPatchSchema).optional().nullable(),
  supersedeIds: z.array(z.string()).optional().nullable(),
}).passthrough()

type TimedWorkingItem = {
  id: string
  status: WorkingStateItemStatus
  createdAt: number
  updatedAt: number
}

type UpsertConfig<TItem extends TimedWorkingItem, TPatch> = {
  max: number
  getPatchId: (patch: TPatch) => string | null
  getPatchKey: (patch: TPatch) => string
  getItemKey: (item: TItem) => string
  create: (patch: TPatch, nowTs: number) => TItem
  merge: (current: TItem, patch: TPatch, nowTs: number) => TItem
  compact?: (items: TItem[], max: number) => TItem[]
}

export interface WorkingStateDeterministicUpdateInput {
  sessionId: string
  mission?: Mission | null
  message?: string | null
  assistantText?: string | null
  error?: string | null
  toolEvents?: MessageToolEvent[]
  runId?: string | null
  source?: string | null
}

export interface WorkingStateExtractionInput extends WorkingStateDeterministicUpdateInput {
  agentId?: string | null
  currentState?: SessionWorkingState | null
}

export interface SynchronizeWorkingStateForTurnInput extends WorkingStateExtractionInput {}

function now(): number {
  return Date.now()
}

function cleanText(value: unknown, max = 320): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanMultiline(value: unknown, max = 1200): string {
  if (typeof value !== 'string') return ''
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max)
    .trim()
}

function normalizeList(input: unknown, maxItems: number, maxChars = 240): string[] {
  const values = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = cleanText(value, maxChars)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
    if (out.length >= maxItems) break
  }
  return out
}

function normalizeItemStatus(value: unknown, fallback: WorkingStateItemStatus = ACTIVE_STATUS): WorkingStateItemStatus {
  return value === 'active' || value === 'resolved' || value === 'superseded'
    ? value
    : fallback
}

function normalizeStateStatus(value: unknown, fallback: WorkingStateStatus = 'idle'): WorkingStateStatus {
  return value === 'idle' || value === 'progress' || value === 'blocked' || value === 'waiting' || value === 'completed'
    ? value
    : fallback
}

function normalizeEvidenceIds(input: unknown): string[] | undefined {
  const cleaned = normalizeList(input, 12, 120)
  return cleaned.length > 0 ? cleaned : undefined
}

function itemSortRank(status: WorkingStateItemStatus): number {
  if (status === 'active') return 0
  if (status === 'resolved') return 1
  return 2
}

function genericCompact<TItem extends TimedWorkingItem>(items: TItem[], max: number): TItem[] {
  return [...items]
    .sort((left, right) => {
      const rankDelta = itemSortRank(left.status) - itemSortRank(right.status)
      if (rankDelta !== 0) return rankDelta
      return (right.updatedAt || 0) - (left.updatedAt || 0)
    })
    .slice(0, max)
}

function compactPlanSteps(items: WorkingPlanStep[], max: number): WorkingPlanStep[] {
  if (items.length <= max) return items
  const next = [...items]
  while (next.length > max) {
    const removableIndex = next.findIndex((step) => step.status !== 'active')
    if (removableIndex >= 0) {
      next.splice(removableIndex, 1)
      continue
    }
    next.shift()
  }
  return next
}

function normalizeEvidenceRef(input: unknown): EvidenceRef | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const summary = cleanText(record.summary, 280)
  if (!summary) return null
  const type = record.type === 'tool'
    || record.type === 'message'
    || record.type === 'mission'
    || record.type === 'task'
    || record.type === 'artifact'
    || record.type === 'error'
    || record.type === 'approval'
    ? record.type
    : 'message'
  return {
    id: cleanText(record.id, 120) || genId(12),
    type,
    summary,
    value: cleanText(record.value, 240) || null,
    toolName: cleanText(record.toolName, 120) || null,
    toolCallId: cleanText(record.toolCallId, 120) || null,
    runId: cleanText(record.runId, 120) || null,
    sessionId: cleanText(record.sessionId, 120) || null,
    missionId: cleanText(record.missionId, 120) || null,
    taskId: cleanText(record.taskId, 120) || null,
    createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? Math.trunc(record.createdAt)
      : now(),
  }
}

function normalizePlanStep(input: unknown): WorkingPlanStep | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const text = cleanText(record.text, 240)
  if (!text) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    text,
    status: normalizeItemStatus(record.status),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function normalizeFact(input: unknown): WorkingFact | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const statement = cleanText(record.statement, 280)
  if (!statement) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    statement,
    source: record.source === 'user'
      || record.source === 'tool'
      || record.source === 'assistant'
      || record.source === 'mission'
      || record.source === 'system'
      ? record.source
      : 'assistant',
    status: normalizeItemStatus(record.status),
    evidenceIds: normalizeEvidenceIds(record.evidenceIds),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function normalizeArtifact(input: unknown): WorkingArtifact | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const label = cleanText(record.label, 240)
  if (!label) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    label,
    kind: record.kind === 'file'
      || record.kind === 'url'
      || record.kind === 'approval'
      || record.kind === 'message'
      || record.kind === 'other'
      ? record.kind
      : 'other',
    path: cleanText(record.path, 320) || null,
    url: cleanText(record.url, 320) || null,
    sourceTool: cleanText(record.sourceTool, 120) || null,
    status: normalizeItemStatus(record.status),
    evidenceIds: normalizeEvidenceIds(record.evidenceIds),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function normalizeDecision(input: unknown): WorkingDecision | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const summary = cleanText(record.summary, 280)
  if (!summary) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    summary,
    rationale: cleanText(record.rationale, 320) || null,
    status: normalizeItemStatus(record.status),
    evidenceIds: normalizeEvidenceIds(record.evidenceIds),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function normalizeBlocker(input: unknown): WorkingBlocker | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const summary = cleanText(record.summary, 280)
  if (!summary) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    summary,
    kind: record.kind === 'approval'
      || record.kind === 'credential'
      || record.kind === 'human_input'
      || record.kind === 'external_dependency'
      || record.kind === 'error'
      || record.kind === 'other'
      ? record.kind
      : null,
    nextAction: cleanText(record.nextAction, 240) || null,
    status: normalizeItemStatus(record.status),
    evidenceIds: normalizeEvidenceIds(record.evidenceIds),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function normalizeQuestion(input: unknown): WorkingQuestion | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const question = cleanText(record.question, 280)
  if (!question) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    question,
    status: normalizeItemStatus(record.status),
    evidenceIds: normalizeEvidenceIds(record.evidenceIds),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function normalizeHypothesis(input: unknown): WorkingHypothesis | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const statement = cleanText(record.statement, 280)
  if (!statement) return null
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : now()
  return {
    id: cleanText(record.id, 120) || genId(12),
    statement,
    confidence: record.confidence === 'low' || record.confidence === 'medium' || record.confidence === 'high'
      ? record.confidence
      : null,
    status: normalizeItemStatus(record.status),
    evidenceIds: normalizeEvidenceIds(record.evidenceIds),
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
  }
}

function defaultWorkingState(sessionId: string, mission?: Mission | null): SessionWorkingState {
  const nowTs = now()
  return {
    sessionId,
    missionId: mission?.id || null,
    objective: cleanMultiline(mission?.objective, 900) || null,
    summary: cleanMultiline(mission?.verifierSummary || mission?.plannerSummary, 600) || null,
    constraints: [],
    successCriteria: normalizeList(mission?.successCriteria, 12, 240),
    status: mission ? missionStatusToWorkingStateStatus(mission) : 'idle',
    nextAction: cleanText(mission?.currentStep, 240) || null,
    planSteps: [],
    confirmedFacts: [],
    artifacts: [],
    decisions: [],
    blockers: [],
    openQuestions: [],
    hypotheses: [],
    evidenceRefs: [],
    createdAt: nowTs,
    updatedAt: nowTs,
    lastCompactedAt: null,
  }
}

function normalizeWorkingState(
  input: unknown,
  sessionId: string,
  mission?: Mission | null,
): SessionWorkingState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaultWorkingState(sessionId, mission)
  }
  const record = input as Record<string, unknown>
  const base = defaultWorkingState(sessionId, mission)
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? Math.trunc(record.createdAt)
    : base.createdAt
  const normalized: SessionWorkingState = {
    sessionId: cleanText(record.sessionId, 120) || sessionId,
    missionId: cleanText(record.missionId, 120) || mission?.id || null,
    objective: cleanMultiline(record.objective, 900) || base.objective,
    summary: cleanMultiline(record.summary, 600) || base.summary,
    constraints: normalizeList(record.constraints, 12, 240),
    successCriteria: normalizeList(record.successCriteria, 12, 240),
    status: normalizeStateStatus(record.status, base.status),
    nextAction: cleanText(record.nextAction, 240) || base.nextAction,
    planSteps: (Array.isArray(record.planSteps) ? record.planSteps.map(normalizePlanStep).filter(Boolean) : []) as WorkingPlanStep[],
    confirmedFacts: (Array.isArray(record.confirmedFacts) ? record.confirmedFacts.map(normalizeFact).filter(Boolean) : []) as WorkingFact[],
    artifacts: (Array.isArray(record.artifacts) ? record.artifacts.map(normalizeArtifact).filter(Boolean) : []) as WorkingArtifact[],
    decisions: (Array.isArray(record.decisions) ? record.decisions.map(normalizeDecision).filter(Boolean) : []) as WorkingDecision[],
    blockers: (Array.isArray(record.blockers) ? record.blockers.map(normalizeBlocker).filter(Boolean) : []) as WorkingBlocker[],
    openQuestions: (Array.isArray(record.openQuestions) ? record.openQuestions.map(normalizeQuestion).filter(Boolean) : []) as WorkingQuestion[],
    hypotheses: (Array.isArray(record.hypotheses) ? record.hypotheses.map(normalizeHypothesis).filter(Boolean) : []) as WorkingHypothesis[],
    evidenceRefs: (Array.isArray(record.evidenceRefs) ? record.evidenceRefs.map(normalizeEvidenceRef).filter(Boolean) : []) as EvidenceRef[],
    createdAt,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.trunc(record.updatedAt)
      : createdAt,
    lastCompactedAt: typeof record.lastCompactedAt === 'number' && Number.isFinite(record.lastCompactedAt)
      ? Math.trunc(record.lastCompactedAt)
      : null,
  }
  return compactWorkingStateObject(syncWorkingStateWithMission(normalized, mission))
}

function normalizeMatchKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function upsertItems<TItem extends TimedWorkingItem, TPatch>(
  items: TItem[],
  patches: TPatch[] | undefined,
  config: UpsertConfig<TItem, TPatch>,
): TItem[] {
  if (!Array.isArray(patches) || patches.length === 0) return items
  const next = [...items]
  const nowTs = now()
  for (const patch of patches) {
    const key = normalizeMatchKey(config.getPatchKey(patch))
    if (!key) continue
    const patchId = config.getPatchId(patch)
    const index = next.findIndex((item) => {
      if (patchId && item.id === patchId) return true
      return normalizeMatchKey(config.getItemKey(item)) === key
    })
    if (index >= 0) {
      next[index] = config.merge(next[index], patch, nowTs)
    } else {
      next.push(config.create(patch, nowTs))
    }
  }
  return (config.compact || genericCompact)(next, config.max)
}

function appendEvidenceRefs(current: EvidenceRef[], additions: EvidenceRef[] | undefined): EvidenceRef[] {
  if (!Array.isArray(additions) || additions.length === 0) return current
  const merged = [...current]
  for (const addition of additions) {
    const normalized = normalizeEvidenceRef(addition)
    if (!normalized) continue
    const matchIndex = merged.findIndex((entry) => {
      if (normalized.toolCallId && entry.toolCallId && entry.toolCallId === normalized.toolCallId) return true
      return entry.type === normalized.type
        && normalizeMatchKey(entry.summary) === normalizeMatchKey(normalized.summary)
        && normalizeMatchKey(entry.value || '') === normalizeMatchKey(normalized.value || '')
    })
    if (matchIndex >= 0) {
      merged[matchIndex] = {
        ...merged[matchIndex],
        ...normalized,
      }
    } else {
      merged.push(normalized)
    }
  }
  return merged
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
    .slice(0, MAX_EVIDENCE_REFS)
}

function markSuperseded<TItem extends TimedWorkingItem>(items: TItem[], ids: string[] | undefined): TItem[] {
  if (!Array.isArray(ids) || ids.length === 0) return items
  const idSet = new Set(ids.map((id) => cleanText(id, 120)).filter(Boolean))
  if (idSet.size === 0) return items
  const nowTs = now()
  return items.map((item) => (idSet.has(item.id)
    ? { ...item, status: 'superseded' as WorkingStateItemStatus, updatedAt: nowTs }
    : item))
}

function missionStatusToWorkingStateStatus(mission: Mission): WorkingStateStatus {
  if (mission.status === 'completed') return 'completed'
  if (mission.status === 'waiting') return 'waiting'
  if (mission.status === 'failed' || mission.status === 'cancelled') return 'blocked'
  return 'progress'
}

function syncWorkingStateWithMission(
  state: SessionWorkingState,
  mission?: Mission | null,
): SessionWorkingState {
  if (!mission) return state
  const next = { ...state }
  next.missionId = mission.id
  next.objective = cleanMultiline(mission.objective, 900) || next.objective
  next.successCriteria = normalizeList(mission.successCriteria, 12, 240)
  next.summary = next.summary || cleanMultiline(mission.verifierSummary || mission.plannerSummary, 600) || null
  const missionStatus = missionStatusToWorkingStateStatus(mission)
  if (missionStatus === 'completed' || missionStatus === 'waiting' || missionStatus === 'blocked') {
    next.status = missionStatus
  } else if (next.status === 'idle') {
    next.status = missionStatus
  }
  next.nextAction = next.nextAction || cleanText(mission.currentStep, 240) || null

  if (mission.currentStep) {
    next.planSteps = upsertItems(next.planSteps, [{
      id: null,
      text: mission.currentStep,
      status: mission.status === 'completed' ? 'resolved' : 'active',
    } satisfies WorkingPlanStepPatch], {
      max: MAX_PLAN_STEPS,
      getPatchId: (patch) => cleanText(patch.id, 120) || null,
      getPatchKey: (patch) => cleanText(patch.text, 240),
      getItemKey: (item) => item.text,
      create: (patch, nowTs) => ({
        id: genId(12),
        text: cleanText(patch.text, 240),
        status: normalizeItemStatus(patch.status),
        createdAt: nowTs,
        updatedAt: nowTs,
      }),
      merge: (current, patch, nowTs) => ({
        ...current,
        text: cleanText(patch.text, 240) || current.text,
        status: normalizeItemStatus(patch.status, current.status),
        updatedAt: nowTs,
      }),
      compact: compactPlanSteps,
    })
  }

  if (mission.waitState?.reason || mission.blockerSummary) {
    const blockerSummary = cleanText(mission.waitState?.reason || mission.blockerSummary, 280)
    if (blockerSummary) {
      next.blockers = upsertItems(next.blockers, [{
        summary: blockerSummary,
        kind: mission.waitState?.kind === 'approval'
          ? 'approval'
          : mission.waitState?.kind === 'human_reply'
            ? 'human_input'
            : mission.waitState?.kind === 'external_dependency' || mission.waitState?.kind === 'provider'
              ? 'external_dependency'
              : mission.status === 'failed'
                ? 'error'
                : 'other',
        nextAction: mission.currentStep || null,
        status: mission.status === 'completed' ? 'resolved' : 'active',
      }], blockerUpsertConfig())
    }
  }

  if (mission.status === 'completed') {
    next.blockers = next.blockers.map((blocker) => blocker.status === 'active'
      ? { ...blocker, status: 'resolved', updatedAt: now() }
      : blocker)
  }

  return next
}

function factUpsertConfig(): UpsertConfig<WorkingFact, WorkingFactPatch> {
  return {
    max: MAX_CONFIRMED_FACTS,
    getPatchId: (patch) => cleanText(patch.id, 120) || null,
    getPatchKey: (patch) => cleanText(patch.statement, 280),
    getItemKey: (item) => item.statement,
    create: (patch, nowTs) => ({
      id: cleanText(patch.id, 120) || genId(12),
      statement: cleanText(patch.statement, 280),
      source: patch.source === 'user'
        || patch.source === 'tool'
        || patch.source === 'assistant'
        || patch.source === 'mission'
        || patch.source === 'system'
        ? patch.source
        : 'assistant',
      status: normalizeItemStatus(patch.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
      createdAt: nowTs,
      updatedAt: nowTs,
    }),
    merge: (current, patch, nowTs) => ({
      ...current,
      statement: cleanText(patch.statement, 280) || current.statement,
      source: patch.source === 'user'
        || patch.source === 'tool'
        || patch.source === 'assistant'
        || patch.source === 'mission'
        || patch.source === 'system'
        ? patch.source
        : current.source,
      status: normalizeItemStatus(patch.status, current.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds) || current.evidenceIds,
      updatedAt: nowTs,
    }),
  }
}

function artifactUpsertConfig(): UpsertConfig<WorkingArtifact, WorkingArtifactPatch> {
  return {
    max: MAX_ARTIFACTS,
    getPatchId: (patch) => cleanText(patch.id, 120) || null,
    getPatchKey: (patch) => cleanText(patch.path || patch.url || patch.label, 320),
    getItemKey: (item) => cleanText(item.path || item.url || item.label, 320),
    create: (patch, nowTs) => ({
      id: cleanText(patch.id, 120) || genId(12),
      label: cleanText(patch.label, 240),
      kind: patch.kind === 'file'
        || patch.kind === 'url'
        || patch.kind === 'approval'
        || patch.kind === 'message'
        || patch.kind === 'other'
        ? patch.kind
        : 'other',
      path: cleanText(patch.path, 320) || null,
      url: cleanText(patch.url, 320) || null,
      sourceTool: cleanText(patch.sourceTool, 120) || null,
      status: normalizeItemStatus(patch.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
      createdAt: nowTs,
      updatedAt: nowTs,
    }),
    merge: (current, patch, nowTs) => ({
      ...current,
      label: cleanText(patch.label, 240) || current.label,
      kind: patch.kind === 'file'
        || patch.kind === 'url'
        || patch.kind === 'approval'
        || patch.kind === 'message'
        || patch.kind === 'other'
        ? patch.kind
        : current.kind,
      path: cleanText(patch.path, 320) || current.path,
      url: cleanText(patch.url, 320) || current.url,
      sourceTool: cleanText(patch.sourceTool, 120) || current.sourceTool,
      status: normalizeItemStatus(patch.status, current.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds) || current.evidenceIds,
      updatedAt: nowTs,
    }),
  }
}

function decisionUpsertConfig(): UpsertConfig<WorkingDecision, WorkingDecisionPatch> {
  return {
    max: MAX_DECISIONS,
    getPatchId: (patch) => cleanText(patch.id, 120) || null,
    getPatchKey: (patch) => cleanText(patch.summary, 280),
    getItemKey: (item) => item.summary,
    create: (patch, nowTs) => ({
      id: cleanText(patch.id, 120) || genId(12),
      summary: cleanText(patch.summary, 280),
      rationale: cleanText(patch.rationale, 320) || null,
      status: normalizeItemStatus(patch.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
      createdAt: nowTs,
      updatedAt: nowTs,
    }),
    merge: (current, patch, nowTs) => ({
      ...current,
      summary: cleanText(patch.summary, 280) || current.summary,
      rationale: cleanText(patch.rationale, 320) || current.rationale,
      status: normalizeItemStatus(patch.status, current.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds) || current.evidenceIds,
      updatedAt: nowTs,
    }),
  }
}

function blockerUpsertConfig(): UpsertConfig<WorkingBlocker, WorkingBlockerPatch> {
  return {
    max: MAX_BLOCKERS,
    getPatchId: (patch) => cleanText(patch.id, 120) || null,
    getPatchKey: (patch) => cleanText(patch.summary, 280),
    getItemKey: (item) => item.summary,
    create: (patch, nowTs) => ({
      id: cleanText(patch.id, 120) || genId(12),
      summary: cleanText(patch.summary, 280),
      kind: patch.kind || null,
      nextAction: cleanText(patch.nextAction, 240) || null,
      status: normalizeItemStatus(patch.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
      createdAt: nowTs,
      updatedAt: nowTs,
    }),
    merge: (current, patch, nowTs) => ({
      ...current,
      summary: cleanText(patch.summary, 280) || current.summary,
      kind: patch.kind || current.kind,
      nextAction: cleanText(patch.nextAction, 240) || current.nextAction,
      status: normalizeItemStatus(patch.status, current.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds) || current.evidenceIds,
      updatedAt: nowTs,
    }),
  }
}

function questionUpsertConfig(): UpsertConfig<WorkingQuestion, WorkingQuestionPatch> {
  return {
    max: MAX_OPEN_QUESTIONS,
    getPatchId: (patch) => cleanText(patch.id, 120) || null,
    getPatchKey: (patch) => cleanText(patch.question, 280),
    getItemKey: (item) => item.question,
    create: (patch, nowTs) => ({
      id: cleanText(patch.id, 120) || genId(12),
      question: cleanText(patch.question, 280),
      status: normalizeItemStatus(patch.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
      createdAt: nowTs,
      updatedAt: nowTs,
    }),
    merge: (current, patch, nowTs) => ({
      ...current,
      question: cleanText(patch.question, 280) || current.question,
      status: normalizeItemStatus(patch.status, current.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds) || current.evidenceIds,
      updatedAt: nowTs,
    }),
  }
}

function hypothesisUpsertConfig(): UpsertConfig<WorkingHypothesis, WorkingHypothesisPatch> {
  return {
    max: MAX_HYPOTHESES,
    getPatchId: (patch) => cleanText(patch.id, 120) || null,
    getPatchKey: (patch) => cleanText(patch.statement, 280),
    getItemKey: (item) => item.statement,
    create: (patch, nowTs) => ({
      id: cleanText(patch.id, 120) || genId(12),
      statement: cleanText(patch.statement, 280),
      confidence: patch.confidence === 'low' || patch.confidence === 'medium' || patch.confidence === 'high'
        ? patch.confidence
        : null,
      status: normalizeItemStatus(patch.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
      createdAt: nowTs,
      updatedAt: nowTs,
    }),
    merge: (current, patch, nowTs) => ({
      ...current,
      statement: cleanText(patch.statement, 280) || current.statement,
      confidence: patch.confidence === 'low' || patch.confidence === 'medium' || patch.confidence === 'high'
        ? patch.confidence
        : current.confidence,
      status: normalizeItemStatus(patch.status, current.status),
      evidenceIds: normalizeEvidenceIds(patch.evidenceIds) || current.evidenceIds,
      updatedAt: nowTs,
    }),
  }
}

function compactWorkingStateObject(state: SessionWorkingState): SessionWorkingState {
  return {
    ...state,
    planSteps: compactPlanSteps(state.planSteps, MAX_PLAN_STEPS),
    confirmedFacts: genericCompact(state.confirmedFacts, MAX_CONFIRMED_FACTS),
    artifacts: genericCompact(state.artifacts, MAX_ARTIFACTS),
    decisions: genericCompact(state.decisions, MAX_DECISIONS),
    blockers: genericCompact(state.blockers, MAX_BLOCKERS),
    openQuestions: genericCompact(state.openQuestions, MAX_OPEN_QUESTIONS),
    hypotheses: genericCompact(state.hypotheses, MAX_HYPOTHESES),
    evidenceRefs: [...state.evidenceRefs]
      .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
      .slice(0, MAX_EVIDENCE_REFS),
    lastCompactedAt: now(),
  }
}

function parseStructuredObject(raw: string): Record<string, unknown> | null {
  const text = cleanMultiline(raw, 20_000)
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function extractFirstJsonObject(text: string): string | null {
  const source = String(text || '').trim()
  if (!source) return null
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (start === -1) {
      if (char === '{') {
        start = index
        depth = 1
      }
      continue
    }
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  return null
}

function parseWorkingStatePatchResponse(text: string): WorkingStatePatch | null {
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) return null
  let raw: unknown = null
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return null
  }
  const parsed = WorkingStatePatchSchema.safeParse(raw)
  if (!parsed.success) return null
  const data = parsed.data
  return {
    objective: cleanMultiline(data.objective, 900) || null,
    summary: cleanMultiline(data.summary, 600) || null,
    constraints: normalizeList(data.constraints, 12, 240),
    successCriteria: normalizeList(data.successCriteria, 12, 240),
    status: data.status || null,
    nextAction: cleanText(data.nextAction, 240) || null,
    planSteps: Array.isArray(data.planSteps)
      ? data.planSteps
        .map((step) => {
          const text = cleanText(step.text, 240)
          if (!text) return null
          return {
            id: cleanText(step.id, 120) || null,
            text,
            status: step.status || undefined,
          } satisfies WorkingPlanStepPatch
        })
        .filter(Boolean) as WorkingPlanStepPatch[]
      : undefined,
    factsUpsert: Array.isArray(data.factsUpsert)
      ? data.factsUpsert
        .map((fact) => {
          const statement = cleanText(fact.statement, 280)
          if (!statement) return null
          return {
            id: cleanText(fact.id, 120) || null,
            statement,
            source: fact.source || undefined,
            status: fact.status || undefined,
            evidenceIds: normalizeEvidenceIds(fact.evidenceIds),
          } satisfies WorkingFactPatch
        })
        .filter(Boolean) as WorkingFactPatch[]
      : undefined,
    artifactsUpsert: Array.isArray(data.artifactsUpsert)
      ? data.artifactsUpsert
        .map((artifact) => {
          const label = cleanText(artifact.label, 240)
          if (!label) return null
          return {
            id: cleanText(artifact.id, 120) || null,
            label,
            kind: artifact.kind || undefined,
            path: cleanText(artifact.path, 320) || null,
            url: cleanText(artifact.url, 320) || null,
            sourceTool: cleanText(artifact.sourceTool, 120) || null,
            status: artifact.status || undefined,
            evidenceIds: normalizeEvidenceIds(artifact.evidenceIds),
          } satisfies WorkingArtifactPatch
        })
        .filter(Boolean) as WorkingArtifactPatch[]
      : undefined,
    decisionsAppend: Array.isArray(data.decisionsAppend)
      ? data.decisionsAppend
        .map((decision) => {
          const summary = cleanText(decision.summary, 280)
          if (!summary) return null
          return {
            id: cleanText(decision.id, 120) || null,
            summary,
            rationale: cleanText(decision.rationale, 320) || null,
            status: decision.status || undefined,
            evidenceIds: normalizeEvidenceIds(decision.evidenceIds),
          } satisfies WorkingDecisionPatch
        })
        .filter(Boolean) as WorkingDecisionPatch[]
      : undefined,
    blockersUpsert: Array.isArray(data.blockersUpsert)
      ? data.blockersUpsert
        .map((blocker) => {
          const summary = cleanText(blocker.summary, 280)
          if (!summary) return null
          return {
            id: cleanText(blocker.id, 120) || null,
            summary,
            kind: blocker.kind || undefined,
            nextAction: cleanText(blocker.nextAction, 240) || null,
            status: blocker.status || undefined,
            evidenceIds: normalizeEvidenceIds(blocker.evidenceIds),
          } satisfies WorkingBlockerPatch
        })
        .filter(Boolean) as WorkingBlockerPatch[]
      : undefined,
    questionsUpsert: Array.isArray(data.questionsUpsert)
      ? data.questionsUpsert
        .map((question) => {
          const value = cleanText(question.question, 280)
          if (!value) return null
          return {
            id: cleanText(question.id, 120) || null,
            question: value,
            status: question.status || undefined,
            evidenceIds: normalizeEvidenceIds(question.evidenceIds),
          } satisfies WorkingQuestionPatch
        })
        .filter(Boolean) as WorkingQuestionPatch[]
      : undefined,
    hypothesesUpsert: Array.isArray(data.hypothesesUpsert)
      ? data.hypothesesUpsert
        .map((hypothesis) => {
          const statement = cleanText(hypothesis.statement, 280)
          if (!statement) return null
          return {
            id: cleanText(hypothesis.id, 120) || null,
            statement,
            confidence: hypothesis.confidence || undefined,
            status: hypothesis.status || undefined,
            evidenceIds: normalizeEvidenceIds(hypothesis.evidenceIds),
          } satisfies WorkingHypothesisPatch
        })
        .filter(Boolean) as WorkingHypothesisPatch[]
      : undefined,
    supersedeIds: normalizeList(data.supersedeIds, 24, 120),
  }
}

function renderStateForExtraction(state: SessionWorkingState | null | undefined): string {
  if (!state) return '(none)'
  const activePlan = state.planSteps.filter((item) => item.status === 'active').map((item) => item.text).slice(0, 8)
  const facts = state.confirmedFacts.filter((item) => item.status === 'active').map((item) => item.statement).slice(0, 8)
  const blockers = state.blockers.filter((item) => item.status === 'active').map((item) => item.summary).slice(0, 6)
  const questions = state.openQuestions.filter((item) => item.status === 'active').map((item) => item.question).slice(0, 6)
  const hypotheses = state.hypotheses.filter((item) => item.status === 'active').map((item) => item.statement).slice(0, 6)
  const artifacts = state.artifacts.filter((item) => item.status === 'active').map((item) => cleanText(item.path || item.url || item.label, 180)).slice(0, 6)
  return [
    `objective: ${JSON.stringify(state.objective || null)}`,
    `summary: ${JSON.stringify(state.summary || null)}`,
    `status: ${JSON.stringify(state.status)}`,
    `nextAction: ${JSON.stringify(state.nextAction || null)}`,
    `constraints: ${JSON.stringify(state.constraints || [])}`,
    `successCriteria: ${JSON.stringify(state.successCriteria || [])}`,
    `activePlan: ${JSON.stringify(activePlan)}`,
    `facts: ${JSON.stringify(facts)}`,
    `blockers: ${JSON.stringify(blockers)}`,
    `openQuestions: ${JSON.stringify(questions)}`,
    `hypotheses: ${JSON.stringify(hypotheses)}`,
    `artifacts: ${JSON.stringify(artifacts)}`,
  ].join('\n')
}

function summarizeToolEvents(toolEvents: MessageToolEvent[] | undefined): string {
  if (!Array.isArray(toolEvents) || toolEvents.length === 0) return '(none)'
  return toolEvents
    .slice(-8)
    .map((event) => {
      const name = cleanText(event.name, 80) || 'unknown'
      const input = cleanText(event.input, 160)
      const output = cleanText(event.output, 200)
      const parts = [name]
      if (input) parts.push(`input=${JSON.stringify(input)}`)
      if (output) parts.push(`output=${JSON.stringify(output)}`)
      if (event.error === true) parts.push('error=true')
      if (event.toolCallId) parts.push(`toolCallId=${JSON.stringify(event.toolCallId)}`)
      return parts.join(' ')
    })
    .join('\n')
}

function buildWorkingStatePatchPrompt(input: WorkingStateExtractionInput): string {
  return [
    'You maintain a structured working-state object for an autonomous agent.',
    'Return JSON only.',
    '',
    'Update the state using only evidence from the latest turn, tool results, and mission snapshot.',
    'Rules:',
    '- Facts must be confirmed by explicit user text, mission state, or tool evidence. Do not turn guesses into facts.',
    '- Put uncertain leads into hypotheses, not facts.',
    '- Use blockers for approvals, credentials, human input, external waits, and explicit execution failures.',
    '- nextAction must be one concrete immediate action, not a broad plan.',
    '- Keep entries concise and avoid duplicates with the current state.',
    '- If newer evidence invalidates an existing live item, include its id in supersedeIds.',
    '- Do not repeat the entire state. Only emit useful deltas.',
    '- If nothing material changed, return {}.',
    '',
    'Output shape:',
    JSON.stringify({
      objective: 'optional',
      summary: 'optional',
      constraints: ['optional'],
      successCriteria: ['optional'],
      status: 'idle|progress|blocked|waiting|completed',
      nextAction: 'optional',
      planSteps: [{ id: 'optional', text: 'step', status: 'active|resolved|superseded' }],
      factsUpsert: [{ id: 'optional', statement: 'confirmed fact', source: 'user|tool|assistant|mission|system', status: 'active|resolved|superseded', evidenceIds: ['optional'] }],
      artifactsUpsert: [{ id: 'optional', label: 'artifact', kind: 'file|url|approval|message|other', path: 'optional', url: 'optional', sourceTool: 'optional', status: 'active|resolved|superseded', evidenceIds: ['optional'] }],
      decisionsAppend: [{ summary: 'decision', rationale: 'optional', status: 'active|resolved|superseded', evidenceIds: ['optional'] }],
      blockersUpsert: [{ summary: 'blocker', kind: 'approval|credential|human_input|external_dependency|error|other', nextAction: 'optional', status: 'active|resolved|superseded', evidenceIds: ['optional'] }],
      questionsUpsert: [{ question: 'open question', status: 'active|resolved|superseded', evidenceIds: ['optional'] }],
      hypothesesUpsert: [{ statement: 'possible lead', confidence: 'low|medium|high', status: 'active|resolved|superseded', evidenceIds: ['optional'] }],
      supersedeIds: ['optional item id'],
    }),
    '',
    `source: ${JSON.stringify(cleanText(input.source, 80) || 'chat')}`,
    `mission: ${JSON.stringify(input.mission ? {
      id: input.mission.id,
      objective: cleanMultiline(input.mission.objective, 600),
      status: input.mission.status,
      phase: input.mission.phase,
      currentStep: cleanText(input.mission.currentStep, 240) || null,
      plannerSummary: cleanText(input.mission.plannerSummary, 280) || null,
      verifierSummary: cleanText(input.mission.verifierSummary, 280) || null,
      blockerSummary: cleanText(input.mission.blockerSummary, 240) || null,
      waitState: input.mission.waitState ? {
        kind: input.mission.waitState.kind,
        reason: cleanText(input.mission.waitState.reason, 240),
        approvalId: cleanText(input.mission.waitState.approvalId, 120) || null,
      } : null,
    } : null)}`,
    `current_state:\n${renderStateForExtraction(input.currentState)}`,
    `user_message: ${JSON.stringify(cleanMultiline(input.message, 1200) || null)}`,
    `assistant_text: ${JSON.stringify(cleanMultiline(input.assistantText, 1200) || null)}`,
    `assistant_error: ${JSON.stringify(cleanText(input.error, 320) || null)}`,
    `tool_evidence:\n${summarizeToolEvents(input.toolEvents)}`,
  ].join('\n')
}

function collectJsonCandidates(value: unknown, pathLabel = '', out?: Array<{ key: string; value: string }>): Array<{ key: string; value: string }> {
  const results = out || []
  if (!value) return results
  if (typeof value === 'string') {
    const cleaned = cleanText(value, 400)
    if (cleaned) results.push({ key: pathLabel, value: cleaned })
    return results
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonCandidates(entry, pathLabel, results)
    return results
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      collectJsonCandidates(nested, key, results)
    }
  }
  return results
}

function uniqueByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^\/api\/uploads\//.test(value) || /^sandbox:\/\//i.test(value)
}

function looksLikeFilePath(value: string): boolean {
  return /^(?:\.{1,2}\/|\/|[A-Za-z0-9_-]+\/)/.test(value)
    || /^sandbox:\//.test(value)
}

function extractPlainTextArtifacts(text: string): Array<{ kind: WorkingArtifact['kind']; value: string }> {
  const out: Array<{ kind: WorkingArtifact['kind']; value: string }> = []
  if (!text) return out
  const urlMatches = text.match(/(?:https?:\/\/|\/api\/uploads\/|sandbox:\/\/)[^\s)\]}>,"]+/g) || []
  for (const match of urlMatches) out.push({ kind: 'url', value: match })
  const pathMatches = text.match(/(?:^|[\s("'`])((?:\.{1,2}\/|\/|sandbox:\/)[A-Za-z0-9._\-\/]+(?:\.[A-Za-z0-9]{1,8})?)/g) || []
  for (const raw of pathMatches) {
    const match = raw.trim().replace(/^[(\s"'`]+/, '')
    if (match) out.push({ kind: 'file', value: match })
  }
  return uniqueByKey(out, (item) => `${item.kind}:${item.value}`)
}

function deterministicEvidencePatch(input: WorkingStateDeterministicUpdateInput): WorkingStatePatch {
  const nowTs = now()
  const evidenceAppend: EvidenceRef[] = []
  const artifactsUpsert: WorkingArtifactPatch[] = []
  const blockersUpsert: WorkingBlockerPatch[] = []
  const factsUpsert: WorkingFactPatch[] = []

  if (input.runId) {
    evidenceAppend.push({
      id: genId(12),
      type: 'message',
      summary: `Run ${input.runId} completed on ${cleanText(input.source, 80) || 'chat'}.`,
      value: input.runId,
      runId: input.runId,
      sessionId: input.sessionId,
      missionId: input.mission?.id || null,
      createdAt: nowTs,
    })
  }

  if (Array.isArray(input.toolEvents)) {
    input.toolEvents.forEach((event, index) => {
      const toolName = cleanText(event.name, 80) || 'unknown'
      const output = cleanText(event.output, 240)
      const summary = event.error === true
        ? `Tool ${toolName} returned an explicit error.`
        : `Tool ${toolName} produced new execution evidence.`
      const evidenceId = `${event.toolCallId || `${toolName}-${index}`}-${genId(6)}`
      evidenceAppend.push({
        id: evidenceId,
        type: event.error === true ? 'error' : 'tool',
        summary,
        value: output || cleanText(event.input, 240) || null,
        toolName,
        toolCallId: cleanText(event.toolCallId, 120) || null,
        runId: input.runId || null,
        sessionId: input.sessionId,
        missionId: input.mission?.id || null,
        createdAt: nowTs + index,
      })

      if (event.error === true) {
        blockersUpsert.push({
          summary: output || `Tool ${toolName} failed.`,
          kind: 'error',
          nextAction: cleanText(input.mission?.currentStep, 240) || null,
          status: 'active',
          evidenceIds: [evidenceId],
        })
      }

      const structuredInput = parseStructuredObject(event.input)
      const structuredOutput = parseStructuredObject(event.output || '')
      const candidates = [
        ...collectJsonCandidates(structuredInput),
        ...collectJsonCandidates(structuredOutput),
        ...extractPlainTextArtifacts(event.output || ''),
      ].map((entry) => {
        if ('kind' in entry) return entry
        const value = entry.value
        if (looksLikeUrl(value)) return { kind: 'url' as const, value }
        if (looksLikeFilePath(value)) return { kind: 'file' as const, value }
        return null
      }).filter(Boolean) as Array<{ kind: WorkingArtifact['kind']; value: string }>

      for (const candidate of uniqueByKey(candidates, (item) => `${item.kind}:${item.value}`)) {
        artifactsUpsert.push({
          label: candidate.value,
          kind: candidate.kind,
          path: candidate.kind === 'file' ? candidate.value : null,
          url: candidate.kind === 'url' ? candidate.value : null,
          sourceTool: toolName,
          status: 'active',
          evidenceIds: [evidenceId],
        })
      }

      const approvalRecord = structuredOutput || structuredInput
      const approvalId = cleanText(
        approvalRecord?.approvalId
        || (approvalRecord?.approval && typeof approvalRecord.approval === 'object'
          ? (approvalRecord.approval as Record<string, unknown>).id
          : null),
        120,
      )
      const requiresApproval = approvalRecord?.requiresApproval === true || Boolean(approvalId)
      if (requiresApproval) {
        const approvalLabel = approvalId ? `Approval ${approvalId}` : `Approval required for ${toolName}`
        artifactsUpsert.push({
          label: approvalLabel,
          kind: 'approval',
          sourceTool: toolName,
          status: 'active',
          evidenceIds: [evidenceId],
        })
        blockersUpsert.push({
          summary: approvalId
            ? `Approval ${approvalId} is required before continuing.`
            : `Approval is required before continuing ${toolName}.`,
          kind: 'approval',
          status: 'active',
          evidenceIds: [evidenceId],
        })
        if (approvalId) {
          factsUpsert.push({
            statement: `Pending approval id: ${approvalId}`,
            source: 'tool',
            status: 'active',
            evidenceIds: [evidenceId],
          })
        }
      }

      const taskId = cleanText(
        structuredOutput?.taskId
        || structuredInput?.taskId
        || (Array.isArray(structuredOutput?.taskIds) ? structuredOutput?.taskIds[0] : null),
        120,
      )
      if (taskId) {
        factsUpsert.push({
          statement: `Task id in play: ${taskId}`,
          source: 'tool',
          status: 'active',
          evidenceIds: [evidenceId],
        })
      }
    })
  }

  if (input.error) {
    evidenceAppend.push({
      id: genId(12),
      type: 'error',
      summary: `Assistant run ended with an explicit error.`,
      value: cleanText(input.error, 240) || null,
      runId: input.runId || null,
      sessionId: input.sessionId,
      missionId: input.mission?.id || null,
      createdAt: nowTs + 100,
    })
    blockersUpsert.push({
      summary: cleanText(input.error, 280),
      kind: 'error',
      status: 'active',
    })
  }

  if (input.mission) {
    evidenceAppend.push({
      id: genId(12),
      type: 'mission',
      summary: `Mission state updated: ${input.mission.status}/${input.mission.phase}.`,
      value: cleanText(input.mission.currentStep || input.mission.objective, 240) || null,
      runId: input.runId || null,
      sessionId: input.sessionId,
      missionId: input.mission.id,
      createdAt: nowTs + 200,
    })
  }

  return {
    status: input.error
      ? 'blocked'
      : input.mission
        ? missionStatusToWorkingStateStatus(input.mission)
        : undefined,
    nextAction: cleanText(input.mission?.currentStep, 240) || undefined,
    factsUpsert: factsUpsert.length > 0 ? factsUpsert : undefined,
    artifactsUpsert: artifactsUpsert.length > 0 ? artifactsUpsert : undefined,
    blockersUpsert: blockersUpsert.length > 0 ? blockersUpsert : undefined,
    evidenceAppend: evidenceAppend.length > 0 ? evidenceAppend : undefined,
  }
}

export function loadSessionWorkingState(sessionId: string, options?: { mission?: Mission | null }): SessionWorkingState | null {
  const stored = loadPersistedWorkingState(sessionId)
  if (!stored && !options?.mission) return null
  return normalizeWorkingState(stored, sessionId, options?.mission || null)
}

export function getOrCreateSessionWorkingState(sessionId: string, options?: { mission?: Mission | null }): SessionWorkingState {
  return loadSessionWorkingState(sessionId, options) || defaultWorkingState(sessionId, options?.mission || null)
}

export function saveSessionWorkingState(state: SessionWorkingState): SessionWorkingState {
  const normalized = compactWorkingStateObject(normalizeWorkingState(state, state.sessionId))
  upsertPersistedWorkingState(normalized.sessionId, normalized as unknown as Record<string, unknown>)
  return normalized
}

export function deleteSessionWorkingState(sessionId: string): void {
  deletePersistedWorkingState(sessionId)
}

export function applyWorkingStatePatch(
  sessionId: string,
  patch: WorkingStatePatch,
  options?: { mission?: Mission | null },
): SessionWorkingState {
  const current = getOrCreateSessionWorkingState(sessionId, options)
  const next: SessionWorkingState = {
    ...current,
    missionId: options?.mission?.id || current.missionId || null,
    objective: patch.objective !== undefined ? (cleanMultiline(patch.objective, 900) || null) : current.objective,
    summary: patch.summary !== undefined ? (cleanMultiline(patch.summary, 600) || null) : current.summary,
    constraints: patch.constraints !== undefined ? normalizeList(patch.constraints, 12, 240) : current.constraints,
    successCriteria: patch.successCriteria !== undefined ? normalizeList(patch.successCriteria, 12, 240) : current.successCriteria,
    status: patch.status !== undefined && patch.status !== null ? normalizeStateStatus(patch.status, current.status) : current.status,
    nextAction: patch.nextAction !== undefined ? (cleanText(patch.nextAction, 240) || null) : current.nextAction,
    planSteps: upsertItems(current.planSteps, patch.planSteps, {
      max: MAX_PLAN_STEPS,
      getPatchId: (item) => cleanText(item.id, 120) || null,
      getPatchKey: (item) => cleanText(item.text, 240),
      getItemKey: (item) => item.text,
      create: (item, nowTs) => ({
        id: cleanText(item.id, 120) || genId(12),
        text: cleanText(item.text, 240),
        status: normalizeItemStatus(item.status),
        createdAt: nowTs,
        updatedAt: nowTs,
      }),
      merge: (item, patchItem, nowTs) => ({
        ...item,
        text: cleanText(patchItem.text, 240) || item.text,
        status: normalizeItemStatus(patchItem.status, item.status),
        updatedAt: nowTs,
      }),
      compact: compactPlanSteps,
    }),
    confirmedFacts: upsertItems(current.confirmedFacts, patch.factsUpsert, factUpsertConfig()),
    artifacts: upsertItems(current.artifacts, patch.artifactsUpsert, artifactUpsertConfig()),
    decisions: upsertItems(current.decisions, patch.decisionsAppend, decisionUpsertConfig()),
    blockers: upsertItems(current.blockers, patch.blockersUpsert, blockerUpsertConfig()),
    openQuestions: upsertItems(current.openQuestions, patch.questionsUpsert, questionUpsertConfig()),
    hypotheses: upsertItems(current.hypotheses, patch.hypothesesUpsert, hypothesisUpsertConfig()),
    evidenceRefs: appendEvidenceRefs(current.evidenceRefs, patch.evidenceAppend),
    updatedAt: now(),
  }

  next.planSteps = markSuperseded(next.planSteps, patch.supersedeIds)
  next.confirmedFacts = markSuperseded(next.confirmedFacts, patch.supersedeIds)
  next.artifacts = markSuperseded(next.artifacts, patch.supersedeIds)
  next.decisions = markSuperseded(next.decisions, patch.supersedeIds)
  next.blockers = markSuperseded(next.blockers, patch.supersedeIds)
  next.openQuestions = markSuperseded(next.openQuestions, patch.supersedeIds)
  next.hypotheses = markSuperseded(next.hypotheses, patch.supersedeIds)

  const synced = compactWorkingStateObject(syncWorkingStateWithMission(next, options?.mission || null))
  upsertPersistedWorkingState(sessionId, synced as unknown as Record<string, unknown>)
  return synced
}

export function recordWorkingStateEvidence(input: WorkingStateDeterministicUpdateInput): SessionWorkingState {
  return applyWorkingStatePatch(
    input.sessionId,
    deterministicEvidencePatch(input),
    { mission: input.mission || null },
  )
}

export async function extractWorkingStatePatch(
  input: WorkingStateExtractionInput,
  options?: {
    generateText?: (prompt: string) => Promise<string>
  },
): Promise<WorkingStatePatch | null> {
  const prompt = buildWorkingStatePatchPrompt(input)
  try {
    const responseText = options?.generateText
      ? await options.generateText(prompt)
      : await (async () => {
        const { llm } = await buildLLM({
          sessionId: input.sessionId,
          agentId: input.agentId || null,
        })
        const response = await Promise.race([
          llm.invoke([new HumanMessage(prompt)]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('working-state-extraction-timeout')), EXTRACTION_TIMEOUT_MS)),
        ])
        const content = response.content
        if (typeof content === 'string') return content
        if (!Array.isArray(content)) return ''
        return content
          .map((part) => (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') ? part.text : '')
          .join('')
      })()
    return parseWorkingStatePatchResponse(responseText)
  } catch (error: unknown) {
    log.warn(TAG, 'Working-state extraction failed', {
      sessionId: input.sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function shouldExtractStructuredPatch(input: SynchronizeWorkingStateForTurnInput): boolean {
  const hasToolEvents = Array.isArray(input.toolEvents) && input.toolEvents.length > 0
  const hasMessage = cleanMultiline(input.message, 400).length > 0
  const hasAssistantText = cleanMultiline(input.assistantText, 400).length > 0
  const hasError = cleanText(input.error, 120).length > 0
  if (cleanText(input.source, 80) === 'heartbeat') {
    return hasToolEvents || hasError || Boolean(input.mission)
  }
  return hasToolEvents || hasAssistantText || hasMessage || hasError || Boolean(input.mission)
}

export async function synchronizeWorkingStateForTurn(
  input: SynchronizeWorkingStateForTurnInput,
  options?: {
    generateText?: (prompt: string) => Promise<string>
  },
): Promise<SessionWorkingState> {
  const deterministic = recordWorkingStateEvidence(input)
  if (!shouldExtractStructuredPatch(input)) return deterministic
  const patch = await extractWorkingStatePatch({
    ...input,
    currentState: deterministic,
  }, options)
  if (!patch) return deterministic
  return applyWorkingStatePatch(input.sessionId, patch, { mission: input.mission || null })
}

export function syncWorkingStateFromMainLoopState(input: {
  sessionId: string
  mission?: Mission | null
  goal?: string | null
  summary?: string | null
  status?: WorkingStateStatus | null
  nextAction?: string | null
  planSteps?: string[]
  blockers?: Array<{ summary: string; kind?: WorkingBlocker['kind'] | null }>
  facts?: string[]
}): SessionWorkingState {
  const planSteps = Array.isArray(input.planSteps)
    ? input.planSteps.map((step, index) => ({
      text: step,
      status: index === 0 && input.status !== 'completed' ? 'active' : (input.status === 'completed' ? 'resolved' : 'resolved'),
    } satisfies WorkingPlanStepPatch))
    : undefined
  return applyWorkingStatePatch(input.sessionId, {
    objective: cleanMultiline(input.goal, 900) || undefined,
    summary: cleanMultiline(input.summary, 600) || undefined,
    status: input.status || undefined,
    nextAction: cleanText(input.nextAction, 240) || undefined,
    planSteps,
    blockersUpsert: Array.isArray(input.blockers)
      ? input.blockers.map((blocker) => ({
        summary: cleanText(blocker.summary, 280),
        kind: blocker.kind || undefined,
        status: (input.status === 'completed' ? 'resolved' : 'active') as WorkingStateItemStatus,
      })).filter((blocker) => blocker.summary)
      : undefined,
    factsUpsert: Array.isArray(input.facts)
      ? input.facts.map((fact) => ({
        statement: cleanText(fact, 280),
        source: 'system' as const,
        status: (input.status === 'completed' ? 'resolved' : 'active') as WorkingStateItemStatus,
      })).filter((fact) => fact.statement)
      : undefined,
  }, { mission: input.mission || null })
}

function buildListSection(title: string, values: string[]): string | null {
  if (values.length === 0) return null
  return [title, ...values.map((value) => `- ${value}`)].join('\n')
}

export function buildWorkingStatePromptBlock(
  sessionId: string,
  options?: { mission?: Mission | null },
): string {
  const state = loadSessionWorkingState(sessionId, options)
  if (!state) return ''
  const activePlan = state.planSteps
    .filter((item) => item.status === 'active')
    .map((item) => item.text)
    .slice(0, 8)
  const confirmedFacts = state.confirmedFacts
    .filter((item) => item.status === 'active')
    .map((item) => item.statement)
    .slice(0, 8)
  const blockers = state.blockers
    .filter((item) => item.status === 'active')
    .map((item) => item.nextAction ? `${item.summary} | next: ${item.nextAction}` : item.summary)
    .slice(0, 6)
  const questions = state.openQuestions
    .filter((item) => item.status === 'active')
    .map((item) => item.question)
    .slice(0, 6)
  const hypotheses = state.hypotheses
    .filter((item) => item.status === 'active')
    .map((item) => item.confidence ? `${item.statement} (${item.confidence})` : item.statement)
    .slice(0, 6)
  const artifacts = state.artifacts
    .filter((item) => item.status === 'active')
    .map((item) => cleanText(item.path || item.url || item.label, 220))
    .slice(0, 6)

  const sections = [
    '## Active Working State',
    state.objective ? `Objective: ${state.objective}` : '',
    state.summary ? `Summary: ${state.summary}` : '',
    `Status: ${state.status}`,
    state.nextAction ? `Next action: ${state.nextAction}` : '',
    state.successCriteria.length > 0 ? `Success criteria: ${state.successCriteria.join(' | ')}` : '',
    state.constraints.length > 0 ? `Constraints: ${state.constraints.join(' | ')}` : '',
    buildListSection('Plan', activePlan),
    buildListSection('Confirmed facts', confirmedFacts),
    buildListSection('Blockers', blockers),
    buildListSection('Open questions', questions),
    buildListSection('Hypotheses', hypotheses),
    buildListSection('Artifacts', artifacts),
    'Trust this structured state before reconstructing status from the raw transcript.',
  ].filter(Boolean)

  return sections.join('\n')
}
