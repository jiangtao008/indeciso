import express from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { UPLOAD_DIR, seedDemoUser } from './db'
import { getSessionUserId } from './auth'
import authRoutes from './routes/auth'
import poolRoutes from './routes/pools'
import drawRoutes from './routes/draws'
import historyRoutes from './routes/history'
import templateRoutes from './routes/templates'
import uploadRoutes from './routes/uploads'
import settingsRoutes from './routes/settings'

const PORT = Number(process.env.PORT || 8787)
const WEB_DIST = path.resolve(process.cwd(), 'web/dist')

seedDemoUser()

const app = express()
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'indeciso', time: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/pools', poolRoutes)
app.use('/api', drawRoutes)
app.use('/api/history', historyRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/settings', settingsRoutes)

// Authenticated, per-user image serving. History snapshots rely on these files
// staying available even after an item is edited or deleted.
app.get('/uploads/:userId/:filename', (req, res) => {
  const sessionUserId = getSessionUserId(req)
  if (!sessionUserId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '先登录，才能查看图片。' } })
    return
  }
  if (sessionUserId !== req.params.userId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: '这不是你的图片。' } })
    return
  }
  const filename = req.params.filename
  if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(filename)) {
    res.status(404).end()
    return
  }
  const filePath = path.join(UPLOAD_DIR, sessionUserId, filename)
  if (!filePath.startsWith(path.join(UPLOAD_DIR, sessionUserId) + path.sep) || !fs.existsSync(filePath)) {
    res.status(404).end()
    return
  }
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.sendFile(filePath)
})

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next()
      return
    }
    res.sendFile(path.join(WEB_DIST, 'index.html'))
  })
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '这个接口不存在。' } })
})

// Error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: { code: 'UPLOAD_TOO_LARGE', message: '这张图片太大了，最大支持 8MB。' },
        })
        return
      }
      res.status(400).json({ error: { code: 'UPLOAD_FAILED', message: '图片上传失败了，再试一次。' } })
      return
    }
    if (err instanceof Error && err.message === 'UNSUPPORTED_IMAGE_TYPE') {
      res.status(400).json({
        error: { code: 'UPLOAD_INVALID_TYPE', message: '只支持 PNG、JPG 或 WebP 图片。' },
      })
      return
    }
    if (err instanceof SyntaxError && 'status' in err) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求内容格式不正确。' } })
      return
    }
    console.error('[api error]', err)
    res.status(500).json({
      error: { code: 'INTERNAL', message: '命运暂时失联，请稍后再试。' },
    })
  },
)

app.listen(PORT, () => {
  console.log(`\n  ✦ 别纠结 Indeciso API running at http://localhost:${PORT}`)
  if (!fs.existsSync(WEB_DIST)) {
    console.log('   (dev mode — open http://localhost:5173 for the web app)\n')
  } else {
    console.log('   Web app served from web/dist\n')
  }
})

