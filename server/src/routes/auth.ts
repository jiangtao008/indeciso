import { Router } from 'express'
import { z } from 'zod'
import {
  buildBootstrap,
  db,
  ensureUserSettings,
  insertPool,
  nowISO,
  newId,
} from '../db'
import {
  createSession,
  destroySession,
  loginAllowed,
  loginSucceeded,
  requireAuth,
} from '../auth'
import { hashPassword, verifyPassword } from '../passwords'
import { fail, parseWith } from '../http'

const router = Router()

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, '用户名至少 3 个字符')
    .max(32, '用户名最多 32 个字符')
    .regex(/^[\p{L}\p{N}_-]+$/u, '用户名只能包含文字、数字、下划线或连字符'),
  password: z.string().min(6, '密码至少 6 位').max(128, '密码最多 128 位'),
})

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(64),
  password: z.string().min(1, '请输入密码').max(128),
})

router.post('/register', (req, res) => {
  const parsed = parseWith(registerSchema, req.body)
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const { username, password } = parsed.data
  const lower = username.toLowerCase()

  const existing = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(lower)
  if (existing) {
    return fail(res, 409, 'USERNAME_TAKEN', '这个名字已经被人先纠结走了，换一个吧。')
  }

  const userId = newId('user')
  const ts = nowISO()
  try {
    db.prepare(
      'INSERT INTO users (id, username, username_lower, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, username, lower, hashPassword(password), ts, ts)
  } catch {
    return fail(res, 409, 'USERNAME_TAKEN', '这个名字已经被人先纠结走了，换一个吧。')
  }

  ensureUserSettings(userId)
  const poolId = insertPool(
    userId,
    '今天吃什么',
    '你的第一个选择池。先去添加几个候选项吧。',
    {},
    true,
  )
  db.prepare('UPDATE user_settings SET active_pool_id = ?, updated_at = ? WHERE user_id = ?').run(
    poolId,
    ts,
    userId,
  )
  createSession(res, userId)
  res.status(201).json(buildBootstrap(userId))
})

router.post('/login', (req, res) => {
  const parsed = parseWith(loginSchema, req.body)
  if (!parsed.ok) return fail(res, 400, 'INVALID_INPUT', parsed.message)
  const { username, password } = parsed.data
  const key = `${req.ip}:${username.toLowerCase()}`
  if (!loginAllowed(key)) {
    return fail(res, 429, 'TOO_MANY_ATTEMPTS', '试太多次了，命运也需要休息一会儿，请稍后再试。')
  }

  const row = db
    .prepare('SELECT id, password_hash FROM users WHERE username_lower = ?')
    .get(username.toLowerCase()) as { id?: string; password_hash?: string } | undefined
  if (!row?.id || !row.password_hash || !verifyPassword(password, String(row.password_hash))) {
    return fail(res, 401, 'INVALID_CREDENTIALS', '用户名或密码不对。别纠结，再想想？')
  }

  loginSucceeded(key)
  createSession(res, String(row.id))
  res.json(buildBootstrap(String(row.id)))
})

router.post('/logout', (req, res) => {
  destroySession(req, res)
  res.status(204).end()
})

router.get('/me', requireAuth, (_req, res) => {
  res.json(buildBootstrap(String(res.locals.userId)))
})

export default router
