// electron-builder afterSign hook: signs Sidera.app with the project's self-signed certificate ("Sidera Self-Signed").
// Without an Apple Developer ID the app can't be notarized, but a stable certificate gives every release the same code
// identity (designated requirement = bundle id + certificate), so macOS keeps trusting it for the Keychain item that
// holds AI keys and iPad pairings across updates. Ad-hoc signatures change with every build and trigger a Keychain
// password prompt after each update.
//
// Certificate: SIDERA_SIGN_P12 (path to the .p12 or its base64 content, as stored in the CI secret) and
// SIDERA_SIGN_PASSWORD; locally falls back to ~/.sidera-signing/. Without one the app is signed ad-hoc.
const { execFileSync } = require('node:child_process')
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { homedir, tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomBytes } = require('node:crypto')

const IDENTITY = 'Sidera Self-Signed'

function certificate() {
  const local = join(homedir(), '.sidera-signing')
  let p12 = process.env.SIDERA_SIGN_P12
  let password = process.env.SIDERA_SIGN_PASSWORD
  if (!p12 && existsSync(join(local, 'sidera-codesign.p12'))) {
    p12 = join(local, 'sidera-codesign.p12')
    password = readFileSync(join(local, 'p12-password.txt'), 'utf8').trim()
  }
  if (!p12) return null
  return { bytes: existsSync(p12) ? readFileSync(p12) : Buffer.from(p12, 'base64'), password: password ?? '' }
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()

module.exports = async function signMac(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const cert = certificate()
  if (!cert) {
    console.log('  • sign-mac: no certificate, signing ad-hoc')
    run('codesign', ['--force', '--deep', '--sign', '-', app])
    return
  }
  // Throwaway keychain, never added to the user's keychain search list.
  const dir = mkdtempSync(join(tmpdir(), 'sidera-sign-'))
  const keychain = join(dir, 'sign.keychain-db')
  const p12 = join(dir, 'cert.p12')
  const kcPassword = randomBytes(16).toString('hex')
  try {
    writeFileSync(p12, cert.bytes, { mode: 0o600 })
    run('security', ['create-keychain', '-p', kcPassword, keychain])
    run('security', ['set-keychain-settings', keychain])
    run('security', ['unlock-keychain', '-p', kcPassword, keychain])
    run('security', ['import', p12, '-k', keychain, '-P', cert.password, '-T', '/usr/bin/codesign'])
    run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', kcPassword, keychain])
    const hash = run('security', ['find-identity', '-p', 'codesigning', keychain])
      .split('\n')
      .find((l) => l.includes(`"${IDENTITY}"`))
      ?.trim()
      .split(/\s+/)[1]
    if (!hash) throw new Error(`sign-mac: "${IDENTITY}" not found in the certificate`)
    run('codesign', ['--force', '--deep', '--sign', hash, '--keychain', keychain, app])
    run('codesign', ['--verify', '--deep', '--strict', app])
    console.log(`  • sign-mac: signed with "${IDENTITY}"`)
  } finally {
    try {
      run('security', ['delete-keychain', keychain])
    } catch {
      // already gone
    }
    rmSync(dir, { recursive: true, force: true })
  }
}
