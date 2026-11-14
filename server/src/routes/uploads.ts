import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { currentUserId, requireAuth } from '../auth'
import { fail } from '../http'
import { UPLOAD_DIR } from '../db'

const router = Router()
router.use(requireAuth)

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('UNSUPPORTED_IMAGE_TYPE'))
      return
    }
    cb(null, true)
  },
})

function sniffImage(buffer: Buffer): { ext: string } | null {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png' }
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg' }
  }
  if (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp' }
  }
  return null
}

router.post('/', upload.single('image'), (req, res) => {
  const userId = currentUserId(res)
  const file = req.file
  if (!file) {
    return fail(res, 400, 'NO_FILE', '没有收到图片，再选一次吧。')
  }
  const sniffed = sniffImage(file.buffer)
  if (!sniffed) {
    return fail(res, 400, 'UPLOAD_INVALID_TYPE', '这张图片暂时进不来，请上传 PNG、JPG 或 WebP 格式。')
  }

  const dir = path.join(UPLOAD_DIR, userId)
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${crypto.randomUUID().replace(/-/g, '')}.${sniffed.ext}`
  fs.writeFileSync(path.join(dir, filename), file.buffer)

  res.status(201).json({ url: `/uploads/${userId}/${filename}` })
})

export default router
