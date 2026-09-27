// Renders the app icon from build/logo.svg → build/icon.png (1024) + build/icon.icns (every iconset size rendered
// natively, not downscaled). Run: npm run icon
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { withRenderer } = require('./raster.cjs')

const build = join(__dirname, '../build')
const svg = readFileSync(join(build, 'logo.svg'), 'utf8')

withRenderer(app, BrowserWindow, async (render) => {
  writeFileSync(join(build, 'icon.png'), await render(svg, 1024))
  const tmp = mkdtempSync(join(tmpdir(), 'app-icon-'))
  const set = join(tmp, 'icon.iconset')
  mkdirSync(set)
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(join(set, `icon_${size}x${size}.png`), await render(svg, size))
    writeFileSync(join(set, `icon_${size}x${size}@2x.png`), await render(svg, size * 2))
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(build, 'icon.icns')])
  rmSync(tmp, { recursive: true, force: true })
})
