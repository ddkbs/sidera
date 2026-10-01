// Builds Sidera for iPad (vite.ipad.config.ts → out/ipad) plus its home-screen icons.
// Run by predev / prebuild / dist. Skips the (slow) Vite build when nothing it depends on changed since the last one;
// `--force` rebuilds anyway. Output is generated, not committed; electron-builder packages it with the rest of out/.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out/ipad')
const stamp = join(out, '.stamp')

const newest = (p) => {
  if (!existsSync(p)) return 0
  const s = statSync(p)
  if (!s.isDirectory()) return s.mtimeMs
  return Math.max(s.mtimeMs, ...readdirSync(p).map((n) => (n === 'node_modules' ? 0 : newest(join(p, n)))))
}
const inputs = ['src/renderer', 'src/shared', 'vite.ipad.config.ts', 'scripts/build-ipad.mjs', 'package-lock.json'].map((p) => join(root, p))
const fresh = existsSync(stamp) && Number(readFileSync(stamp, 'utf8')) >= Math.max(...inputs.map(newest))
if (fresh && !process.argv.includes('--force')) {
  console.log('ipad app → out/ipad (up to date)')
  process.exit(0)
}

const started = Date.now()
await build({ configFile: join(root, 'vite.ipad.config.ts'), mode: 'ipad', logLevel: 'warn' })

mkdirSync(out, { recursive: true })
// Home-screen icons (sips ships with macOS)
for (const size of [180, 512]) {
  execFileSync('/usr/bin/sips', ['-z', String(size), String(size), join(root, 'build/icon.png'), '--out', join(out, `icon-${size}.png`)], { stdio: 'ignore' })
}
// No web-app manifest on purpose: with one, iPadOS bookmarks the URL the page was first loaded with (the one-time QR
// link) instead of the current address, whose fragment carries the device credential (renderer/src/ipad/credentials.ts).
// The apple-mobile-web-app-* meta tags in ipad.html make it a standalone home-screen app.
rmSync(join(out, 'manifest.webmanifest'), { force: true })
writeFileSync(stamp, String(Date.now()))
console.log(`ipad app → out/ipad (${((Date.now() - started) / 1000).toFixed(1)} s)`)
