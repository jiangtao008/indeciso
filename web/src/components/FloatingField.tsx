import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ItemDTO } from '@shared/types'
import type { DrawPhase } from '../lib/types'
import { cn, mulberry32, prefersReducedMotion } from '../lib/utils'
import { assetUrl } from '../lib/assets'

type FloatItem = Pick<ItemDTO, 'id' | 'title' | 'imageUrl'>

interface FloatingFieldProps {
  items: FloatItem[]
  phase: DrawPhase
  pickedIds: Set<string>
}

interface CardLayout {
  id: string
  title: string
  imageUrl: string
  x: number
  y: number
  w: number
  h: number
  depth: number
  speed: number
  phase: number
  ampX: number
  ampY: number
  rotAmp: number
  baseRot: number
}

const MAX_DESKTOP = 50
const MAX_MOBILE = 10

interface Exclusion {
  cx: number
  cy: number
  hw: number
  hh: number
}

function buildLayouts(
  items: FloatItem[],
  width: number,
  height: number,
  mobile: boolean,
): { layouts: CardLayout[]; hidden: number } {
  if (!width || !height) return { layouts: [], hidden: 0 }

  const maxVisible = mobile ? MAX_MOBILE : MAX_DESKTOP
  let visible = items
  if (items.length > maxVisible) {
    const step = Math.ceil(items.length / maxVisible)
    visible = items.filter((_, index) => index % step === 0).slice(0, maxVisible)
  }

  const density = visible.length
  let base = density <= 5 ? 164 : density <= 15 ? 138 : density <= 30 ? 112 : 92
  if (mobile) base = density <= 5 ? 108 : density <= 12 ? 96 : 86

  const rand = mulberry32(0x9e3779b9 ^ (items.length * 7919) ^ (width << 2) ^ (height << 5))
  const paddingX = mobile ? 14 : 40
  const paddingY = mobile ? 96 : 120

  // Only the hero copy and the bottom controls are kept clear. The center is
  // intentionally usable by the floating cards while idle; a soft veil fades
  // in over it during drawing/result phases instead of reserving it up front.
  const exclusions: Exclusion[] = [
    {
      cx: width / 2,
      cy: mobile ? Math.min(height * 0.18, 150) : Math.min(height * 0.22, 200),
      hw: Math.min(width * (mobile ? 0.47 : 0.45), mobile ? 260 : 540),
      hh: mobile ? 118 : 135,
    },
    {
      cx: width / 2,
      cy: height - (mobile ? 88 : 100),
      hw: Math.min(width * 0.4, mobile ? 210 : 350),
      hh: mobile ? 128 : 125,
    },
  ]

  const inExclusion = (x: number, y: number, hw: number, hh: number) =>
    exclusions.some(
      (ex) => Math.abs(x - ex.cx) < ex.hw + hw && Math.abs(y - ex.cy) < ex.hh + hh,
    )

  const placed: CardLayout[] = []
  const taken: Array<{ x: number; y: number; r: number }> = []

  for (let index = 0; index < visible.length; index++) {
    const item = visible[index]
    const hasTitle = Boolean(item.title.trim())
    const hasImage = Boolean(item.imageUrl)
    let w: number
    let h: number
    if (hasTitle && hasImage) {
      w = base
      h = base * 0.4
    } else if (hasTitle) {
      w = Math.max(88, Math.min(240, 54 + item.title.length * 14))
      h = 42
    } else {
      w = base * 0.48
      h = w
    }
    w = Math.round(w)
    h = Math.round(h)

    let x = width / 2
    let y = height / 2
    let ok = false
    const minDistance = Math.max(mobile ? 36 : 54, Math.min(w, h) * 0.66)

    for (let relax = 0; relax < 4 && !ok; relax++) {
      const effectiveMin = minDistance * (1 - relax * 0.16)
      for (let attempt = 0; attempt < 140; attempt++) {
        const cx = paddingX + w / 2 + rand() * Math.max(1, width - paddingX * 2 - w)
        const cy = paddingY + h / 2 + rand() * Math.max(1, height - paddingY * 2 - h)
        if (inExclusion(cx, cy, w / 2, h / 2)) continue
        let clash = false
        for (const other of taken) {
          const dx = other.x - cx
          const dy = other.y - cy
          if (dx * dx + dy * dy < (effectiveMin + other.r) ** 2) {
            clash = true
            break
          }
        }
        if (clash) continue
        x = cx
        y = cy
        ok = true
        break
      }
    }

    if (!ok) {
      const angle = (index / Math.max(1, visible.length)) * Math.PI * 2
      const xr = width * 0.4
      const yr = height * 0.36
      x = width / 2 + Math.cos(angle) * xr
      y = height * 0.52 + Math.sin(angle) * yr
      if (inExclusion(x, y, w / 2, h / 2.4)) {
        y = height * 0.52 + Math.sin(angle) * yr * 1.12
      }
    }

    taken.push({ x, y, r: Math.max(w, h) / 2 })
    placed.push({
      id: item.id,
      title: item.title,
      imageUrl: item.imageUrl,
      x,
      y,
      w,
      h,
      depth: 0.45 + rand() * 0.55,
      speed: 0.14 + rand() * 0.16,
      phase: rand() * Math.PI * 2,
      ampX: (mobile ? 5 : 9) + rand() * (mobile ? 7 : 20),
      ampY: (mobile ? 6 : 11) + rand() * (mobile ? 8 : 24),
      rotAmp: 0.5 + rand() * 2.1,
      baseRot: (rand() - 0.5) * 5,
    })
  }

  return { layouts: placed, hidden: items.length - visible.length }
}

