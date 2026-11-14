import type { Response } from 'express'
import type { ZodType } from 'zod'

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } })
}

export function parseWith<T>(
  schema: ZodType<T>,
  body: unknown,
): { ok: true; data: T } | { ok: false; message: string } {
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }
  const issue = result.error.issues[0]
  const field = issue?.path?.length ? `${issue.path.join('.')}：` : ''
  return { ok: false, message: `${field}${issue?.message ?? '参数不合法'}` }
}

export const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

export function isSafeImagePath(value: string): boolean {
  if (!value) return true
  if (value.length > 800) return false
  return /^(https?:\/\/|\/uploads\/)/i.test(value)
}

export function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}
