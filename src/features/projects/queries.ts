import { useQuery } from '@tanstack/react-query'
import { fetchProjects } from '@/lib/projects'
import type { Project } from '@/types'

type QueryOptions = {
  enabled?: boolean
}

export const projectQueryKeys = {
  all: ['projects'] as const,
}

export function useProjectsQuery(options: QueryOptions = {}) {
  return useQuery<Record<string, Project>>({
    queryKey: projectQueryKeys.all,
    queryFn: fetchProjects,
    enabled: options.enabled,
    staleTime: 60_000,
  })
}