export function FloatingField({ items, phase, pickedIds }: FloatingFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [reduced] = useState(prefersReducedMotion)
  const pointer = useRef({ x: 0, y: 0, active: false })
  const phaseRef = useRef<DrawPhase>(phase)
  const pickedRef = useRef(pickedIds)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    pickedRef.current = pickedIds
  }, [pickedIds])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        setSize((prev) =>
          Math.abs(prev.w - rect.width) > 2 || Math.abs(prev.h - rect.height) > 2
            ? { w: rect.width, h: rect.height }
            : prev,
        )
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const mobile = size.w > 0 && size.w < 641
  const { layouts, hidden } = useMemo(
    () => buildLayouts(items, size.w, size.h, mobile),
    [items, size.w, size.h, mobile],
  )

  const layoutRef = useRef(layouts)
  layoutRef.current = layouts

  useEffect(() => {
    if (reduced) return
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      pointer.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        active: true,
      }
    }
    const onLeave = () => {
      pointer.current.active = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [reduced])

  useEffect(() => {
    if (!layouts.length) return
    const map = cardRefs.current

    if (reduced) {
      layouts.forEach((layout) => {
        const el = map.get(layout.id)
        if (el) {
          el.style.transform = `translate3d(${layout.x}px, ${layout.y}px, 0) translate(-50%, -50%) rotate(${layout.baseRot}deg)`
        }
      })
      return
    }

    let raf = 0
    let last = performance.now()
    let speedMult = 1
    const times = new Map<string, number>()
    layouts.forEach((layout, index) => times.set(layout.id, index * 0.7))

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const phaseNow = phaseRef.current
      const target = phaseNow === 'animating' || phaseNow === 'preparing' ? 2.5 : phaseNow === 'revealing' ? 0.6 : 1
      speedMult += (target - speedMult) * Math.min(1, dt * 2.4)

      for (const layout of layoutRef.current) {
        const el = map.get(layout.id)
        if (!el) continue
        const t = (times.get(layout.id) ?? 0) + dt * speedMult
        times.set(layout.id, t)

        let x = layout.x + Math.sin(t * layout.speed + layout.phase) * layout.ampX
        let y = layout.y + Math.cos(t * layout.speed * 0.82 + layout.phase * 1.3) * layout.ampY
        const rot = layout.baseRot + Math.sin(t * layout.speed * 0.6 + layout.phase * 2) * layout.rotAmp

        if (pointer.current.active) {
          const dx = x - pointer.current.x
          const dy = y - pointer.current.y
          const dist = Math.hypot(dx, dy)
          if (dist < 190 && dist > 0.5) {
            const push = (1 - dist / 190) * 22 * layout.depth
            x += (dx / dist) * push
            y += (dy / dist) * push
          }
          x += (pointer.current.x - layout.x) * 0.008 * layout.depth
          y += (pointer.current.y - layout.y) * 0.008 * layout.depth
        }

        const picked = pickedRef.current.has(layout.id)
        const scale = (picked ? 1.12 : 1) * (0.94 + layout.depth * 0.12)
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [layouts, reduced])

  return (
    <div
      ref={containerRef}
      className={cn(
        'float-layer',
        (phase === 'revealing' || phase === 'completed') && 'dimmed',
        (phase === 'animating' || phase === 'preparing') && 'energized',
      )}
      aria-hidden="true"
    >
      {layouts.map((layout) => {
        const picked = pickedIds.has(layout.id)
        return (
          <div
            key={layout.id}
            className={cn('float-card', picked && 'is-picked')}
            style={{
              width: layout.w,
              transform: `translate3d(${layout.x}px, ${layout.y}px, 0) translate(-50%, -50%) rotate(${layout.baseRot}deg)`,
              opacity: 0,
              animation: 'fade-in .7s ease forwards',
            }}
            ref={(el) => {
              if (el) cardRefs.current.set(layout.id, el)
              else cardRefs.current.delete(layout.id)
            }}
          >
            <div
              className="float-card-inner"
              style={{ minHeight: layout.h, borderRadius: layout.h <= 56 ? 16 : 18 }}
            >
              {layout.imageUrl ? (
                <img
                  src={assetUrl(layout.imageUrl)}
                  alt=""
                  loading="lazy"
                  style={{
                    width: Math.max(30, layout.h - 18),
                    height: Math.max(30, layout.h - 18),
                    borderRadius: 11,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                  onError={(event) => {
                    ;(event.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <span className="float-card-dot" />
              )}
              {layout.title && <span className="float-card-title">{layout.title}</span>}
            </div>
          </div>
        )
      })}
      {hidden > 0 && (
        <div
          className="chip"
          style={{ position: 'absolute', left: 18, bottom: 16, pointerEvents: 'none' }}
        >
          +{hidden} 个候选项也在参与
        </div>
      )}
    </div>
  )
}
