'use client'

import { useCallback, useRef, useState } from 'react'
import type { Transform } from './use-org-chart-pan-zoom'

export interface DragState {
  agentId: string
  startX: number
  startY: number
  currentX: number
  currentY: number
  dropTargetId: string | null
}

interface UseDragOpts {
  transform: Transform
  containerRef: React.RefObject<HTMLDivElement | null>
  onDrop: (agentId: string, newParentId: string | null, canvasX: number, canvasY: number) => void
  findDropTarget: (canvasX: number, canvasY: number, draggedId: string) => string | null
}

export function useOrgChartDrag({ transform, containerRef, onDrop, findDropTarget }: UseDragOpts) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  // Refs mirror state so event handlers never see stale closures
  const dragRef = useRef<DragState | null>(null)
  const moved = useRef(false)
  const pointerIdRef = useRef<number | null>(null)

  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: (sx - rect.left - transform.x) / transform.scale,
      y: (sy - rect.top - transform.y) / transform.scale,
    }
  }, [transform, containerRef])

  const startDrag = useCallback((e: React.PointerEvent, agentId: string) => {
    if (e.button !== 0 || e.altKey) return
    e.stopPropagation()
    moved.current = false
    pointerIdRef.current = e.pointerId
    const canvas = screenToCanvas(e.clientX, e.clientY)
    const state: DragState = {
      agentId,
      startX: canvas.x,
      startY: canvas.y,
      currentX: canvas.x,
      currentY: canvas.y,
      dropTargetId: null,
    }
    dragRef.current = state
    setDragState(state)
    // Capture on the container so move/up events route here
    containerRef.current?.setPointerCapture(e.pointerId)
  }, [screenToCanvas, containerRef])

  const moveDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    moved.current = true
    const canvas = screenToCanvas(e.clientX, e.clientY)
    const target = findDropTarget(canvas.x, canvas.y, d.agentId)
    const next: DragState = { ...d, currentX: canvas.x, currentY: canvas.y, dropTargetId: target }
    dragRef.current = next
    setDragState(next)
  }, [screenToCanvas, findDropTarget])

  const endDrag = useCallback((_evt: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (pointerIdRef.current != null) {
      containerRef.current?.releasePointerCapture(pointerIdRef.current)
    }
    pointerIdRef.current = null
    dragRef.current = null
    if (moved.current) {
      onDrop(d.agentId, d.dropTargetId, d.currentX, d.currentY)
    }
    setDragState(null)
  }, [onDrop, containerRef])

  const isDragging = dragState != null

  return { dragState, isDragging, startDrag, moveDrag, endDrag }
}
