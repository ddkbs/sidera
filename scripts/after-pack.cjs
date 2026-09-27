// electron-builder afterPack hook: strips better-sqlite3 prebuilt binaries for platforms/arches
// other than the one we're currently packaging. better-sqlite3 ships prebuilds for every
// platform (win32/linux/darwin x arm64/x64) inside node_modules/better-sqlite3/prebuilds, and
// our asarUnpack rule (`**/*.node`) copies all of them into app.asar.unpacked verbatim — this is
// the single biggest contributor to package bloat. Only one file is ever required at runtime
// (see node_modules/better-sqlite3/lib/binding.js), so it's safe to delete the rest here, before
// code signing seals the Resources directory.
const { readdirSync, rmSync, existsSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function afterPack(context) {
  const { appOutDir, packager, arch } = context
  const archName = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][arch]
  const platform = packager.platform.nodeName // 'darwin'
  const keep = `${platform}-${archName}.node`

  const candidates = [
    join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds')
  ]

  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      if (file !== keep) rmSync(join(dir, file), { force: true })
    }
  }
}
