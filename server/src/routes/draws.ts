import { Router } from 'express'
import { z } from 'zod'
import {
  db,
  getPoolRow,
  listItems,
  mapHistory,
  newId,
  nowISO,
  parsePoolSettings,
  safeJson,
} from '../db'
import { currentUserId, requireAuth } from '../auth'
import { fail, parseWith } from '../http'
import { getExclusionSet, toSnapshot, weightedPick, weightedSampleWithoutReplacement } from '../random'
import type { ResultSnapshot } from '../../../shared/types'

const router = Router()
router.use(requireAuth)

const drawSchema = z.object({
  resultCount: z.number().int().min(1, '结果数量至少为 1').max(500).optional(),
})

const redrawSchema = z.object({
  index: z.number().int().min(0),
})

interface DrawRow {
  id: string
  user_id: string
  pool_id: string
  pool_name_snapshot: string
  mode: string
  results_json: string
  status: string
  history_id: string | null
  created_at: string
  updated_at: string
}

function loadDraw(drawId: string, userId: string): DrawRow | undefined {
  return db
    .prepare('SELECT * FROM draws WHERE id = ? AND user_id = ?')
    .get(drawId, userId) as DrawRow | undefined
}

router.post('/pools/:id/draw', (req, res) => {
  const userId = currentUserId(res)
  const pool = getPoolRow(req.params.id, userId)
  if (!pool) {
    return fail(res, 404, 'POOL_NOT_FOUND', '找不到这个选择池，它可能已经被删除了。')
  }
  const parsed = parseWith(drawSchema, req.body ?? {})
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)

  const items = listItems(req.params.id)
  if (items.length === 0) {
    return fail(res, 400, 'EMPTY_POOL', '这里空空如也，先去设置里添加几个选择项吧。')
  }

  const settings = parsePoolSettings(pool.settings_json)
  const requested = parsed.data.resultCount ?? settings.resultCount
  if (requested > items.length) {
    return fail(
      res,
      400,
      'INVALID_RESULT_COUNT',
      `结果数量不能超过候选项数量（当前 ${items.length} 个）。`,
      { available: items.length, requested },
    )
  }

  const excludedSet = settings.exclusionEnabled
    ? getExclusionSet(req.params.id, settings.exclusionRounds)
    : new Set<string>()
  const available = items.filter((item) => !excludedSet.has(item.id))
  if (available.length === 0) {
    return fail(
      res,
      400,
      'INSUFFICIENT_ITEMS',
      '启用最近结果排除后没有可用的候选项了，请调整排除范围或关闭排除规则。',
      { available: 0, requested },
    )
  }
  if (requested > available.length) {
    return fail(
      res,
      400,
      'INSUFFICIENT_ITEMS',
      `排除最近结果后只剩 ${available.length} 个候选项，装不下 ${requested} 个结果。可以降低数量、缩小排除范围，或者关闭排除规则。`,
      { available: available.length, requested },
    )
  }

  const picked = weightedSampleWithoutReplacement(available, requested)
  const results = picked.map(toSnapshot)
  const drawId = newId('draw')
  const ts = nowISO()
  db.prepare(
    `INSERT INTO draws (id, user_id, pool_id, pool_name_snapshot, mode, results_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(
    drawId,
    userId,
    req.params.id,
    String(pool.name),
    settings.randomMode,
    JSON.stringify(results),
    ts,
    ts,
  )

  res.status(201).json({
    drawId,
    pool: { id: String(pool.id), name: String(pool.name) },
    mode: settings.randomMode,
    results,
    eligibleItemIds: available.map((item) => item.id),
    resultInterval: settings.resultInterval,
    animationSpeed: settings.animationSpeed,
  })
})

router.post('/draws/:id/redraw', (req, res) => {
  const userId = currentUserId(res)
  const draw = loadDraw(req.params.id, userId)
  if (!draw) {
    return fail(res, 404, 'DRAW_NOT_FOUND', '这一轮选择已经找不到了，重新抽一次吧。')
  }
  const parsed = parseWith(redrawSchema, req.body ?? {})
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)

  const results = safeJson<ResultSnapshot[]>(draw.results_json, [])
  const index = parsed.data.index
  if (index < 0 || index >= results.length) {
    return fail(res, 400, 'INVALID_INDEX', '要重抽的结果位置不存在。')
  }

  const pool = getPoolRow(draw.pool_id, userId)
  if (!pool) {
    return fail(res, 404, 'POOL_NOT_FOUND', '这个选择池已经被删除了，无法重新抽取。')
  }
  const items = listItems(draw.pool_id)
  if (items.length === 0) {
    return fail(res, 400, 'EMPTY_POOL', '候选项都被删掉了，无法重新抽取。')
  }
  const settings = parsePoolSettings(pool.settings_json)
  const excludedSet = settings.exclusionEnabled
    ? getExclusionSet(draw.pool_id, settings.exclusionRounds, draw.history_id)
    : new Set<string>()

  const otherIds = new Set(
    results.filter((_, i) => i !== index).map((result) => result.itemId),
  )
  const candidates = items.filter(
    (item) => !excludedSet.has(item.id) && !otherIds.has(item.id),
  )
  const oldItemId = results[index].itemId
  const withoutOld = candidates.filter((item) => item.id !== oldItemId)
  const poolAfterRules = withoutOld.length > 0 ? withoutOld : candidates

  if (poolAfterRules.length === 0) {
    return fail(
      res,
      409,
      'NO_CANDIDATES',
      '没有符合条件的候选项可以替换了。试着调整排除范围，或者这一轮就先这样？',
    )
  }

  const replacement = weightedPick(poolAfterRules)!
  results[index] = toSnapshot(replacement)
  const ts = nowISO()

  db.exec('BEGIN')
  try {
    db.prepare('UPDATE draws SET results_json = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      JSON.stringify(results),
      ts,
      draw.id,
      userId,
    )
    if (draw.status === 'completed' && draw.history_id) {
      db.prepare(
        'UPDATE history SET results_snapshot = ?, result_count = ? WHERE id = ? AND user_id = ?',
      ).run(JSON.stringify(results), results.length, draw.history_id, userId)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  res.json({ item: results[index], index, results })
})

router.post('/draws/:id/complete', (req, res) => {
  const userId = currentUserId(res)
  const draw = loadDraw(req.params.id, userId)
  if (!draw) {
    return fail(res, 404, 'DRAW_NOT_FOUND', '这一轮选择已经找不到了，历史记录没有保存。')
  }

  if (draw.status === 'completed' && draw.history_id) {
    const existing = db
      .prepare('SELECT * FROM history WHERE id = ? AND user_id = ?')
      .get(draw.history_id, userId) as Record<string, unknown> | undefined
    if (existing) {
      return res.json({ history: mapHistory(existing), alreadySaved: true })
    }
  }

  const results = safeJson<ResultSnapshot[]>(draw.results_json, [])
  if (results.length === 0) {
    return fail(res, 400, 'EMPTY_DRAW', '这一轮没有产生结果，不能保存。')
  }

  const pool = getPoolRow(draw.pool_id, userId)
  const poolName = pool ? String(pool.name) : String(draw.pool_name_snapshot || '已删除的选择池')
  const historyId = newId('history')
  const ts = nowISO()

  db.exec('BEGIN')
  try {
    db.prepare(
      `INSERT INTO history (id, user_id, pool_id, pool_name_snapshot, random_mode, result_count, results_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      historyId,
      userId,
      draw.pool_id,
      poolName,
      draw.mode,
      results.length,
      JSON.stringify(results),
      ts,
    )
    db.prepare(
      "UPDATE draws SET status = 'completed', history_id = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(historyId, ts, draw.id, userId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const row = db.prepare('SELECT * FROM history WHERE id = ?').get(historyId) as Record<string, unknown>
  res.status(201).json({ history: mapHistory(row), alreadySaved: false })
})

export default router
