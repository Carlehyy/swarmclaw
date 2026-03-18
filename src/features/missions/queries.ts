import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/app/api-client'
import type { Mission } from '@/types'

type MissionListOptions = {
  enabled?: boolean
  limit?: number
}

export const missionQueryKeys = {
  all: ['missions'] as const,
  list: (limit: number) => ['missions', 'list', { limit }] as const,
}

export function useMissionsQuery(options: MissionListOptions = {}) {
  const limit = options.limit ?? 80
  return useQuery<Mission[]>({
    queryKey: missionQueryKeys.list(limit),
    queryFn: () => api<Mission[]>('GET', `/missions?limit=${limit}`),
    enabled: options.enabled,
    staleTime: 30_000,
  })
}
