import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Deploy at a sub-path (e.g. APP_BASE=/indeciso/) or at the domain root.
  // The value must match the nginx location prefix that proxies to this app.
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = process.env.APP_BASE ?? env.APP_BASE ?? '/'
  const base = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`
  const prefix = base === '/' ? '' : base.slice(0, -1)

  const apiProxy = {
    target: 'http://localhost:8787',
    changeOrigin: false,
    ...(prefix ? { rewrite: (p: string) => p.slice(prefix.length) } : {}),
  }

  return {
    base,
    root: 'web',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'web/src'),
        '@shared': path.resolve(process.cwd(), 'shared'),
      },
    },
    server: {
      port: 5173,
      fs: { allow: [process.cwd()] },
      proxy: {
        [`${prefix}/api`]: apiProxy,
        [`${prefix}/uploads`]: apiProxy,
      },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  }
})
