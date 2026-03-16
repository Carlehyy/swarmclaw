'use client'

interface Props {
  x1: number
  y1: number
  x2: number
  y2: number
  active?: boolean
  messagePreview?: string | null
}

export function OrgChartEdge({ x1, y1, x2, y2, active, messagePreview }: Props) {
  // Cubic bezier from parent bottom-center to child top-center
  const midY = (y1 + y2) / 2
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

  // Midpoint for message preview label
  const labelX = (x1 + x2) / 2
  const labelY = midY

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}
        strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round"
      />
      {active && (
        <>
          {/* Glow effect */}
          <path
            d={d}
            fill="none"
            stroke="rgba(99,102,241,0.15)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          {/* Traveling dot */}
          <circle r="3" fill="rgba(99,102,241,0.8)">
            <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
          </circle>
        </>
      )}
      {active && messagePreview && (
        <foreignObject x={labelX - 60} y={labelY - 10} width={120} height={20} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <div style={{
            fontSize: 9,
            color: 'rgba(165,180,252,0.8)',
            background: 'rgba(10,10,20,0.8)',
            borderRadius: 4,
            padding: '1px 6px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 120,
          }}>
            {messagePreview}
          </div>
        </foreignObject>
      )}
    </g>
  )
}
