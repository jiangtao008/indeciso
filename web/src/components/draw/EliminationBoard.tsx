import { useEffect, useMemo, useState } from 'react'
import type { ItemDTO, ResultSnapshot } from '@shared/types'
import { buildEliminationPlan } from '../../lib/elimination'
import { cn, firstChar } from '../../lib/utils'

interface EliminationBoardProps {
  items: ItemDTO[]
  results: ResultSnapshot[]
  roundMs: number
}

const MAX_CHIPS = 52

export function EliminationBoard({ items, results, roundMs }: EliminationBoardProps) {
  const plan = useMemo(() => buildEliminationPlan(items, results), [items, results])
  const [round, setRound] = useState(-1)

  useEffect(() => {
    let cancelled = false
    let timer = 0
    let current = 0
    const tick = () => {
      if (cancelled) return
      setRound(current)
      current += 1
      if (current < plan.rounds.length) {
        timer = window.setTimeout(tick, roundMs)
      }
    }
    setRound(-1)
    timer = window.setTimeout(tick, 420)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [plan, roundMs])

  const keep =
    round >= 0 && plan.rounds.length > 0
      ? new Set(plan.rounds[Math.min(round, plan.rounds.length - 1)])
      : null
  const finalRound = plan.rounds.length > 0 && round >= plan.rounds.length - 1
  const resultIds = useMemo(() => new Set(plan.finalIds), [plan.finalIds])

  const display = useMemo(() => {
    if (items.length <= MAX_CHIPS) return items
    const resultItems = items.filter((item) => resultIds.has(item.id))
    const others = items.filter((item) => !resultIds.has(item.id))
    return [...resultItems, ...others.slice(0, Math.max(0, MAX_CHIPS - resultItems.length))]
  }, [items, resultIds])

  const remaining = keep ? keep.size : items.length

  return (
    <div className="center-stage elimination-stage">
      <div className="slot-card" style={{ width: '100%', padding: '22px 20px' }}>
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow" style={{ margin: 0 }}>
            淘汰模式 · 缩小范围中
          </span>
          <span className="chip chip-brand tabular">{remaining} 个幸存</span>
        </div>
        <div className="elimination-board mt-4">
          {display.map((item) => {
            const isOut = keep ? !keep.has(item.id) : false
            const isFinal = finalRound && keep ? keep.has(item.id) && resultIds.has(item.id) : false
            return (
              <span
                key={item.id}
                className={cn(
                  'elimination-chip',
                  isOut && 'is-out',
                  isFinal && 'is-final',
                )}
              >
                {item.title || firstChar(item.title) || '图片项'}
              </span>
            )
          })}
        </div>
        {items.length > MAX_CHIPS && (
          <div className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-mute)' }}>
            另有 {items.length - MAX_CHIPS} 个候选项一同参与淘汰
          </div>
        )}
      </div>
    </div>
  )
}
