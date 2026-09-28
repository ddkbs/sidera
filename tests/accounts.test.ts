import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AccountRegistry, hashPassword, verifyPasswordHash } from '../src/main/accounts'

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'sidera-accounts-'))
  return { root, reg: new AccountRegistry(root) }
}

describe('password hashing', () => {
  it('salts, verifies and rejects', () => {
    const a = hashPassword('secret')
    expect(a).not.toBe(hashPassword('secret'))
    expect(a).not.toContain('secret')
    expect(verifyPasswordHash('secret', a)).toBe(true)
    expect(verifyPasswordHash('Secret', a)).toBe(false)
    expect(verifyPasswordHash('secret', 'garbage')).toBe(false)
  })
})

describe('account registry', () => {
  it('creates accounts with their own data folder and lists only public fields', () => {
    const { root, reg } = setup()
    const ada = reg.create({ name: '  Ada   Lovelace ', color: 'purple', password: 'hunter2' })
    expect(ada.name).toBe('Ada Lovelace')
    expect(ada.dataDir).toBe(join(root, 'accounts', ada.id))
    expect(existsSync(ada.dataDir)).toBe(true)
    const [pub] = reg.list()
    expect(pub).toMatchObject({ id: ada.id, name: 'Ada Lovelace', color: 'purple', hasPassword: true, needsSetup: false })
    expect(JSON.stringify(pub)).not.toMatch(/scrypt|passwordHash|dataDir/)
    // registry file never contains the plain password
    expect(readFileSync(reg.file, 'utf8')).not.toContain('hunter2')
  })

  it('validates names and passwords', () => {
    const { reg } = setup()
    reg.create({ name: 'Ada' })
    expect(() => reg.create({ name: '   ' })).toThrow(/name/)
    expect(() => reg.create({ name: 'ada' })).toThrow(/already exists/)
    expect(() => reg.create({ name: 'Bob', password: 'ab' })).toThrow(/at least/)
  })

  it('verifies passwords; accounts without one always pass', () => {
    const { reg } = setup()
    const open = reg.create({ name: 'Open' })
    const locked = reg.create({ name: 'Locked', password: 'correct horse' })
    expect(reg.verifyPassword(open.id)).toBe(true)
    expect(reg.verifyPassword(locked.id)).toBe(false)
    expect(reg.verifyPassword(locked.id, 'wrong')).toBe(false)
    expect(reg.verifyPassword(locked.id, 'correct horse')).toBe(true)
    expect(reg.verifyPassword('missing', 'x')).toBe(false)
  })

  it('changes and removes passwords only with the current one', () => {
    const { reg } = setup()
    const acc = reg.create({ name: 'Ada', password: 'first' })
    expect(() => reg.update(acc.id, { password: 'second' })).toThrow(/Current password/)
    reg.update(acc.id, { password: 'second', currentPassword: 'first' })
    expect(reg.verifyPassword(acc.id, 'second')).toBe(true)
    reg.update(acc.id, { password: null, currentPassword: 'second' })
    expect(reg.list()[0].hasPassword).toBe(false)
    reg.update(acc.id, { password: 'third' }) // no current password needed when none is set
    expect(reg.verifyPassword(acc.id, 'third')).toBe(true)
  })

  it('remembers who stays signed in and forgets on sign-out', () => {
    const { reg } = setup()
    const a = reg.create({ name: 'A' })
    const b = reg.create({ name: 'B' })
    reg.markSignedIn(a.id, true)
    expect(reg.autoSignInAccount()?.id).toBe(a.id)
    reg.markSignedIn(b.id, false)
    expect(reg.autoSignInAccount()).toBeNull()
    expect(reg.lastAccountId).toBe(b.id)
    expect(reg.activeDataDir()).toBe(b.dataDir)
    reg.markSignedIn(a.id, true)
    reg.signedOut()
    expect(reg.autoSignInAccount()).toBeNull()
    expect(reg.list()[0].id).toBe(a.id) // most recently used first
  })

  it('adopts the legacy data folder once, in place, flagged for setup', () => {
    const { root, reg } = setup()
    mkdirSync(join(root, 'data'))
    // 'canvascl.db' simulates a pre-rename install; migrateLegacy renames it to 'sidera.db' along the way.
    writeFileSync(join(root, 'data', 'canvascl.db'), 'x')
    const adopted = reg.migrateLegacy(() => ({ name: 'ddkbs', color: 'teal' }))!
    expect(adopted).toMatchObject({ name: 'ddkbs', color: 'teal', dataDir: join(root, 'data'), needsSetup: true })
    expect(existsSync(join(root, 'data', 'canvascl.db'))).toBe(false)
    expect(existsSync(join(root, 'data', 'sidera.db'))).toBe(true)
    expect(reg.migrateLegacy()).toBeNull()
    expect(reg.list()).toHaveLength(1)
    expect(reg.lastAccountId).toBe(adopted.id)
    // needs setup → never auto-signed-in
    reg.markSignedIn(adopted.id, true)
    expect(reg.autoSignInAccount()).toBeNull()
    const done = reg.finishSetup(adopted.id, { name: 'ddkbs', password: 'pass1' })
    expect(done.needsSetup).toBeUndefined()
    expect(reg.autoSignInAccount()?.id).toBe(adopted.id)
    expect(() => reg.finishSetup(adopted.id, { name: 'x' })).toThrow(/already set up/)
  })

  it('does not invent an account when there is no legacy database', () => {
    const { reg } = setup()
    expect(reg.migrateLegacy()).toBeNull()
    expect(reg.list()).toEqual([])
    expect(reg.activeDataDir()).toBeNull()
  })

  it('falls back to a default name when the legacy peek fails', () => {
    const { root, reg } = setup()
    mkdirSync(join(root, 'data'))
    // pre-rename filename, same as above — exercises the same detection path
    writeFileSync(join(root, 'data', 'canvascl.db'), 'x')
    const adopted = reg.migrateLegacy(() => {
      throw new Error('locked')
    })!
    expect(adopted.name).toBe('My workspace')
  })

  it('wipes the guest workspace on every fresh guest start', () => {
    const { root, reg } = setup()
    const dir = reg.prepareGuest()
    expect(dir).toBe(join(root, 'guest'))
    writeFileSync(join(dir, 'sidera.db'), 'guest data')
    reg.prepareGuest()
    expect(existsSync(join(dir, 'sidera.db'))).toBe(false)
    reg.wipeGuest()
    expect(existsSync(dir)).toBe(false)
  })

  it('saves the guest workspace as a real account by moving the folder', () => {
    const { reg } = setup()
    const dir = reg.prepareGuest()
    writeFileSync(join(dir, 'sidera.db'), 'guest data')
    const acc = reg.saveGuestAsAccount({ name: 'Kept', password: 'pass' })
    expect(existsSync(dir)).toBe(false)
    expect(readFileSync(join(acc.dataDir, 'sidera.db'), 'utf8')).toBe('guest data')
    expect(reg.verifyPassword(acc.id, 'pass')).toBe(true)
    expect(() => reg.saveGuestAsAccount({ name: 'Again' })).toThrow(/no guest/)
  })

  it('removes accounts from the registry (the caller trashes the folder)', () => {
    const { reg } = setup()
    const a = reg.create({ name: 'A' })
    reg.markSignedIn(a.id, true)
    const removed = reg.remove(a.id)
    expect(removed.dataDir).toBe(a.dataDir)
    expect(existsSync(a.dataDir)).toBe(true)
    expect(reg.list()).toEqual([])
    expect(reg.autoSignInAccount()).toBeNull()
    expect(reg.lastAccountId).toBeNull()
  })

  it('exposes an account picture as a data URL and ignores paths outside the data folder', () => {
    const { reg } = setup()
    const a = reg.create({ name: 'A' })
    mkdirSync(join(a.dataDir, 'files'))
    writeFileSync(join(a.dataDir, 'files', 'me.png'), Buffer.from([1, 2, 3]))
    reg.setAvatar(a.id, join('files', 'me.png'))
    expect(reg.list()[0].avatarDataUrl).toBe('data:image/png;base64,AQID')
    reg.setAvatar(a.id, '../../etc/passwd')
    expect(reg.list()[0].avatarDataUrl).toBe('data:image/png;base64,AQID')
  })

  it('survives a corrupt registry file', () => {
    const { reg } = setup()
    reg.create({ name: 'A' })
    writeFileSync(reg.file, '{ nope')
    expect(reg.list()).toEqual([])
    expect(reg.create({ name: 'B' }).name).toBe('B')
  })
})
