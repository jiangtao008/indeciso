import type { ItemDTO, ResultSnapshot } from '@shared/types'
import { shuffle } from './utils'

export interface EliminationPlan {
  /** Survivor item ids after each elimination round; the last set is exactly the results. */
  rounds: string[][]
  /** All item ids in display order. */
  all: string[]
  /** Result item ids. */
  finalIds: string[]
}

/**
 * Builds a purely visual elimination script. The final survivors are always the
 * results computed by the server beforehand — this never influences the draw.
 */
export function buildEliminationPlan(items: ItemDTO[], results: ResultSnapshot[]): EliminationPlan {
  const finalIds = results.map((r) => r.itemId)
  const resultSet = new Set(finalIds)
  const all = items.map((i) => i.id)
  const others = shuffle(all.filter((id) => !resultSet.has(id)))

  if (others.length === 0) {
    return { rounds: [], all, finalIds }
  }

  const keepFractions = [0.58, 0.24, 0]
  const rounds: string[][] = []
  for (const fraction of keepFractions) {
    const keepCount = fraction <= 0 ? 0 : Math.ceil(others.length * fraction)
    rounds.push([...finalIds, ...others.slice(0, keepCount)])
  }
  return { rounds, all, finalIds }
}
