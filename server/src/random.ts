import { db, safeJson } from './db'
import { secureRandomFloat } from './passwords'
import type { ItemDTO, ResultSnapshot } from '../../shared/types'

/** Union of item ids that appeared in the most recent N completed rounds of this pool. */
export function getExclusionSet(
  poolId: string,
  rounds: number,
  excludeHistoryId?: string | null,
): Set<string> {
  const excluded = new Set<string>()
  if (!Number.isFinite(rounds) || rounds <= 0) return excluded
  const rows = (
    excludeHistoryId
      ? db
          .prepare(
            `SELECT results_snapshot FROM history
             WHERE pool_id = ? AND id != ?
             ORDER BY created_at DESC, rowid DESC LIMIT ?`,
          )
          .all(poolId, excludeHistoryId, rounds)
      : db
          .prepare(
            `SELECT results_snapshot FROM history
             WHERE pool_id = ?
             ORDER BY created_at DESC, rowid DESC LIMIT ?`,
          )
          .all(poolId, rounds)
  ) as Array<{ results_snapshot: string }>
  for (const row of rows) {
    for (const result of safeJson<ResultSnapshot[]>(row.results_snapshot, [])) {
      if (result?.itemId) excluded.add(String(result.itemId))
    }
  }
  return excluded
}

/**
 * Weighted sampling without replacement (Efraimidis-Spirakis style via random keys).
 * Each pick recalculates probabilities from the remaining candidates' weights, as
 * required by the product spec. Crypto-random source; no animation involved.
 */
export function weightedSampleWithoutReplacement(
  items: ItemDTO[],
  count: number,
): ItemDTO[] {
  const pool = items.map((item) => ({
    item,
    weight: Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1,
  }))
  const picked: ItemDTO[] = []
  const target = Math.min(count, pool.length)
  for (let k = 0; k < target; k++) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let roll = secureRandomFloat() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight
      if (roll < 0) {
        index = i
        break
      }
    }
    picked.push(pool[index].item)
    pool.splice(index, 1)
  }
  return picked
}

/** Pick one candidate using weighted random (for single re-draws). */
export function weightedPick(items: ItemDTO[]): ItemDTO | null {
  return weightedSampleWithoutReplacement(items, 1)[0] ?? null
}

export function toSnapshot(item: ItemDTO): ResultSnapshot {
  return {
    itemId: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    sortOrder: item.sortOrder,
  }
}
