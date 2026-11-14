import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemDTO, ResultSnapshot } from '@shared/types'

interface WheelProps {
  items: ItemDTO[]
  target: ResultSnapshot | null
  spinKey: number
  duration: number
}

const COLORS = ['#40206b', '#5b2b93', '#7c3aed', '#8f4fd6', '#4b2578', '#6d33b0']

interface Wedge {
  item: ItemDTO
  start: number
  size: number
  center: number
}

export function Wheel({ items, target, spinKey, duration }: WheelProps) {
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(0)
  const rafRef = useRef(0)

  const wedges = useMemo<Wedge[]>(() => {
    const totalWeight = items.reduce(
      (sum, item) => sum + (Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1),
      0,
    )
    let cursor = 0
    return items.map((item) => {
      const weight = Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1
      const size = (weight / totalWeight) * 360
      const wedge = { item, start: cursor, size, center: cursor + size / 2 }
      cursor += size
      return wedge
    })
  }, [items])

  useEffect(() => {
    if (!target || wedges.length === 0) return
    const index = wedges.findIndex((wedge) => wedge.item.id === target.itemId)
    if (index === -1) return
    const wedge = wedges[index]
    const half = Math.max(0.5, wedge.size / 2)
    const jitter = (Math.random() - 0.5) * half * 0.9
    const current = rotationRef.current
    const currentMod = ((current % 360) + 360) % 360
    const targetMod = ((-(wedge.center + jitter) % 360) + 360) % 360
    let delta = targetMod - currentMod
    if (delta < 0) delta += 360
    const turns = 4 + Math.floor(Math.random() * 2)
    const next = current + turns * 360 + delta
    rotationRef.current = next
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setRotation(next))
  }, [spinKey, target, wedges])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const cx = 240
  const cy = 240
  const radius = 208
  const count = wedges.length
  const labelEvery = count > 26 ? Math.ceil(count / 18) : 1
  const single = count === 1

  const wedgePath = (start: number, size: number) => {
    if (size >= 359.99) {
      return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
    }
    const startRad = (start * Math.PI) / 180
    const endRad = ((start + size) * Math.PI) / 180
    const x1 = cx + radius * Math.sin(startRad)
    const y1 = cy - radius * Math.cos(startRad)
    const x2 = cx + radius * Math.sin(endRad)
    const y2 = cy - radius * Math.cos(endRad)
    const largeArc = size > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
  }

  return (
    <div className="center-stage flex flex-col items-center">
      <div className="relative wheel-shell" style={{ aspectRatio: '1 / 1' }}>
        <svg
          viewBox="0 0 480 480"
          style={{
            width: '100%',
            height: '100%',
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.12, 1)`,
            transformOrigin: '50% 50%',
            willChange: 'transform',
          }}
          aria-hidden="true"
        >
          <circle cx={cx} cy={cy} r={radius + 10} fill="rgba(255,255,255,0.03)" />
          {wedges.map((wedge, index) =>
            single ? (
              <circle key={wedge.item.id} cx={cx} cy={cy} r={radius} fill={COLORS[index % COLORS.length]} />
            ) : (
              <path
                key={wedge.item.id}
                d={wedgePath(wedge.start, wedge.size)}
                fill={COLORS[index % COLORS.length]}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={1.2}
              />
            ),
          )}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
          {wedges.map((wedge, index) => {
            if (count > 1 && index % labelEvery !== 0) return null
            if (wedge.size < 2.4) return null
            const labelRadius = radius * 0.64
            const angleRad = (wedge.center * Math.PI) / 180
            const x = cx + labelRadius * Math.sin(angleRad)
            const y = cy - labelRadius * Math.cos(angleRad)
            const flip = wedge.center > 90 && wedge.center < 270
            const title = wedge.item.title || '…'
            const clipped = Array.from(title).slice(0, count > 18 ? 4 : 6).join('')
            return (
              <text
                key={`label-${wedge.item.id}`}
                className="wheel-label"
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${wedge.center + (flip ? 180 : 0)} ${x} ${y})`}
                style={{ fontSize: count > 20 ? 9.5 : count > 12 ? 10.5 : 11.5 }}
              >
                {clipped}
              </text>
            )
          })}
        </svg>

        <div
          className="wheel-pointer"
          style={{
            position: 'absolute',
            top: -16,
            left: '50%',
            zIndex: 3,
            filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.5))',
          }}
        >
          <svg width="40" height="46" viewBox="0 0 40 46" aria-hidden="true">
            <path
              d="M20 44 L4 10 A40 40 0 0 1 36 10 Z"
              fill="url(#pointerGradient)"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="1.4"
            />
            <defs>
              <linearGradient id="pointerGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff86c8" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: '50%',
              background: 'var(--surface-solid)',
              border: '1px solid var(--line-strong)',
              boxShadow: '0 14px 34px -16px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.12)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <img
              src="/mascot.jpeg"
              alt=""
              style={{ width: 62, height: 62, borderRadius: 16, objectFit: 'cover' }}
            />
          </div>
        </div>
      </div>
      <div
        className="mt-4 flex items-center gap-2 text-[12px]"
        style={{ color: 'var(--text-mute)' }}
      >
        {count} 个候选项 · 按权重分布扇区
      </div>
    </div>
  )
}
