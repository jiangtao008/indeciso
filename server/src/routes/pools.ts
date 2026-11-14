import { Router } from 'express'
import { z } from 'zod'
import {
  buildBootstrap,
  db,
  ensureUserSettings,
  getPoolRow,
  getUserSettings,
  insertPool,
  listItems,
  listPools,
  mapItem,
  mapPool,
  newId,
  nowISO,
  parsePoolSettings,
  safeJson,
} from '../db'
import { currentUserId, requireAuth } from '../auth'
import { clampInt, fail, isSafeImagePath, parseWith } from '../http'
import { DEFAULT_POOL_SETTINGS, type ItemDTO } from '../../../shared/types'

const router = Router()
router.use(requireAuth)

const POOL_LIMIT = 50
const ITEM_LIMIT = 500

const poolSchema = z.object({
  name: z.string().trim().min(1, '选择池名称不能为空').max(40, '名称最多 40 个字符'),
  description: z.string().trim().max(200, '描述最多 200 个字符').optional().default(''),
})

const patchPoolSchema = z.object({
  name: z.string().trim().min(1, '选择池名称不能为空').max(40, '名称最多 40 个字符').optional(),
  description: z.string().trim().max(200, '描述最多 200 个字符').optional(),
})

const itemSchema = z.object({
  id: z.string().max(64).optional().nullable(),
  title: z.string().max(120, '名称最多 120 个字符').optional().default(''),
  imageUrl: z.string().max(800, '图片路径过长').optional().default(''),
  weight: z.number().finite().positive('权重必须大于 0').max(10000, '权重不能超过 10000').optional().default(1),
  category: z.string().max(40, '分类最多 40 个字符').optional().default(''),
  tags: z.array(z.string().trim().min(1).max(24)).max(12, '每个选择项最多 12 个标签').optional().default([]),
  isFavorite: z.boolean().optional().default(false),
})

const itemsSchema = z.object({
  items: z.array(itemSchema).max(ITEM_LIMIT, `选择项最多 ${ITEM_LIMIT} 个`),
})

const settingsSchema = z.object({
  resultCount: z.number().int().min(1).max(500).optional(),
  resultInterval: z.number().int().min(300).max(60000).optional(),
  animationSpeed: z.enum(['slow', 'normal', 'fast']).optional(),
  randomMode: z.enum(['direct', 'wheel', 'elimination']).optional(),
  exclusionEnabled: z.boolean().optional(),
  exclusionRounds: z.number().int().min(1).max(50).optional(),
})

type ItemInput = z.infer<typeof itemSchema>

function poolOr404(res: Parameters<typeof fail>[0], userId: string, poolId: string) {
  const row = getPoolRow(poolId, userId)
  if (!row) {
    fail(res, 404, 'POOL_NOT_FOUND', '找不到这个选择池，它可能已经被删除了。')
    return null
  }
  return row
}

function sanitizeItem(input: ItemInput) {
  const title = input.title.trim()
  const imageUrl = input.imageUrl.trim()
  const tags = Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean))).slice(0, 12)
  return {
    title,
    imageUrl,
    weight: Math.round(input.weight * 100) / 100,
    category: input.category.trim(),
    tags,
    isFavorite: input.isFavorite,
  }
}

router.get('/', (_req, res) => {
  res.json({ pools: listPools(currentUserId(res)) })
})

router.post('/', (req, res) => {
  const userId = currentUserId(res)
  if (listPools(userId).length >= POOL_LIMIT) {
    return fail(res, 400, 'POOL_LIMIT', `选择池最多 ${POOL_LIMIT} 个，先把不用的整理一下吧。`)
  }
  const parsed = parseWith(poolSchema, req.body)
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const poolId = insertPool(userId, parsed.data.name, parsed.data.description)
  ensureUserSettings(userId)
  const settings = getUserSettings(userId)
  if (!settings.activePoolId) {
    db.prepare('UPDATE user_settings SET active_pool_id = ?, updated_at = ? WHERE user_id = ?').run(
      poolId,
      nowISO(),
      userId,
    )
  }
  res.status(201).json({ pool: listPools(userId).find((p) => p.id === poolId) })
})

router.patch('/:id', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return
  const parsed = parseWith(patchPoolSchema, req.body)
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const name = parsed.data.name ?? String(row.name)
  const description = parsed.data.description ?? String(row.description ?? '')
  db.prepare('UPDATE pools SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    name,
    description,
    nowISO(),
    req.params.id,
    userId,
  )
  res.json({ pool: listPools(userId).find((p) => p.id === req.params.id) })
})

router.delete('/:id', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM draws WHERE pool_id = ? AND user_id = ?').run(req.params.id, userId)
    db.prepare('DELETE FROM pools WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const remaining = listPools(userId)
  if (remaining.length === 0) {
    const newPool = insertPool(userId, '我的选择池', '新的开始，先从几个候选项开始吧。', {}, true)
    db.prepare('UPDATE user_settings SET active_pool_id = ?, updated_at = ? WHERE user_id = ?').run(
      newPool,
      nowISO(),
      userId,
    )
  } else {
    const stillDefault = remaining.some((p) => p.isDefault)
    if (!stillDefault) {
      db.prepare('UPDATE pools SET is_default = 1 WHERE id = ? AND user_id = ?').run(
        remaining[0].id,
        userId,
      )
    }
    const settings = getUserSettings(userId)
    if (settings.activePoolId === req.params.id) {
      const fallback = remaining.find((p) => p.id !== req.params.id)
      db.prepare(
        'UPDATE user_settings SET active_pool_id = ?, updated_at = ? WHERE user_id = ?',
      ).run(fallback?.id ?? null, nowISO(), userId)
    }
  }
  res.json(buildBootstrap(userId))
})

