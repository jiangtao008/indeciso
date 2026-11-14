import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemDTO } from '@shared/types'
import { Icon } from '../icons'

export function DirectReveal({ items, active }: { items: ItemDTO[]; active: boolean }) {
  const [index, setIndex] = useState(0)
  const lastRef = useRef(0)

  const titles = useMemo(
    () => items.map((item) => item.title || '（只有图片）').filter(Boolean),
    [items],
  )

  useEffect(() => {
    if (!active || titles.length <= 1) return
    const timer = window.setInterval(() => {
      let next = Math.floor(Math.random() * titles.length)
      if (next === lastRef.current) next = (next + 1) % titles.length
      lastRef.current = next
      setIndex(next)
    }, 82)
    return () => window.clearInterval(timer)
  }, [active, titles])

  const current = titles[index] ?? '……'

  return (
    <div className="center-stage">
      <div className="slot-card">
        <span className="eyebrow" style={{ justifyContent: 'center', display: 'flex' }}>
          正在从所有候选项里挑
        </span>
        <div className="slot-label flicker mt-5" aria-live="off">
          {current}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--brand)',
                animation: `fade-in .9s ease ${i * 0.18}s infinite alternate`,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
          <Icon name="sparkles" size={14} />
          结果早已算好，只是还没揭晓
        </div>
      </div>
    </div>
  )
}
