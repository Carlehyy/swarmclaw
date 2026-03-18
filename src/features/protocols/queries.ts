import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/app/api-client'
import type { ProtocolRunDetail } from '@/lib/server/protocols/protocol-types'
import type { ProtocolRun, ProtocolStepDefinition, ProtocolTemplate } from '@/types'

export type ProtocolRunListParams = {
  limit?: number
  missionId?: string | null
  taskId?: string | null
  sessionId?: string | null
  parentChatroomId?: string | null
}

export interface ProtocolRunCreatePayload {
  title: string
  templateId?: string | null
  participantAgentIds: string[]
  facilitatorAgentId?: string | null
  sessionId?: string | null
  parentChatroomId?: string | null
  missionId?: string | null
  taskId?: string | null
  autoStart?: boolean
  createTranscript?: boolean
  config?: Record<string, unknown> | null
}

export interface ProtocolTemplatePayload {
  name: string
  description: string
  tags: string[]
  recommendedOutputs: string[]
  singleAgentAllowed: boolean
  steps: ProtocolStepDefinition[]
  entryStepId?: string | null
}

export type ProtocolRunActionPayload =
  | { action: 'start' | 'pause' | 'resume' | 'retry_phase' | 'skip_phase' | 'cancel' | 'archive' }
  | { action: 'inject_context'; context: string }

type QueryOptions = {
  enabled?: boolean
}

type ProtocolRunListQueryOptions = ProtocolRunListParams & QueryOptions

function normalizeRunListParams(params: ProtocolRunListParams = {}) {
  return {
    limit: params.limit ?? 120,
    missionId: params.missionId ?? null,
    taskId: params.taskId ?? null,
    sessionId: params.sessionId ?? null,
    parentChatroomId: params.parentChatroomId ?? null,
  }
}

function buildRunListQueryString(params: ReturnType<typeof normalizeRunListParams>): string {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit))
  if (params.missionId) query.set('missionId', params.missionId)
  if (params.taskId) query.set('taskId', params.taskId)
  if (params.sessionId) query.set('sessionId', params.sessionId)
  if (params.parentChatroomId) query.set('parentChatroomId', params.parentChatroomId)
  return query.toString()
}

export const protocolQueryKeys = {
  all: ['protocols'] as const,
  templates: () => ['protocols', 'templates'] as const,
  runs: () => ['protocols', 'runs'] as const,
  runList: (params: ReturnType<typeof normalizeRunListParams>) => ['protocols', 'runs', params] as const,
  runDetail: (runId: string | null) => ['protocols', 'run', runId] as const,
}

export function useProtocolTemplatesQuery(options: QueryOptions = {}) {
  return useQuery<ProtocolTemplate[]>({
    queryKey: protocolQueryKeys.templates(),
    queryFn: () => api<ProtocolTemplate[]>('GET', '/protocols/templates'),
    enabled: options.enabled,
    staleTime: 30_000,
  })
}

export function useProtocolRunsQuery(options: ProtocolRunListQueryOptions = {}) {
  const params = normalizeRunListParams(options)
  return useQuery<ProtocolRun[]>({
    queryKey: protocolQueryKeys.runList(params),
    queryFn: () => api<ProtocolRun[]>('GET', `/protocols/runs?${buildRunListQueryString(params)}`),
    enabled: options.enabled,
    staleTime: 5_000,
  })
}

export function useProtocolRunDetailQuery(runId: string | null, options: QueryOptions = {}) {
  return useQuery<ProtocolRunDetail | null>({
    queryKey: protocolQueryKeys.runDetail(runId),
    queryFn: () => api<ProtocolRunDetail>('GET', `/protocols/runs/${runId}`),
    enabled: options.enabled ?? Boolean(runId),
    staleTime: 5_000,
  })
}

export function useCreateProtocolRunMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProtocolRunCreatePayload) => api<ProtocolRun>('POST', '/protocols/runs', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: protocolQueryKeys.all })
    },
  })
}

export function useProtocolRunActionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, payload }: { runId: string; payload: ProtocolRunActionPayload }) =>
      api('POST', `/protocols/runs/${runId}/actions`, payload),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: protocolQueryKeys.runs() }),
        queryClient.invalidateQueries({ queryKey: protocolQueryKeys.runDetail(variables.runId) }),
      ])
    },
  })
}

export function useUpsertProtocolTemplateMutation() {
  const queryClient = useQueryClient()
  return useMutation<ProtocolTemplate, Error, { templateId?: string | null; payload: ProtocolTemplatePayload }>({
    mutationFn: ({ templateId, payload }: { templateId?: string | null; payload: ProtocolTemplatePayload }) =>
      templateId
        ? api<ProtocolTemplate>('PATCH', `/protocols/templates/${templateId}`, payload)
        : api<ProtocolTemplate>('POST', '/protocols/templates', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: protocolQueryKeys.all })
    },
  })
}

export function useDeleteProtocolTemplateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => api('DELETE', `/protocols/templates/${templateId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: protocolQueryKeys.all })
    },
  })
}
