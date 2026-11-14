import type { ResultSnapshot } from '@shared/types'
import { firstChar } from './utils'

export const SHARE_WIDTH = 1080
export const SHARE_HEIGHT = 1920

export interface ShareCardData {
  poolName: string
  results: ResultSnapshot[]
  headline?: string
  line?: string
  date?: Date
}

const FONT_CN = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif'
const FONT_EN = '"Outfit", "Helvetica Neue", Arial, sans-serif'
const FONT_SERIF = '"Instrument Serif", "Songti SC", Georgia, serif'

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function fillRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
) {
  roundedRect(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lineWidth = 2,
) {
  roundedRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 600, family = FONT_CN) {
  ctx.font = `${weight} ${size}px ${family}`
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let clipped = text
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = Array.from(text)
  const lines: string[] = []
  let line = ''
  for (const char of chars) {
    if (char === '\n') {
      lines.push(line)
      line = ''
      continue
    }
    const candidate = line + char
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = char
      if (lines.length === maxLines) break
    } else {
      line = candidate
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines) {
    const lastIndex = maxLines - 1
    if (lines[lastIndex] && ctx.measureText(lines[lastIndex]).width > maxWidth) {
      lines[lastIndex] = ellipsize(ctx, lines[lastIndex], maxWidth)
    }
    const consumed = lines.join('').length
    if (consumed < chars.length && !lines[lastIndex].endsWith('…')) {
      lines[lastIndex] = ellipsize(ctx, `${lines[lastIndex]}…`, maxWidth)
    }
  }
  return lines
}

function letterSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cursor = x
  for (const char of text) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + spacing
  }
}

function letterSpacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  let width = 0
  for (const char of text) width += ctx.measureText(char).width + spacing
  return Math.max(0, width - spacing)
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }
    // Only same-origin images, so the canvas never becomes tainted.
    if (!src.startsWith('/') || src.startsWith('//')) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.save()
  roundedRect(ctx, x, y, w, h, radius)
  ctx.clip()
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  title: string,
) {
  ctx.save()
  roundedRect(ctx, x, y, w, h, radius)
  ctx.clip()
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h)
  gradient.addColorStop(0, '#7c3aed')
  gradient.addColorStop(0.55, '#a855f7')
  gradient.addColorStop(1, '#ff79bd')
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, w, h)
  const glow = ctx.createRadialGradient(x + w * 0.25, y + h * 0.2, 0, x + w * 0.25, y + h * 0.2, w * 0.8)
  glow.addColorStop(0, 'rgba(255,255,255,0.28)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  setFont(ctx, Math.min(w, h) * 0.42, 600, FONT_SERIF)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `italic 600 ${Math.min(w, h) * 0.4}px ${FONT_SERIF}`
  ctx.fillText(firstChar(title), x + w / 2, y + h / 2 + Math.min(w, h) * 0.02)
  ctx.restore()
}

interface CardRect {
  x: number
  y: number
  w: number
  h: number
  image: { x: number; y: number; w: number; h: number; radius: number } | null
  layout: 'hero' | 'row' | 'grid'
  titleSize: number
}

function buildCardRects(count: number, top: number, bottom: number): CardRect[] {
  const left = 80
  const width = 920
  const gap = 24
  const available = Math.max(200, bottom - top)

  if (count === 1) {
    const h = Math.min(620, available)
    const y = top + (available - h) / 2
    return [
      {
        x: left,
        y,
        w: width,
        h,
        image: { x: left + 26, y: y + 26, w: width - 52, h: Math.max(100, h - 200), radius: 26 },
        layout: 'hero',
        titleSize: 52,
      },
    ]
  }

  if (count <= 3) {
    const per = count === 2 ? 350 : 280
    const h = Math.min(per, (available - gap * (count - 1)) / count)
    const total = h * count + gap * (count - 1)
    const startY = top + (available - total) / 2
    return Array.from({ length: count }, (_, index) => ({
      x: left,
      y: startY + index * (h + gap),
      w: width,
      h,
      image: {
        x: left + 24,
        y: startY + index * (h + gap) + 24,
        w: h - 48,
        h: h - 48,
        radius: 22,
      },
      layout: 'row' as const,
      titleSize: count === 2 ? 42 : 36,
    }))
  }

  const cols = 2
  const cardW = (width - gap) / cols
  const rows = Math.ceil(count / cols)
  const h = Math.min(300, (available - gap * (rows - 1)) / rows)
  const total = h * rows + gap * (rows - 1)
  const startY = top + (available - total) / 2
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = left + col * (cardW + gap)
    const y = startY + row * (h + gap)
    return {
      x,
      y,
      w: cardW,
      h,
      image: { x: x + 18, y: y + 18, w: cardW - 36, h: Math.max(70, h * 0.56), radius: 20 },
      layout: 'grid' as const,
      titleSize: 30,
    }
  })
}

