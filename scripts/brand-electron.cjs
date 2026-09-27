// Dev only (macOS): `npm run dev` runs the stock Electron.app, so the Dock, ⌘-Tab and the app menu say "Electron"
// with Electron's icon. Patch that local bundle's name + icon to CanvasCL. Idempotent; packaged builds use electron-builder.
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

if (process.platform !== 'darwin') process.exit(0)
const root = join(__dirname, '..')
const bundle = join(root, 'node_modules/electron/dist/Electron.app')
const plist = join(bundle, 'Contents/Info.plist')
const icns = join(root, 'build/icon.icns')
if (!existsSync(plist) || !existsSync(icns)) process.exit(0)

const NAME = 'CanvasCL'
const stamp = join(bundle, '../.canvascl-brand')
const iconHash = require('node:crypto').createHash('sha1').update(readFileSync(icns)).digest('hex')
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === iconHash) process.exit(0)

const buddy = (cmd) => execFileSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist])
for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
  try {
    buddy(`Set :${key} ${NAME}`)
  } catch {
    buddy(`Add :${key} string ${NAME}`)
  }
}

// build/icon.icns is rendered natively per size by `npm run icon` (scripts/make-icon.cjs)
copyFileSync(icns, join(bundle, 'Contents/Resources/electron.icns'))

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
