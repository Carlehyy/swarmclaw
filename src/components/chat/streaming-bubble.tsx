'use client'

import { useMemo, useState } from 'react'
import { AiAvatar } from '@/components/shared/avatar'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { ToolCallBubble } from './tool-call-bubble'
import { ActivityMoment, isNotableTool } from './activity-moment'
import { useChatStore, type ToolEvent } from '@/stores/use-chat-store'
import { isStructuredMarkdown } from './markdown-utils'

function ToolEventsSection({ toolEvents }: { toolEvents: ToolEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  const shouldCollapse = toolEvents.length > 2
  const latestTool = toolEvents[toolEvents.length - 1]

  if (shouldCollapse && !expanded) {
    return (
      <div className="max-w-[85%] md:max-w-[72%] flex flex-col gap-2 mb-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] cursor-pointer transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-3/60">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="text-[11px] text-text-3 font-mono">
            {toolEvents.length} tool calls
          </span>
          <span className="text-[10px] text-text-3/50">
            latest: {latestTool?.name || 'unknown'}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-[85%] md:max-w-[72%] flex flex-col gap-2 mb-2">
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="self-start px-2.5 py-1 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.07] text-[11px] text-text-3 border border-white/[0.06] cursor-pointer transition-colors"
        >
          Collapse tool calls
        </button>
      )}
      {toolEvents.map((event) => (
        <ToolCallBubble key={event.id} event={event} />
      ))}
    </div>
  )
}

interface Props {
  text: string
  assistantName?: string
  agentAvatarSeed?: string
  agentName?: string
}

export function StreamingBubble({ text, assistantName, agentAvatarSeed, agentName }: Props) {
  const toolEvents = useChatStore((s) => s.toolEvents)
  const streamPhase = useChatStore((s) => s.streamPhase)
  const streamToolName = useChatStore((s) => s.streamToolName)
  const wide = useMemo(() => isStructuredMarkdown(text), [text])

  // Track which activity moments have been dismissed
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Find the latest completed notable tool event that hasn't been dismissed
  let currentMoment: { id: string; name: string; input: string } | null = null
  for (let i = toolEvents.length - 1; i >= 0; i--) {
    const event = toolEvents[i]
    if (event.status === 'done' && isNotableTool(event.name) && !dismissedIds.has(event.id)) {
      currentMoment = { id: event.id, name: event.name, input: event.input }
      break
    }
  }

  const handleDismiss = (momentId: string) => {
    setDismissedIds((prev) => new Set(prev).add(momentId))
  }

  return (
    <div
      className="flex flex-col items-start relative pl-[44px]"
      style={{ animation: 'msg-in-left 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <div className="absolute left-[4px] top-0 relative">
        {agentName ? <AgentAvatar seed={agentAvatarSeed || null} name={agentName} size={28} /> : <AiAvatar size="sm" mood={streamPhase === 'tool' ? 'tool' : 'thinking'} />}
        {currentMoment && (
          <ActivityMoment
            key={currentMoment.id}
            toolName={currentMoment.name}
            toolInput={currentMoment.input}
            onDismiss={() => handleDismiss(currentMoment!.id)}
          />
        )}
      </div>
      <div className="flex items-center gap-2.5 mb-2 px-1">
        <span className="text-[12px] font-600 text-text-3">{assistantName || 'Claude'}</span>
        <span className="w-2 h-2 rounded-full bg-accent-bright" style={{ animation: 'pulse 1.5s ease infinite' }} />
        {streamPhase === 'tool' && streamToolName && (
          <span className="text-[10px] text-text-3/50 font-mono">Using {streamToolName}...</span>
        )}
      </div>

      {/* Tool call events (collapsible when > 2) */}
      {toolEvents.length > 0 && (
        <ToolEventsSection toolEvents={toolEvents} />
      )}

      {text && (
        <div className={`${wide ? 'max-w-[92%] md:max-w-[85%]' : 'max-w-[85%] md:max-w-[72%]'} bubble-ai px-5 py-3.5`}>
          <div className="streaming-cursor text-[15px] leading-[1.7] break-words text-text whitespace-pre-wrap">
            {text}
          </div>
        </div>
      )}
    </div>
  )
}