export async function renderShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_WIDTH
  canvas.height = SHARE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  const W = SHARE_WIDTH
  const H = SHARE_HEIGHT
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  // Background
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, '#140b26')
  bg.addColorStop(0.45, '#1b0f31')
  bg.addColorStop(1, '#2b1038')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(180, 260, 620, 'rgba(168,85,247,0.28)')
  glow(980, 1500, 720, 'rgba(255,121,189,0.16)')
  glow(820, 380, 480, 'rgba(126,232,250,0.1)')

  // Decorative rings
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 2
  for (const r of [230, 320, 410]) {
    ctx.beginPath()
    ctx.arc(960, 120, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // Star specks
  let seed = 20261113
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  for (let i = 0; i < 70; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = rand() * 1.9 + 0.5
    ctx.globalAlpha = 0.12 + rand() * 0.24
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Frame
  strokeRounded(ctx, 40, 40, W - 80, H - 80, 52, 'rgba(255,255,255,0.12)', 2)

  // Brand row
  const mascot = await loadImage('/mascot.jpeg')
  fillRounded(ctx, 80, 92, 104, 104, 28, '#ffffff')
  if (mascot) {
    drawCover(ctx, mascot, 80, 92, 104, 104, 28)
  } else {
    fillRounded(ctx, 80, 92, 104, 104, 28, 'rgba(199,123,255,0.6)')
  }
  strokeRounded(ctx, 80, 92, 104, 104, 28, 'rgba(255,255,255,0.24)', 2)
  ctx.fillStyle = '#fff'
  setFont(ctx, 44, 600, FONT_CN)
  ctx.fillText('别纠结', 212, 104)
  ctx.fillStyle = 'rgba(230,220,255,0.6)'
  setFont(ctx, 18, 500, FONT_EN)
  letterSpaced(ctx, 'INDECISO', 214, 158, 6.5)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(240,233,255,0.4)'
  setFont(ctx, 15, 500, FONT_EN)
  ctx.fillText('STOP OVERTHINKING', W - 84, 122)
  ctx.fillText('START CHOOSING', W - 84, 148)
  ctx.textAlign = 'left'

  // Pool chip
  setFont(ctx, 26, 500, FONT_CN)
  const poolLabel = `选择池 · ${data.poolName || '未命名选择池'}`
  const chipWidth = Math.min(920, ctx.measureText(poolLabel).width + 52)
  fillRounded(ctx, 80, 246, chipWidth, 54, 27, 'rgba(255,255,255,0.07)')
  strokeRounded(ctx, 80, 246, chipWidth, 54, 27, 'rgba(255,255,255,0.16)', 1.5)
  ctx.fillStyle = 'rgba(240,235,255,0.82)'
  ctx.fillText(ellipsize(ctx, poolLabel, chipWidth - 44), 104, 259)

  // Headline
  const headline = data.headline ?? '命运已经安排好了'
  setFont(ctx, 72, 700, FONT_CN)
  const headlineLines = wrapText(ctx, headline, 920, 2)
  ctx.fillStyle = '#ffffff'
  let cursorY = 356
  for (const line of headlineLines) {
    ctx.fillText(line, 80, cursorY)
    cursorY += 92
  }
  cursorY += 10

  const subline = data.line ?? '好了，别反悔。'
  setFont(ctx, 30, 400, FONT_CN)
  ctx.fillStyle = 'rgba(226,216,246,0.72)'
  const subLines = wrapText(ctx, subline, 900, 2)
  for (const line of subLines) {
    ctx.fillText(line, 80, cursorY)
    cursorY += 44
  }

  // Results
  const results = data.results.slice(0, 6)
  const rects = buildCardRects(results.length, Math.max(660, cursorY + 56), 1540)
  const images = await Promise.all(results.map((result) => loadImage(result.imageUrl)))

  results.forEach((result, index) => {
    const rect = rects[index]
    if (!rect) return
    fillRounded(ctx, rect.x, rect.y, rect.w, rect.h, 30, 'rgba(255,255,255,0.055)')
    strokeRounded(ctx, rect.x, rect.y, rect.w, rect.h, 30, 'rgba(255,255,255,0.14)', 2)

    if (rect.image) {
      const img = images[index]
      if (img) {
        drawCover(ctx, img, rect.image.x, rect.image.y, rect.image.w, rect.image.h, rect.image.radius)
      } else {
        drawPlaceholder(
          ctx,
          rect.image.x,
          rect.image.y,
          rect.image.w,
          rect.image.h,
          rect.image.radius,
          result.title,
        )
      }
    }

    setFont(ctx, rect.titleSize, 600, FONT_CN)
    ctx.fillStyle = '#ffffff'
    if (rect.layout === 'row' && rect.image) {
      const textX = rect.image.x + rect.image.w + 34
      const textWidth = rect.x + rect.w - textX - 40
      const titleY = rect.y + rect.h / 2 - rect.titleSize * 0.6
      const lines = wrapText(ctx, result.title || '（只有图片）', textWidth, 2)
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, textX, titleY + lineIndex * (rect.titleSize + 8))
      })
    } else if (rect.layout === 'hero' && rect.image) {
      const textY = rect.image.y + rect.image.h + 26
      ctx.textAlign = 'center'
      ctx.fillText(
        ellipsize(ctx, result.title || '（只有图片）', rect.w - 80),
        rect.x + rect.w / 2,
        textY,
      )
      ctx.textAlign = 'left'
    } else if (rect.image) {
      const textY = rect.image.y + rect.image.h + 22
      ctx.fillText(
        ellipsize(ctx, result.title || '（只有图片）', rect.w - 48),
        rect.x + 24,
        textY,
      )
    }
  })

  if (data.results.length > results.length) {
    setFont(ctx, 24, 400, FONT_CN)
    ctx.fillStyle = 'rgba(226,216,246,0.55)'
    ctx.textAlign = 'center'
    ctx.fillText(`还有 ${data.results.length - results.length} 个结果`, W / 2, 1568)
    ctx.textAlign = 'left'
  }

  // Footer
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(80, 1640)
  ctx.lineTo(W - 80, 1640)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  setFont(ctx, 36, 600, FONT_CN)
  ctx.fillText('别纠结，让选择变简单。', 80, 1690)

  ctx.fillStyle = 'rgba(226,216,246,0.45)'
  setFont(ctx, 15, 500, FONT_EN)
  letterSpaced(ctx, 'STOP OVERTHINKING. START CHOOSING.', 82, 1752, 3.2)

  const date = data.date ?? new Date()
  const dateText = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')}`
  ctx.textAlign = 'right'
  setFont(ctx, 20, 400, FONT_EN)
  ctx.fillStyle = 'rgba(226,216,246,0.55)'
  ctx.fillText(dateText, W - 80, 1700)
  ctx.textAlign = 'left'

  // Bottom brand accent
  fillRounded(ctx, 80, 1800, 64, 6, 3, 'rgba(199,123,255,0.9)')
  fillRounded(ctx, 152, 1800, 24, 6, 3, 'rgba(255,134,200,0.7)')
  ctx.textAlign = 'right'
  setFont(ctx, 18, 500, FONT_CN)
  ctx.fillStyle = 'rgba(226,216,246,0.5)'
  ctx.fillText('别纠结 · Indeciso', W - 80, 1788)
  ctx.textAlign = 'left'

  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片生成失败'))),
      'image/png',
      1,
    )
  })
}

export function shareCardText(poolName: string, results: ResultSnapshot[]): string {
  const titles = results.map((result) => result.title || '一张图片').join('、')
  return `${poolName || '这次选择'}？命运已经安排好了：${titles}。—— 别纠结 Indeciso`
}

export function shareCardFilename(poolName: string): string {
  const safe = (poolName || 'indeciso').replace(/[\\/:*?"<>|]/g, '').slice(0, 24)
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`
  return `indeciso-${safe}-${stamp}.png`
}
