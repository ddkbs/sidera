// Dev only (macOS): `npm run dev` runs the stock Electron.app, so the Dock, ⌘-Tab and the app menu say "Electron"
// with Electron's icon. Patch that local bundle's name + icon to CanvasCL. Idempotent; packaged builds use electron-builder.
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

if (process.platform !== 'darwin') process.exit(0)
const root = join(__dirname, '..')
const bundle = join(root, 'node_modules/electron/dist/Electron.app')
const plist = join(bundle, 'Contents/Info.plist')
const icon = join(root, 'build/icon.png')
if (!existsSync(plist) || !existsSync(icon)) process.exit(0)

const NAME = 'CanvasCL'
const stamp = join(bundle, '../.canvascl-brand')
const iconHash = require('node:crypto').createHash('sha1').update(readFileSync(icon)).digest('hex')
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === iconHash) process.exit(0)

const buddy = (cmd) => execFileSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist])
for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
  try {
    buddy(`Set :${key} ${NAME}`)
  } catch {
    buddy(`Add :${key} string ${NAME}`)
  }
}

// build/icon.png → .icns via sips + iconutil (both ship with macOS)
const tmp = mkdtempSync(join(tmpdir(), 'canvascl-icon-'))
const set = join(tmp, 'icon.iconset')
mkdirSync(set)
for (const size of [16, 32, 128, 256, 512]) {
  execFileSync('sips', ['-z', String(size), String(size), icon, '--out', join(set, `icon_${size}x${size}.png`)], { stdio: 'ignore' })
  execFileSync('sips', ['-z', String(size * 2), String(size * 2), icon, '--out', join(set, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' })
}
const icns = join(tmp, 'icon.icns')
execFileSync('iconutil', ['-c', 'icns', set, '-o', icns])
copyFileSync(icns, join(bundle, 'Contents/Resources/electron.icns'))
copyFileSync(icns, join(root, 'build/icon.icns'))
rmSync(tmp, { recursive: true, force: true })

// the patched plist invalidates Electron's signature → re-sign ad hoc so macOS still launches it
execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'ignore' })
// make Finder/Dock pick up the change
execFileSync('touch', [bundle])
try {
  execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', bundle])
} catch {
  /* best effort */
}
writeFileSync(stamp, iconHash)
console.log(`Branded dev Electron.app as ${NAME}`)