router.post('/:id/default', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE pools SET is_default = 0 WHERE user_id = ?').run(userId)
    db.prepare('UPDATE pools SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ?').run(
      nowISO(),
      req.params.id,
      userId,
    )
    db.prepare('UPDATE user_settings SET active_pool_id = ?, updated_at = ? WHERE user_id = ?').run(
      req.params.id,
      nowISO(),
      userId,
    )
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  res.json(buildBootstrap(userId))
})

router.post('/:id/copy', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return
  if (listPools(userId).length >= POOL_LIMIT) {
    return fail(res, 400, 'POOL_LIMIT', `选择池最多 ${POOL_LIMIT} 个，先把不用的整理一下吧。`)
  }
  const sourceSettings = parsePoolSettings(row.settings_json)
  const originalName = String(row.name)
  const copyName = `${originalName.slice(0, 36)} 副本`
  const newPoolId = insertPool(
    userId,
    copyName,
    String(row.description ?? ''),
    sourceSettings,
  )
  const items = listItems(req.params.id)
  const ts = nowISO()
  const insert = db.prepare(
    `INSERT INTO items (id, pool_id, title, image_url, weight, category, tags_json, is_favorite, extra_data_json, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  db.exec('BEGIN')
  try {
    items.forEach((item, index) => {
      insert.run(
        newId('item'),
        newPoolId,
        item.title,
        item.imageUrl,
        item.weight,
        item.category,
        JSON.stringify(item.tags),
        item.isFavorite ? 1 : 0,
        JSON.stringify(item.extraData ?? {}),
        index,
        ts,
        ts,
      )
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  res.status(201).json({ pool: listPools(userId).find((p) => p.id === newPoolId) })
})

router.get('/:id', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return
  const items = listItems(req.params.id)
  res.json({ pool: mapPool(row, items.length), items })
})

router.put('/:id/items', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return
  const parsed = parseWith(itemsSchema, req.body)
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const poolId = req.params.id

  const prepared = parsed.data.items.map(sanitizeItem)
  for (const [index, item] of prepared.entries()) {
    if (!item.title && !item.imageUrl) {
      return fail(
        res,
        400,
        'INVALID_ITEM',
        `第 ${index + 1} 个选择项：名称和图片至少需要填写一个。`,
        { index },
      )
    }
    if (item.imageUrl && !isSafeImagePath(item.imageUrl)) {
      return fail(res, 400, 'INVALID_IMAGE_PATH', `第 ${index + 1} 个选择项：图片路径不合法。`, {
        index,
      })
    }
  }

  const existing = db
    .prepare('SELECT id FROM items WHERE pool_id = ?')
    .all(poolId) as Array<{ id: string }>
  const existingIds = new Set(existing.map((e) => String(e.id)))
  const kept = new Set<string>()
  const ts = nowISO()

  const insertStmt = db.prepare(
    `INSERT INTO items (id, pool_id, title, image_url, weight, category, tags_json, is_favorite, extra_data_json, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
  )
  const updateStmt = db.prepare(
    `UPDATE items SET title = ?, image_url = ?, weight = ?, category = ?, tags_json = ?, is_favorite = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND pool_id = ?`,
  )
  const deleteStmt = db.prepare('DELETE FROM items WHERE id = ? AND pool_id = ?')

  db.exec('BEGIN')
  try {
    prepared.forEach((item, index) => {
      const inputId = parsed.data.items[index]?.id
      const reuse = Boolean(inputId && existingIds.has(inputId) && !kept.has(inputId))
      const id = reuse ? inputId! : newId('item')
      if (reuse) {
        updateStmt.run(
          item.title,
          item.imageUrl,
          item.weight,
          item.category,
          JSON.stringify(item.tags),
          item.isFavorite ? 1 : 0,
          index,
          ts,
          id,
          poolId,
        )
      } else {
        insertStmt.run(
          id,
          poolId,
          item.title,
          item.imageUrl,
          item.weight,
          item.category,
          JSON.stringify(item.tags),
          item.isFavorite ? 1 : 0,
          index,
          ts,
          ts,
        )
      }
      kept.add(id)
    })
    for (const { id } of existing) {
      if (!kept.has(String(id))) deleteStmt.run(String(id), poolId)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  // Keep the configured result count inside the new bounds.
  const items = listItems(poolId)
  const settings = parsePoolSettings(row.settings_json)
  const clamped = clampInt(settings.resultCount, 1, Math.max(1, items.length))
  if (clamped !== settings.resultCount) {
    settings.resultCount = clamped
    db.prepare('UPDATE pools SET settings_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(settings),
      nowISO(),
      poolId,
    )
  }

  const fresh = getPoolRow(poolId, userId)!
  res.json({ pool: mapPool(fresh, items.length), items })
})

router.put('/:id/settings', (req, res) => {
  const userId = currentUserId(res)
  const row = poolOr404(res, userId, req.params.id)
  if (!row) return
  const parsed = parseWith(settingsSchema, req.body)
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const items = listItems(req.params.id)
  const current = parsePoolSettings(row.settings_json)
  const next = { ...current, ...parsed.data }
  if (next.resultCount > Math.max(1, items.length) && items.length > 0) {
    return fail(
      res,
      400,
      'INVALID_RESULT_COUNT',
      `结果数量不能超过候选项数量（当前 ${items.length} 个）。`,
    )
  }
  db.prepare('UPDATE pools SET settings_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(next),
    nowISO(),
    req.params.id,
  )
  const fresh = getPoolRow(req.params.id, userId)!
  res.json({ pool: mapPool(fresh, items.length) })
})

export default router
