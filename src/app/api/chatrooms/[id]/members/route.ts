import { NextResponse } from 'next/server'
import { loadChatrooms, saveChatrooms, loadAgents } from '@/lib/server/storage'
import { notify } from '@/lib/server/ws-hub'
import { notFound } from '@/lib/server/collection-helpers'
import { genId } from '@/lib/id'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const chatrooms = loadChatrooms()
  const chatroom = chatrooms[id]
  if (!chatroom) return notFound()

  const agentId = body.agentId as string
  if (!agentId) return NextResponse.json({ error: 'agentId is required' }, { status: 400 })

  if (!chatroom.agentIds.includes(agentId)) {
    chatroom.agentIds.push(agentId)

    // Inject a system event message
    const agents = loadAgents()
    const agentName = agents[agentId]?.name || 'Unknown agent'
    if (!Array.isArray(chatroom.messages)) chatroom.messages = []
    chatroom.messages.push({
      id: genId(),
      senderId: 'system',
      senderName: 'System',
      role: 'assistant',
      text: `${agentName} has joined the chat`,
      mentions: [],
      reactions: [],
      time: Date.now(),
    })

    chatroom.updatedAt = Date.now()
    chatrooms[id] = chatroom
    saveChatrooms(chatrooms)
    notify('chatrooms')
    notify(`chatroom:${id}`)
  }

  return NextResponse.json(chatroom)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const chatrooms = loadChatrooms()
  const chatroom = chatrooms[id]
  if (!chatroom) return notFound()

  const agentId = body.agentId as string
  if (!agentId) return NextResponse.json({ error: 'agentId is required' }, { status: 400 })

  const wasPresent = chatroom.agentIds.includes(agentId)
  chatroom.agentIds = chatroom.agentIds.filter((aid: string) => aid !== agentId)

  // Inject a system event message
  if (wasPresent) {
    const agents = loadAgents()
    const agentName = agents[agentId]?.name || 'Unknown agent'
    if (!Array.isArray(chatroom.messages)) chatroom.messages = []
    chatroom.messages.push({
      id: genId(),
      senderId: 'system',
      senderName: 'System',
      role: 'assistant',
      text: `${agentName} has left the chat`,
      mentions: [],
      reactions: [],
      time: Date.now(),
    })
  }

  chatroom.updatedAt = Date.now()
  chatrooms[id] = chatroom
  saveChatrooms(chatrooms)
  notify('chatrooms')
  notify(`chatroom:${id}`)

  return NextResponse.json(chatroom)
}
