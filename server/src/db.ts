import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import { hashPassword } from './passwords'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_POOL_SETTINGS,
  type BootstrapDTO,
  type HistoryRecordDTO,
  type ItemDTO,
  type PoolSettings,
  type PoolSummary,
  type RandomMode,
  type ResultSnapshot,
  type UserDTO,
  type UserSettingsDTO,
} from '../../shared/types'

export const DATA_DIR = path.resolve(process.cwd(), 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'indeciso.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'dark',
    active_pool_id TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pools (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    settings_json TEXT NOT NULL DEFAULT '{}',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pools_user ON pools(user_id);

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 1,
    category TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    extra_data_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS items_pool ON items(pool_id, sort_order);

  CREATE TABLE IF NOT EXISTS draws (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pool_id TEXT NOT NULL,
    pool_name_snapshot TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL,
    results_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    history_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS draws_user ON draws(user_id, created_at);

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pool_id TEXT NOT NULL,
    pool_name_snapshot TEXT NOT NULL,
    random_mode TEXT NOT NULL,
    result_count INTEGER NOT NULL,
    results_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS history_user ON history(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS history_pool ON history(pool_id, created_at DESC);
`)

export const nowISO = () => new Date().toISOString()

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

export function safeJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function parsePoolSettings(raw: unknown): PoolSettings {
  const parsed = safeJson<Partial<PoolSettings>>(raw, {})
  const merged: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...parsed }
  return {
    resultCount: clampInt(merged.resultCount, 1, 500, 1),
    resultInterval: clampInt(merged.resultInterval, 300, 60000, 2000),
    animationSpeed: ['slow', 'normal', 'fast'].includes(merged.animationSpeed)
      ? merged.animationSpeed
      : 'normal',
    randomMode: ['direct', 'wheel', 'elimination'].includes(merged.randomMode)
      ? merged.randomMode
      : 'direct',
    exclusionEnabled: Boolean(merged.exclusionEnabled),
    exclusionRounds: clampInt(merged.exclusionRounds, 1, 50, 1),
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

interface Row {
  [key: string]: unknown
}

export function mapUser(row: Row): UserDTO {
  return {
    id: String(row.id),
    username: String(row.username),
    createdAt: String(row.created_at),
  }
}

export function mapItem(row: Row): ItemDTO {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    title: String(row.title ?? ''),
    imageUrl: String(row.image_url ?? ''),
    weight: Number(row.weight ?? 1),
    category: String(row.category ?? ''),
    tags: safeJson<string[]>(row.tags_json, []),
    isFavorite: Number(row.is_favorite) === 1,
    extraData: safeJson<Record<string, unknown>>(row.extra_data_json, {}),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapPool(row: Row, itemCount = 0): PoolSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    isDefault: Number(row.is_default) === 1,
    settings: parsePoolSettings(row.settings_json),
    itemCount,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapHistory(row: Row): HistoryRecordDTO {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    poolName: String(row.pool_name_snapshot),
    randomMode: String(row.random_mode) as RandomMode,
    resultCount: Number(row.result_count),
    results: safeJson<ResultSnapshot[]>(row.results_snapshot, []),
    createdAt: String(row.created_at),
  }
}

export function getUserSettings(userId: string): UserSettingsDTO {
  const row = db
    .prepare('SELECT theme, active_pool_id FROM user_settings WHERE user_id = ?')
    .get(userId) as Row | undefined
  return {
    theme: row?.theme === 'light' ? 'light' : 'dark',
    activePoolId: row?.active_pool_id ? String(row.active_pool_id) : null,
  }
}

export function ensureUserSettings(userId: string): void {
  const exists = db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').get(userId)
  if (!exists) {
    db.prepare(
      'INSERT INTO user_settings (user_id, theme, active_pool_id, updated_at) VALUES (?, ?, ?, ?)',
    ).run(userId, 'dark', null, nowISO())
  }
}

export function listPools(userId: string): PoolSummary[] {
  const rows = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM items i WHERE i.pool_id = p.id) AS item_count
       FROM pools p WHERE p.user_id = ?
       ORDER BY p.is_default DESC, p.created_at ASC`,
    )
    .all(userId) as Row[]
  return rows.map((r) => mapPool(r, Number(r.item_count ?? 0)))
}

export function getPoolRow(poolId: string, userId: string): Row | undefined {
  return db
    .prepare('SELECT * FROM pools WHERE id = ? AND user_id = ?')
    .get(poolId, userId) as Row | undefined
}

export function getPoolSummary(poolId: string, userId: string): PoolSummary | null {
  const row = getPoolRow(poolId, userId)
  if (!row) return null
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM items WHERE pool_id = ?')
    .get(poolId) as Row
  return mapPool(row, Number(count.c ?? 0))
}

export function listItems(poolId: string): ItemDTO[] {
  const rows = db
    .prepare('SELECT * FROM items WHERE pool_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(poolId) as Row[]
  return rows.map(mapItem)
}

export function insertPool(
  userId: string,
  name: string,
  description = '',
  settings?: Partial<PoolSettings>,
  makeDefault = false,
): string {
  const id = newId('pool')
  const ts = nowISO()
  const existing = db
    .prepare('SELECT COUNT(*) AS c FROM pools WHERE user_id = ?')
    .get(userId) as Row
  const isDefault = makeDefault || Number(existing.c) === 0
  if (isDefault) {
    db.prepare('UPDATE pools SET is_default = 0 WHERE user_id = ?').run(userId)
  }
  db.prepare(
    `INSERT INTO pools (id, user_id, name, description, settings_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    name,
    description,
    JSON.stringify({ ...DEFAULT_POOL_SETTINGS, ...settings }),
    isDefault ? 1 : 0,
    ts,
    ts,
  )
  return id
}

export function buildBootstrap(userId: string): BootstrapDTO {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Row | undefined
  if (!row) throw new Error('USER_NOT_FOUND')
  const settings = getUserSettings(userId)
  const pools = listPools(userId)
  const activeId =
    settings.activePoolId && pools.some((p) => p.id === settings.activePoolId)
      ? settings.activePoolId
      : (pools.find((p) => p.isDefault)?.id ?? pools[0]?.id ?? null)
  return {
    user: mapUser(row),
    settings: { ...settings, activePoolId: activeId },
    pools,
  }
}

export function seedDemoUser(): void {
  if (process.env.SEED_DEMO === 'false') return
  const existing = db.prepare('SELECT id FROM users WHERE username_lower = ?').get('demo')
  if (existing) return
  const userId = newId('user')
  const ts = nowISO()
  db.prepare(
    'INSERT INTO users (id, username, username_lower, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, 'demo', 'demo', hashPassword('demo1234'), ts, ts)
  ensureUserSettings(userId)
  db.prepare('UPDATE user_settings SET theme = ?, updated_at = ? WHERE user_id = ?').run(
    'dark',
    ts,
    userId,
  )

  const foodPool = insertPool(userId, '今天吃什么', '人生已经够难了，吃什么别再为难自己。', {}, true)
  const foods = [
    '西红柿炒鸡蛋',
    '红烧肉',
    '麻辣香锅',
    '黄焖鸡米饭',
    '兰州牛肉面',
    '麻婆豆腐',
    '宫保鸡丁',
    '麻辣烫',
    '螺蛳粉',
    '寿司',
  ]
  const insertItem = db.prepare(
    `INSERT INTO items (id, pool_id, title, image_url, weight, category, tags_json, is_favorite, extra_data_json, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, '[]', 0, '{}', ?, ?, ?)`,
  )
  foods.forEach((title, index) => {
    insertItem.run(newId('item'), foodPool, title, 1, index < 6 ? '中餐' : '随便', index, ts, ts)
  })

  const tripPool = insertPool(userId, '周末去哪玩', '周末不允许再宅着刷手机了。', {
    randomMode: 'wheel',
    resultCount: 1,
  })
  const trips = ['城市公园野餐', '郊外徒步', '逛美术馆', '看一场电影', '咖啡馆发呆', '短途露营']
  trips.forEach((title, index) => {
    insertItem.run(newId('item'), tripPool, title, 1, '周末', index, ts, ts)
  })

  db.prepare(
    'UPDATE user_settings SET active_pool_id = ?, updated_at = ? WHERE user_id = ?',
  ).run(foodPool, ts, userId)
}

