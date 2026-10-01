import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Sidera for iPad: a second build of the real renderer (WhiteboardView, nodes, RTK Query store) with `window.api`
 * implemented over the encrypted LAN channel (src/renderer/src/ipad). Output: out/ipad, served by the Mac's iPad
 * server (src/main/ipad/server.ts) and packaged with the rest of out/. Build: `npm run build:ipad`
 * (scripts/build-ipad.mjs, also run by predev / prebuild / dist). `--mode ipad` makes `IS_IPAD` true.
 */
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  mode: 'ipad',
  publicDir: resolve('src/renderer/public'),
  resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve('out/ipad'),
    emptyOutDir: true,
    // iPadOS 17+ Safari; top-level await in the entry
    target: ['safari17'],
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: { input: resolve('src/renderer/ipad.html') }
  }
})
