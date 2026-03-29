'use client'

interface ConnectionLineProps {
  startX: number
  startY: number
  endX: number
  endY: number
  isRunning?: boolean
}

export function ConnectionLine({ startX, startY, endX, endY, isRunning }: ConnectionLineProps) {
  // Calculate control points for a smooth bezier curve
  const midX = (startX + endX) / 2
  const cp1X = midX
  const cp1Y = startY
  const cp2X = midX
  const cp2Y = endY

  const pathD = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--border-hover)" />
          <stop offset="100%" stopColor="var(--border-hover)" />
        </linearGradient>
      </defs>
      <path
        d={pathD}
        fill="none"
        stroke="var(--border-hover)"
        strokeWidth="2"
        strokeDasharray={isRunning ? '8 4' : 'none'}
        style={{
          animation: isRunning ? 'dash 0.5s linear infinite' : 'none',
        }}
      />
    </svg>
  )
}
