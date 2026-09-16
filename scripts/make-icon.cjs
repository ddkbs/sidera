// Renders build/icon.png (1024×1024) with Electron. Run: ELECTRON_ENABLE_LOGGING=0 npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1c22"/><stop offset="1" stop-color="#0b0b0f"/></linearGradient>
    <radialGradient id="orb" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#e0e7ff"/><stop offset="0.45" stop-color="#818cf8"/><stop offset="1" stop-color="#6d28d9"/></radialGradient>
    <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="2.2" fill="#ffffff" opacity="0.12"/></pattern>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#bg)"/>
  <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#dots)"/>
  <rect x="230" y="300" width="300" height="210" rx="36" fill="#fafafa"/>
  <rect x="262" y="340" width="170" height="22" rx="11" fill="#18181b"/>
  <rect x="262" y="385" width="220" height="14" rx="7" fill="#a1a1aa"/>
  <rect x="262" y="415" width="190" height="14" rx="7" fill="#a1a1aa"/>
  <rect x="494" y="560" width="300" height="190" rx="36" fill="#fafafa" opacity="0.92"/>
  <rect x="526" y="600" width="150" height="22" rx="11" fill="#18181b"/>
  <rect x="526" y="645" width="210" height="14" rx="7" fill="#a1a1aa"/>
  <path d="M530 405 C 640 405, 644 560, 644 552" fill="none" stroke="#818cf8" stroke-width="16" stroke-linecap="round"/>
  <circle cx="720" cy="330" r="72" fill="url(#orb)"/>
</svg></body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(__dirname, '../build/icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG())
  app.quit()
})
