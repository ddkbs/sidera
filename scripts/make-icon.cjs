// Renders build/icon.png (1024×1024) with Electron. Run: ELECTRON_ENABLE_LOGGING=0 npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26262b"/><stop offset="1" stop-color="#0a0a0c"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
  </defs>
  <!-- macOS icon grid: 824px squircle-ish body inside the 1024 canvas -->
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="url(#rim)" stroke-width="3"/>
  <!-- mark: a "C" frame (the canvas) with a node -->
  <path d="M648 322 H410 a88 88 0 0 0 -88 88 V614 a88 88 0 0 0 88 88 H648" fill="none" stroke="#fff" stroke-width="64" stroke-linecap="round"/>
  <circle cx="652" cy="512" r="64" fill="#fff"/>
</svg></body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(__dirname, '../build/icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG())
  app.quit()
})
