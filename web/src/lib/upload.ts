import { api } from './api'

const MAX_DIMENSION = 1600
const QUALITY = 0.86
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return '只支持 PNG、JPG 或 WebP 图片。'
  if (file.size > 20 * 1024 * 1024) return '图片太大了（最大 20MB），压缩一下再传吧。'
  return null
}

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  )
  if (!blob || blob.size === 0) return file
  // Keep the original if compression somehow makes it bigger.
  return blob.size < file.size || scale < 1 ? blob : file
}

/** Compress client-side (smaller uploads, faster loading) then upload. */
export async function uploadImage(file: File): Promise<string> {
  const invalid = validateImageFile(file)
  if (invalid) throw new Error(invalid)
  const blob = await compress(file)
  const { url } = await api.uploads.upload(blob)
  return url
}
