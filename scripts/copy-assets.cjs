// Copies self-hosted third-party assets into the renderer public dir (local-first: no CDN fonts).
const { cpSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const src = join(__dirname, '../node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const dest = join(__dirname, '../src/renderer/public/excalidraw/fonts')
if (existsSync(src) && !existsSync(dest)) cpSync(src, dest, { recursive: true })
