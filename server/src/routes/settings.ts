import { Router } from 'express'
import { z } from 'zod'
import { db, getPoolRow, getUserSettings, nowISO } from '../db'
import { currentUserId, requireAuth } from '../auth'
import { fail, parseWith } from '../http'

const router = Router()
router.use(requireAuth)

const schema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  activePoolId: z.string().max(64).nullable().optional(),
})

router.get('/', (_req, res) => {
  res.json({ settings: getUserSettings(currentUserId(res)) })
})

router.patch('/', (req, res) => {
  const userId = currentUserId(res)
  const parsed = parseWith(schema, req.body ?? {})
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const current = getUserSettings(userId)

  let activePoolId = parsed.data.activePoolId
  if (activePoolId && !getPoolRow(activePoolId, userId)) {
    return fail(res, 404, 'POOL_NOT_FOUND', '找不到这个选择池。')
  }
  if (activePoolId === undefined) activePoolId = current.activePoolId ?? null

  db.prepare(
    'UPDATE user_settings SET theme = ?, active_pool_id = ?, updated_at = ? WHERE user_id = ?',
  ).run(parsed.data.theme ?? current.theme, activePoolId, nowISO(), userId)

  res.json({ settings: getUserSettings(userId) })
})

export default router
