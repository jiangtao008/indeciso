import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/uploads': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
