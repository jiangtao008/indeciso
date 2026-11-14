import { Router } from 'express'
import { db, mapHistory } from '../db'
import { currentUserId, requireAuth } from '../auth'
import { clampInt, fail } from '../http'

const router = Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  const userId = currentUserId(res)
  const limit = clampInt(Number(req.query.limit) || 20, 1, 100)
  const offset = clampInt(Number(req.query.offset) || 0, 0, 1_000_000)
  const poolId = typeof req.query.poolId === 'string' && req.query.poolId ? req.query.poolId : null

  const totalRow = (
    poolId
      ? db
          .prepare('SELECT COUNT(*) AS c FROM history WHERE user_id = ? AND pool_id = ?')
          .get(userId, poolId)
      : db.prepare('SELECT COUNT(*) AS c FROM history WHERE user_id = ?').get(userId)
  ) as { c?: number }
  const total = Number(totalRow.c ?? 0)

  const rows = (
    poolId
      ? db
          .prepare(
            `SELECT * FROM history WHERE user_id = ? AND pool_id = ?
             ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
          )
          .all(userId, poolId, limit, offset)
      : db
          .prepare(
            `SELECT * FROM history WHERE user_id = ?
             ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
          )
          .all(userId, limit, offset)
  ) as Record<string, unknown>[]

  res.json({
    records: rows.map(mapHistory),
    total,
    hasMore: offset + rows.length < total,
  })
})

router.get('/:id', (req, res) => {
  const userId = currentUserId(res)
  const row = db
    .prepare('SELECT * FROM history WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as Record<string, unknown> | undefined
  if (!row) return fail(res, 404, 'HISTORY_NOT_FOUND', '找不到这条历史记录。')
  res.json({ record: mapHistory(row) })
})

router.delete('/:id', (req, res) => {
  const userId = currentUserId(res)
  const result = db
    .prepare('DELETE FROM history WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId)
  if (!result.changes) return fail(res, 404, 'HISTORY_NOT_FOUND', '找不到这条历史记录。')
  res.json({ ok: true })
})

// Clear all (optionally scoped to a pool). Registered before /:id deletes above
// would collide, hence the explicit paths — Express only matches DELETE /api/history
// here for the collection.
router.delete('/', (req, res) => {
  const userId = currentUserId(res)
  const poolId = typeof req.query.poolId === 'string' && req.query.poolId ? req.query.poolId : null
  const result = poolId
    ? db
        .prepare('DELETE FROM history WHERE user_id = ? AND pool_id = ?')
        .run(userId, poolId)
    : db.prepare('DELETE FROM history WHERE user_id = ?').run(userId)
  res.json({ ok: true, deleted: Number(result.changes ?? 0) })
})

export default router
