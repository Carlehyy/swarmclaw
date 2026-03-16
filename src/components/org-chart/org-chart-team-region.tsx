'use client'

import { useState } from 'react'

export interface ResizeDirection {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

interface Props {
  label: string
  color: string | null
  x: number
  y: number
  width: number
  height: number
  isSelected?: boolean
  onClick?: () => void
  onDragPointerDown?: (e: React.PointerEvent) => void
  onResizePointerDown?: (e: React.PointerEvent, direction: ResizeDirection) => void
}

const DEFAULT_TEAM_COLOR = '#6366F1'
const PAD_X = 16
const PAD_TOP = 24
const PAD_BOTTOM = 16

const HANDLE_SIZE = 12
const EDGE_THICKNESS = 8

export function OrgChartTeamRegion({ label, color, x, y, width, height, isSelected, onClick, onDragPointerDown, onResizePointerDown }: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const c = color || DEFAULT_TEAM_COLOR
  const rx = x - PAD_X
  const ry = y - PAD_TOP
  const rw = width + PAD_X * 2
  const rh = height + PAD_TOP + PAD_BOTTOM
  const showHandles = isSelected || isHovered
  return (
    <g
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {/* Background */}
      <rect
        x={rx} y={ry} width={rw} height={rh} rx={12}
        fill={c}
        fillOpacity={isSelected ? 0.12 : 0.06}
        stroke={c}
        strokeOpacity={isSelected ? 0.3 : 0.12}
        strokeWidth={isSelected ? 2 : 1}
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onClick={onClick}
      />
      {/* Drag handle — top-left grip dots */}
      <g
        style={{ cursor: 'grab', pointerEvents: 'all' }}
        onPointerDown={onDragPointerDown}
      >
        <rect x={rx} y={ry} width={28} height={20} rx={6} fill="transparent" />
        {[0, 5, 10].map((dy) => (
          [0, 5].map((dx) => (
            <circle key={`${dx}-${dy}`} cx={rx + 10 + dx} cy={ry + 7 + dy} r={1} fill={c} fillOpacity={0.4} />
          ))
        ))}
      </g>
      {/* Label */}
      <text
        x={rx + 28}
        y={y - 10}
        fill={c}
        fillOpacity={0.5}
        fontSize={10}
        fontWeight={700}
        letterSpacing="0.08em"
        style={{ textTransform: 'uppercase', pointerEvents: 'none' } as React.CSSProperties}
      >
        {label}
      </text>
      {/* 8-point resize handles — visible on hover/select */}
      {showHandles && (
        <g>
          {/* Edge handles (invisible strips with cursor) */}
          {/* Top edge */}
          <rect
            x={rx + HANDLE_SIZE} y={ry - EDGE_THICKNESS / 2}
            width={rw - HANDLE_SIZE * 2} height={EDGE_THICKNESS}
            fill="transparent"
            style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: false, right: false, top: true, bottom: false })}
          />
          {/* Bottom edge */}
          <rect
            x={rx + HANDLE_SIZE} y={ry + rh - EDGE_THICKNESS / 2}
            width={rw - HANDLE_SIZE * 2} height={EDGE_THICKNESS}
            fill="transparent"
            style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: false, right: false, top: false, bottom: true })}
          />
          {/* Left edge */}
          <rect
            x={rx - EDGE_THICKNESS / 2} y={ry + HANDLE_SIZE}
            width={EDGE_THICKNESS} height={rh - HANDLE_SIZE * 2}
            fill="transparent"
            style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: true, right: false, top: false, bottom: false })}
          />
          {/* Right edge */}
          <rect
            x={rx + rw - EDGE_THICKNESS / 2} y={ry + HANDLE_SIZE}
            width={EDGE_THICKNESS} height={rh - HANDLE_SIZE * 2}
            fill="transparent"
            style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: false, right: true, top: false, bottom: false })}
          />
          {/* Corner handles (visible dots + hit rects) */}
          {/* Top-left */}
          <g
            style={{ cursor: 'nwse-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: true, right: false, top: true, bottom: false })}
          >
            <rect x={rx - HANDLE_SIZE / 2} y={ry - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} fill="transparent" />
            <circle cx={rx} cy={ry} r={4} fill={c} fillOpacity={0.4} />
          </g>
          {/* Top-right */}
          <g
            style={{ cursor: 'nesw-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: false, right: true, top: true, bottom: false })}
          >
            <rect x={rx + rw - HANDLE_SIZE / 2} y={ry - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} fill="transparent" />
            <circle cx={rx + rw} cy={ry} r={4} fill={c} fillOpacity={0.4} />
          </g>
          {/* Bottom-left */}
          <g
            style={{ cursor: 'nesw-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: true, right: false, top: false, bottom: true })}
          >
            <rect x={rx - HANDLE_SIZE / 2} y={ry + rh - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} fill="transparent" />
            <circle cx={rx} cy={ry + rh} r={4} fill={c} fillOpacity={0.4} />
          </g>
          {/* Bottom-right */}
          <g
            style={{ cursor: 'nwse-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => onResizePointerDown?.(e, { left: false, right: true, top: false, bottom: true })}
          >
            <rect x={rx + rw - HANDLE_SIZE / 2} y={ry + rh - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} fill="transparent" />
            <circle cx={rx + rw} cy={ry + rh} r={4} fill={c} fillOpacity={0.4} />
          </g>
        </g>
      )}
    </g>
  )
}
