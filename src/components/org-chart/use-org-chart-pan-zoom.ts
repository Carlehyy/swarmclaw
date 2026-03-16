'use client'

import { useCallback, useRef, useState } from 'react'

export interface Transform {
  x: number
  y: number
  scale: number
}

const MIN_SCALE = 0.15
const MAX_SCALE = 3
const ZOOM_FACTOR = 0.002

export function useOrgChartPanZoom() {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  const onWheel = useCallback((e: React.WheelEvent) => {
    const container = e.currentTarget as HTMLElement
    if (!container.contains(e.target as Node)) return
    e.preventDefault()
    // Capture rect before the async setState callback
    const rect = container.getBoundingClientRect()
    const clientX = e.clientX
    const clientY = e.clientY
    const deltaY = e.deltaY
    setTransform((prev) => {
      const delta = -deltaY * ZOOM_FACTOR
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * (1 + delta)))
      const ratio = nextScale / prev.scale
      const px = clientX - rect.left
      const py = clientY - rect.top
      return {
        x: px - (px - prev.x) * ratio,
        y: py - (py - prev.y) * ratio,
        scale: nextScale,
      }
    })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Left-click (no modifier), middle-click, or alt+left-click all pan.
    // Left-click on nodes won't reach here because nodes call e.stopPropagation().
    // Guard: only capture when the DOM target is inside the container (React portals
    // bubble events through the React tree even though the DOM target is elsewhere).
    if (e.button === 0 || e.button === 1) {
      const container = e.currentTarget as HTMLElement
      if (!container.contains(e.target as Node)) return
      e.preventDefault()
      isPanning.current = true
      lastPointer.current = { x: e.clientX, y: e.clientY }
      container.setPointerCapture(e.pointerId)
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    lastPointer.current = { x: e.clientX, y: e.clientY }
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch (_err: unknown) { /* already released */ }
    }
  }, [])

  const zoomIn = useCallback(() => {
    setTransform((prev) => ({ ...prev, scale: Math.min(MAX_SCALE, prev.scale * 1.25) }))
  }, [])

  const zoomOut = useCallback(() => {
    setTransform((prev) => ({ ...prev, scale: Math.max(MIN_SCALE, prev.scale / 1.25) }))
  }, [])

  const fitToScreen = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number }, viewport: { width: number; height: number }) => {
    const bw = bounds.maxX - bounds.minX + 200
    const bh = bounds.maxY - bounds.minY + 200
    if (bw <= 0 || bh <= 0) return
    const scale = Math.min(viewport.width / bw, viewport.height / bh, 1.5)
    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    setTransform({
      x: viewport.width / 2 - cx * scale,
      y: viewport.height / 2 - cy * scale,
      scale,
    })
  }, [])

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  return {
    transform,
    setTransform,
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp },
    zoomIn,
    zoomOut,
    fitToScreen,
    resetView,
  }
}
