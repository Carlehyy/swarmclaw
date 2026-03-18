'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useWs } from '@/hooks/use-ws'
import { agentQueryKeys } from '@/features/agents/queries'
import { taskQueryKeys } from '@/features/tasks/queries'
import { protocolQueryKeys } from '@/features/protocols/queries'

function LiveQueryTopicSubscription({
  topic,
  fallbackMs,
  onEvent,
}: {
  topic: string
  fallbackMs?: number
  onEvent: () => void
}) {
  useWs(topic, onEvent, fallbackMs)
  return null
}

export function LiveQuerySync() {
  const queryClient = useQueryClient()

  return (
    <>
      <LiveQueryTopicSubscription
        topic="agents"
        fallbackMs={60_000}
        onEvent={() => {
          void queryClient.invalidateQueries({ queryKey: agentQueryKeys.all })
        }}
      />
      <LiveQueryTopicSubscription
        topic="tasks"
        fallbackMs={5_000}
        onEvent={() => {
          void queryClient.invalidateQueries({ queryKey: taskQueryKeys.all })
        }}
      />
      <LiveQueryTopicSubscription
        topic="protocol_runs"
        fallbackMs={2_000}
        onEvent={() => {
          void queryClient.invalidateQueries({ queryKey: protocolQueryKeys.all })
        }}
      />
      <LiveQueryTopicSubscription
        topic="protocol_templates"
        fallbackMs={2_000}
        onEvent={() => {
          void queryClient.invalidateQueries({ queryKey: protocolQueryKeys.templates() })
        }}
      />
    </>
  )
}
