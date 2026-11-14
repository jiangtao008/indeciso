import { Router } from 'express'
import { z } from 'zod'
import { db, getPoolRow, insertPool, listItems, listPools, newId, nowISO } from '../db'
import { currentUserId, requireAuth } from '../auth'
import { fail, normalizeTitle, parseWith } from '../http'
import { TEMPLATES, findTemplate } from '../templates'

const router = Router()
router.use(requireAuth)

const importSchema = z.object({
  poolId: z.string().max(64).nullable().optional(),
  name: z.string().trim().max(40).optional(),
  dedupe: z.boolean().optional().default(true),
})

router.get('/', (_req, res) => {
  res.json({ templates: TEMPLATES })
})

router.post('/:id/import', (req, res) => {
  const userId = currentUserId(res)
  const template = findTemplate(req.params.id)
  if (!template) return fail(res, 404, 'TEMPLATE_NOT_FOUND', '找不到这个模板。')
  if (!template.items.length) {
    return fail(res, 400, 'EMPTY_TEMPLATE', '这个模板暂时没有内容，换一个试试吧。')
  }
  const parsed = parseWith(importSchema, req.body ?? {})
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const { poolId, name, dedupe } = parsed.data

  let targetPoolId: string
  let created = false
  if (poolId) {
    const pool = getPoolRow(poolId, userId)
    if (!pool) return fail(res, 404, 'POOL_NOT_FOUND', '找不到目标选择池。')
    targetPoolId = poolId
  } else {
    if (listPools(userId).length >= 50) {
      return fail(res, 400, 'POOL_LIMIT', '选择池最多 50 个，先把不用的整理一下吧。')
    }
    targetPoolId = insertPool(
      userId,
      (name && name.trim()) || template.name,
      template.description,
    )
    created = true
  }

  const existing = listItems(targetPoolId)
  if (existing.length + template.items.length > 500) {
    if (created) {
      db.prepare('DELETE FROM pools WHERE id = ? AND user_id = ?').run(targetPoolId, userId)
    }
    return fail(res, 400, 'ITEM_LIMIT', '选择项会超过 500 个，先清理一下再加吧。')
  }

  const existingTitles = new Set(existing.map((item) => normalizeTitle(item.title)))
  const ts = nowISO()
  const insert = db.prepare(
    `INSERT INTO items (id, pool_id, title, image_url, weight, category, tags_json, is_favorite, extra_data_json, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, ?)`,
  )
  let added = 0
  let skipped = 0
  let sortOrder = existing.length

  db.exec('BEGIN')
  try {
    for (const item of template.items) {
      const key = normalizeTitle(item.title)
      if (dedupe && key && existingTitles.has(key)) {
        skipped += 1
        continue
      }
      insert.run(
        newId('item'),
        targetPoolId,
        item.title,
        item.imageUrl ?? '',
        item.weight ?? 1,
        item.category ?? '',
        JSON.stringify(item.tags ?? []),
        sortOrder,
        ts,
        ts,
      )
      if (key) existingTitles.add(key)
      sortOrder += 1
      added += 1
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const pool = listPools(userId).find((p) => p.id === targetPoolId)
  res.status(created ? 201 : 200).json({ poolId: targetPoolId, pool, created, added, skipped })
})

export default router
