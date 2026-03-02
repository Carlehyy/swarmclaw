'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/use-app-store'
import { useChatroomStore } from '@/stores/use-chatroom-store'
import { parsePath, buildPath, DEFAULT_VIEW } from '@/lib/view-routes'

/** Map a view to the relevant entity ID from stores */
function getIdForView(view: string): string | null {
  if (view === 'agents') return useAppStore.getState().currentAgentId
  if (view === 'chatrooms') return useChatroomStore.getState().currentChatroomId
  return null
}

/** Apply a parsed route to the stores */
function applyRoute(view: string, id: string | null) {
  if (view === 'agents') useAppStore.getState().setCurrentAgent(id)
  if (view === 'chatrooms') useChatroomStore.getState().setCurrentChatroom(id)
}

export function useViewRouter() {
  const fromPopstate = useRef(false)
  const suppressPush = useRef(false)

  // Mount: read pathname → set active view + entity ID
  useEffect(() => {
    const parsed = parsePath(window.location.pathname)
    if (parsed) {
      suppressPush.current = true
      useAppStore.getState().setActiveView(parsed.view)
      applyRoute(parsed.view, parsed.id)
      suppressPush.current = false
    } else {
      useAppStore.getState().setActiveView(DEFAULT_VIEW)
      window.history.replaceState(null, '', buildPath(DEFAULT_VIEW))
    }
  }, [])

  // State→URL: push new path when activeView or entity ID changes
  useEffect(() => {
    let prevView = useAppStore.getState().activeView
    let prevId = getIdForView(prevView)

    const unsubApp = useAppStore.subscribe((state) => {
      if (suppressPush.current) return
      const nextView = state.activeView
      const nextId = getIdForView(nextView)

      if (nextView === prevView && nextId === prevId) return
      prevView = nextView
      prevId = nextId

      if (fromPopstate.current) {
        fromPopstate.current = false
        return
      }
      const targetPath = buildPath(nextView, nextId)
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath)
      }
    })

    const unsubChatroom = useChatroomStore.subscribe((state) => {
      if (suppressPush.current) return
      const currentView = useAppStore.getState().activeView
      if (currentView !== 'chatrooms') return
      const nextId = state.currentChatroomId
      if (nextId === prevId) return
      prevId = nextId

      if (fromPopstate.current) {
        fromPopstate.current = false
        return
      }
      const targetPath = buildPath('chatrooms', nextId)
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath)
      }
    })

    return () => {
      unsubApp()
      unsubChatroom()
    }
  }, [])

  // Popstate: browser back/forward → update view + entity ID
  useEffect(() => {
    const onPopstate = () => {
      const parsed = parsePath(window.location.pathname)
      if (parsed) {
        fromPopstate.current = true
        suppressPush.current = true
        useAppStore.getState().setActiveView(parsed.view)
        applyRoute(parsed.view, parsed.id)
        suppressPush.current = false
      }
    }
    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [])
}
