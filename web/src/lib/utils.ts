import type { AnimationSpeed, RandomMode } from '@shared/types'

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今天 ${hm}`
  if (isYesterday) return `昨天 ${hm}`
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} 周${WEEKDAYS[date.getDay()]} ${hm}`
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

export const MODE_LABEL: Record<RandomMode, string> = {
  direct: '直接揭晓',
  wheel: '命运转盘',
  elimination: '淘汰模式',
}

export const MODE_DESC: Record<RandomMode, string> = {
  direct: '节奏明确，干净利落地揭晓结果。',
  wheel: '转盘旋转后停在早已算好的结果上。',
  elimination: '候选项逐轮退场，悬念拉满。',
}

export const SPEED_LABEL: Record<AnimationSpeed, string> = {
  slow: '慢速',
  normal: '标准',
  fast: '快速',
}

export const SPEED_DESC: Record<AnimationSpeed, string> = {
  slow: '强调沉浸感，让命运多想一会儿。',
  normal: '默认节奏，张弛有度。',
  fast: '缩短动画时间，快点给我答案。',
}

export function animationDuration(mode: RandomMode, speed: AnimationSpeed, extraRounds = 0): number {
  const base = speed === 'fast' ? 1200 : speed === 'slow' ? 3000 : 2100
  if (mode === 'wheel') return speed === 'fast' ? 1700 : speed === 'slow' ? 3800 : 2800
  if (mode === 'elimination') return base + 500 + extraRounds * 300
  return base
}

export function eliminationRoundMs(speed: AnimationSpeed): number {
  return speed === 'fast' ? 480 : speed === 'slow' ? 900 : 680
}

export function firstChar(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return '?'
  return Array.from(trimmed)[0] ?? '?'
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function isProbablyMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 640px)').matches
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
      resolve()
    } catch {
      reject(new Error('copy failed'))
    } finally {
      area.remove()
    }
  })
}
