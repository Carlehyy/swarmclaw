import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/app/api-client'
import type { Chatroom } from '@/types'

type QueryOptions = {
  enabled?: boolean
}

export const chatroomQueryKeys = {
  all: ['chatrooms'] as const,
}

export function useChatroomsQuery(options: QueryOptions = {}) {
  return useQuery<Record<string, Chatroom>>({
    queryKey: chatroomQueryKeys.all,
    queryFn: () => api<Record<string, Chatroom>>('GET', '/chatrooms'),
    enabled: options.enabled,
    staleTime: 30_000,
  })
}
