import type { EditableItem } from './types'

/**
 * CSV parsing / formatting for the text editor mode of the selection-item list.
 *
 * Format (compatible with RFC 4180 where it matters):
 *   - Each record is one selection item.
 *   - Columns, in order: 名称, 图片路径, 权重, 分类, 标签, 收藏
 *   - A header row is optional. Known header aliases allow re-ordering / a
 *     subset of columns; unknown columns are accepted and ignored for
 *     forward-compatibility (future fields are appended, never reinterpreted).
 *   - Images may be absolute http(s) URLs or site-relative paths (/uploads/...).
 *   - Tags are separated with "|".
 */

export interface CsvRowError {
  line: number
  message: string
}

export interface ParsedItems {
  items: EditableItem[]
  errors: CsvRowError[]
  usedHeader: boolean
}

type ColumnKey = 'title' | 'imageUrl' | 'weight' | 'category' | 'tags' | 'favorite' | 'extra'

const HEADER_ALIASES: Record<string, ColumnKey> = {
  名称: 'title',
  文字: 'title',
  文字内容: 'title',
  标题: 'title',
  title: 'title',
  name: 'title',
  图片: 'imageUrl',
  图片路径: 'imageUrl',
  图片地址: 'imageUrl',
  image: 'imageUrl',
  图像: 'imageUrl',
  image_url: 'imageUrl',
  权重: 'weight',
  weight: 'weight',
  分类: 'category',
  category: 'category',
  标签: 'tags',
  tags: 'tags',
  收藏: 'favorite',
  固定: 'favorite',
  favorite: 'favorite',
  is_favorite: 'favorite',
}

const DEFAULT_COLUMNS: ColumnKey[] = ['title', 'imageUrl', 'weight', 'category', 'tags', 'favorite']

interface RawRecord {
  fields: string[]
  line: number
}

function tokenize(text: string): { records: RawRecord[]; unclosedQuoteLine?: number } {
  const records: RawRecord[] = []
  const normalized = text.replace(/^﻿/, '')
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let recordHasContent = false
  let quoteStartLine = 1

  const endField = () => {
    fields.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    if (recordHasContent || fields.length > 1 || fields[0].trim() !== '') {
      records.push({ fields, line: recordLine })
    }
    fields = []
    recordHasContent = false
  }

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        if (ch === '\n') line++
        field += ch
        recordHasContent = true
      }
      continue
    }

    if (ch === '"' && field.trim() === '') {
      inQuotes = true
      quoteStartLine = line
      recordHasContent = true
      continue
    }
    if (ch === ',') {
      endField()
      recordHasContent = true
      continue
    }
    if (ch === '\r') {
      if (normalized[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
      continue
    }
    if (ch === '\n') {
      endRecord()
      line++
      recordLine = line
      continue
    }
    field += ch
    if (ch.trim() !== '') recordHasContent = true
  }

  if (inQuotes) {
    return { records, unclosedQuoteLine: quoteStartLine }
  }
  if (field !== '' || fields.length > 0) {
    endRecord()
  }
  return { records }
}

function detectHeader(fields: string[]): ColumnKey[] | null {
  const keys = fields.map((f) => HEADER_ALIASES[f.trim().toLowerCase().replace(/\s+/g, '')])
  const known = keys.filter((k): k is ColumnKey => Boolean(k))
  if (known.length < 2) return null
  if (!known.includes('title')) return null
  return keys.map((k) => k ?? 'extra')
}

function normalizeTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[|;；]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12)
}

function parseWeight(raw: string): number | null {
  const text = raw.trim()
  if (!text) return 1
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  if (value <= 0) return null
  if (value > 10000) return null
  return Math.round(value * 100) / 100
}

function parseFavorite(raw: string): boolean {
  const value = raw.trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', '是', '收藏', '固定'].includes(value)
}

export function parseItemsText(text: string): ParsedItems {
  const { records, unclosedQuoteLine } = tokenize(text)
  const errors: CsvRowError[] = []
  const items: EditableItem[] = []

  if (unclosedQuoteLine !== undefined) {
    errors.push({ line: unclosedQuoteLine, message: '引号没有闭合，请检查这一行的双引号是否成对。' })
    return { items, errors, usedHeader: false }
  }

  if (records.length === 0) {
    return { items, errors, usedHeader: false }
  }

  let columns = DEFAULT_COLUMNS
  let startIndex = 0
  const header = detectHeader(records[0].fields)
  if (header) {
    columns = header
    startIndex = 1
  }

  for (let r = startIndex; r < records.length; r++) {
    const record = records[r]
    if (record.fields.length === 1 && record.fields[0].trim() === '') continue

    const raw: Partial<Record<ColumnKey, string>> = {}
    record.fields.forEach((value, idx) => {
      const key = columns[idx]
      if (key && key !== 'extra' && raw[key] === undefined) raw[key] = value
    })

    const title = (raw.title ?? '').trim()
    const imageUrl = (raw.imageUrl ?? '').trim()
    const weight = parseWeight(raw.weight ?? '')
    const category = (raw.category ?? '').trim().slice(0, 40)
    const tags = normalizeTags(raw.tags ?? '')
    const isFavorite = parseFavorite(raw.favorite ?? '')

    if (!title && !imageUrl) {
      errors.push({ line: record.line, message: '名称和图片至少需要填写一个。' })
      continue
    }
    if (title.length > 120) {
      errors.push({ line: record.line, message: '名称不能超过 120 个字符。' })
      continue
    }
    if (imageUrl && !/^(https?:\/\/|\/)/i.test(imageUrl)) {
      errors.push({ line: record.line, message: '图片路径需要以 / 或 http(s):// 开头。' })
      continue
    }
    if (imageUrl.length > 800) {
      errors.push({ line: record.line, message: '图片路径过长。' })
      continue
    }
    if (weight === null) {
      errors.push({ line: record.line, message: '权重必须是大于 0 且不超过 10000 的数字。' })
      continue
    }

    items.push({ title, imageUrl, weight, category, tags, isFavorite })
  }

  return { items, errors, usedHeader: Boolean(header) }
}

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatWeight(weight: number): string {
  if (!Number.isFinite(weight) || weight <= 0) return '1'
  return String(Math.round(weight * 100) / 100)
}

export function formatItemsText(items: Pick<EditableItem, 'title' | 'imageUrl' | 'weight' | 'category' | 'tags' | 'isFavorite'>[]): string {
  const extended = items.some(
    (i) => i.weight !== 1 || i.category || i.tags.length > 0 || i.isFavorite,
  )
  const lines: string[] = []
  if (extended) lines.push('名称,图片路径,权重,分类,标签,收藏')
  for (const item of items) {
    const base = [escapeField(item.title), escapeField(item.imageUrl)]
    if (extended) {
      base.push(
        formatWeight(item.weight),
        escapeField(item.category),
        escapeField(item.tags.join('|')),
        item.isFavorite ? '是' : '否',
      )
    }
    lines.push(base.join(','))
  }
  return lines.join('\n')
}
