import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { db, nowISO, newId } from './db'

export const SESSION_COOKIE = 'indeciso_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

export function createSession(res: Response, userId: string): void {
  const sessionId = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_TTL_MS)
  const ts = nowISO()
  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(sessionId, userId, expires.toISOString(), ts)

  // Opportunistic cleanup of stale sessions.
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(ts)

  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    expires,
    path: '/',
  })
}

export function destroySession(req: Request, res: Response): void {
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[SESSION_COOKIE]
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

export function getSessionUserId(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[SESSION_COOKIE]
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null
  const row = db
    .prepare(
      `SELECT s.user_id, s.expires_at FROM sessions s
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, nowISO()) as { user_id?: string; expires_at?: string } | undefined
  return row?.user_id ? String(row.user_id) : null
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = getSessionUserId(req)
  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: '先登录，让我知道该帮谁做决定。' },
    })
    return
  }
  res.locals.userId = userId
  next()
}

export function currentUserId(res: Response): string {
  return String(res.locals.userId)
}

// ----- naive but effective in-memory login throttle -----
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 30

export function loginAllowed(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.count += 1
  return entry.count <= MAX_ATTEMPTS
}

export function loginSucceeded(key: string): void {
  attempts.delete(key)
}

export function newSessionId(): string {
  return newId('sess')
}
