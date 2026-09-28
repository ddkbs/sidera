import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, isAbsolute, join, relative } from 'node:path'
import { nanoid } from 'nanoid'
import { MIN_PASSWORD_LENGTH, type AccountPatch, type NewAccountInput, type PublicAccount } from '@shared/auth'
import { TAG_COLORS } from '@shared/util'
import { hasDbFile, migrateDbFilename } from './db/client'

/** Registry entry as stored in accounts.json. Main-process only — never send this to the renderer. */
export interface StoredAccount {
  id: string
  name: string
  color: string
  /** path of the account picture, relative to dataDir */
  avatarFileName?: string | null
  passwordHash?: string | null
  dataDir: string
  createdAt: number
  lastUsedAt: number | null
  needsSetup?: boolean
}

interface RegistryFile {
  version: 1
  accounts: StoredAccount[]
  lastAccountId: string | null
  /** account that is opened on launch without the sign-in screen ("Keep me signed in") */
  autoSignInId: string | null
  /** account the headless `--mcp-stdio` server serves (the one signed in most recently) */
  activeAccountId: string | null
  legacyChecked?: boolean
}

const EMPTY: RegistryFile = { version: 1, accounts: [], lastAccountId: null, autoSignInId: null, activeAccountId: null }
const AVATAR_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024
const MAX_NAME = 60

// scrypt parameters (N=2^14, r=8, p=1): ~50 ms per check — plenty for a local UI lock.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password.normalize('NFKC'), salt, 64, SCRYPT)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, SCRYPT)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Looks up the name/color of the person who used a legacy data folder (so "Welcome back" can prefill it). */
export type LegacyPeek = (dataDir: string) => { name?: string | null; color?: string | null } | null

/**
 * Local account registry (`<root>/accounts.json`). Each account owns one data folder; new accounts live in
 * `<root>/accounts/<id>/`, the pre-accounts single-user folder `<root>/data` is adopted in place, and the
 * ephemeral guest workspace is `<root>/guest/`. Synchronous and file-based, like SettingsStore.
 */
export class AccountRegistry {
  readonly file: string
  readonly guestDir: string
  readonly accountsDir: string
  readonly legacyDir: string

  constructor(
    readonly root: string,
    private now: () => number = Date.now
  ) {
    this.file = join(root, 'accounts.json')
    this.guestDir = join(root, 'guest')
    this.accountsDir = join(root, 'accounts')
    this.legacyDir = join(root, 'data')
  }

  private read(): RegistryFile {
    try {
      if (existsSync(this.file)) return { ...EMPTY, ...(JSON.parse(readFileSync(this.file, 'utf8')) as Partial<RegistryFile>) }
    } catch {
      // A corrupt registry must never lock anyone out of their data: fall back to empty (legacy check re-runs).
    }
    return { ...EMPTY, accounts: [] }
  }

  private write(reg: RegistryFile): void {
    mkdirSync(this.root, { recursive: true })
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(reg, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  private mutate<T>(fn: (reg: RegistryFile) => T): T {
    const reg = this.read()
    const out = fn(reg)
    this.write(reg)
    return out
  }

  get(id: string): StoredAccount | undefined {
    return this.read().accounts.find((a) => a.id === id)
  }

  list(): PublicAccount[] {
    return this.read()
      .accounts.slice()
      .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt))
      .map((a) => this.toPublic(a))
  }

  toPublic(a: StoredAccount): PublicAccount {
    return {
      id: a.id,
      name: a.name,
      color: a.color,
      avatarDataUrl: this.avatarDataUrl(a),
      hasPassword: !!a.passwordHash,
      needsSetup: !!a.needsSetup,
      createdAt: a.createdAt,
      lastUsedAt: a.lastUsedAt
    }
  }

  private avatarDataUrl(a: StoredAccount): string | null {
    if (!a.avatarFileName) return null
    const mime = AVATAR_MIME[extname(a.avatarFileName).toLowerCase()]
    const path = join(a.dataDir, a.avatarFileName)
    if (!mime || !existsSync(path)) return null
    try {
      if (statSync(path).size > MAX_AVATAR_BYTES) return null
      return `data:${mime};base64,${readFileSync(path).toString('base64')}`
    } catch {
      return null
    }
  }

  get lastAccountId(): string | null {
    return this.read().lastAccountId
  }

  /** The account to open without showing the sign-in screen, if "Keep me signed in" was chosen. */
  autoSignInAccount(): StoredAccount | null {
    const reg = this.read()
    return reg.accounts.find((a) => a.id === reg.autoSignInId && !a.needsSetup) ?? null
  }

  /** Data folder the headless MCP server should serve: the active account, else the legacy folder. */
  activeDataDir(): string | null {
    const reg = this.read()
    const acc = reg.accounts.find((a) => a.id === reg.activeAccountId) ?? reg.accounts.find((a) => a.id === reg.lastAccountId)
    if (acc) return acc.dataDir
    return hasDbFile(this.legacyDir) ? this.legacyDir : null
  }

  /**
   * Adopts the pre-accounts data folder as the first account (files stay where they are). Runs once;
   * the account is flagged `needsSetup` so the sign-in screen can ask the user to name it.
   */
  migrateLegacy(peek?: LegacyPeek): StoredAccount | null {
    const reg = this.read()
    if (reg.legacyChecked) return null
    reg.legacyChecked = true
    let adopted: StoredAccount | null = null
    // Rename a pre-rename canvascl.db in place before checking, so the file-existence check below and any
    // later Session.open() for this folder agree on the current filename.
    migrateDbFilename(this.legacyDir)
    const hasDb = hasDbFile(this.legacyDir)
    if (hasDb && !reg.accounts.some((a) => a.dataDir === this.legacyDir)) {
      let who: ReturnType<LegacyPeek> = null
      try {
        who = peek?.(this.legacyDir) ?? null
      } catch {
        who = null
      }
      adopted = {
        id: nanoid(),
        name: cleanName(who?.name ?? '') || 'My workspace',
        color: validColor(who?.color) ?? 'blue',
        dataDir: this.legacyDir,
        createdAt: this.now(),
        lastUsedAt: null,
        needsSetup: true
      }
      reg.accounts.push(adopted)
      reg.lastAccountId = adopted.id
    }
    this.write(reg)
    return adopted
  }

  create(input: NewAccountInput): StoredAccount {
    return this.mutate((reg) => {
      const id = nanoid()
      const acc: StoredAccount = {
        id,
        name: this.validName(reg, input.name),
        color: validColor(input.color) ?? TAG_COLORS[(reg.accounts.length + 6) % TAG_COLORS.length],
        passwordHash: passwordHashFor(input.password),
        dataDir: join(this.accountsDir, id),
        createdAt: this.now(),
        lastUsedAt: null
      }
      mkdirSync(acc.dataDir, { recursive: true })
      reg.accounts.push(acc)
      return acc
    })
  }

  /** Completes the "Welcome back" flow of a migrated account. */
  finishSetup(id: string, input: NewAccountInput): StoredAccount {
    return this.mutate((reg) => {
      const acc = find(reg, id)
      if (!acc.needsSetup) throw new Error('This account is already set up')
      acc.name = this.validName(reg, input.name, id)
      acc.color = validColor(input.color) ?? acc.color
      acc.passwordHash = passwordHashFor(input.password)
      delete acc.needsSetup
      return acc
    })
  }

  /** True when the account has no password, or `password` matches it. */
  verifyPassword(id: string, password?: string | null): boolean {
    const acc = this.get(id)
    if (!acc) return false
    if (!acc.passwordHash) return true
    return !!password && verifyPasswordHash(password, acc.passwordHash)
  }

  update(id: string, patch: AccountPatch): StoredAccount {
    return this.mutate((reg) => {
      const acc = find(reg, id)
      if (patch.name !== undefined) acc.name = this.validName(reg, patch.name, id)
      if (patch.color !== undefined) acc.color = validColor(patch.color) ?? acc.color
      if (patch.password !== undefined) {
        if (acc.passwordHash && !(patch.currentPassword && verifyPasswordHash(patch.currentPassword, acc.passwordHash)))
          throw new Error('Current password is incorrect')
        acc.passwordHash = passwordHashFor(patch.password)
      }
      return acc
    })
  }

  setAvatar(id: string, dataDirRelativePath: string | null): void {
    this.mutate((reg) => {
      const acc = reg.accounts.find((a) => a.id === id)
      if (!acc) return
      if (dataDirRelativePath && (isAbsolute(dataDirRelativePath) || dataDirRelativePath.startsWith('..'))) return
      acc.avatarFileName = dataDirRelativePath
    })
  }

  /** Records a sign-in. `staySignedIn` decides whether the next launch skips the sign-in screen. */
  markSignedIn(id: string, staySignedIn: boolean): void {
    this.mutate((reg) => {
      const acc = find(reg, id)
      acc.lastUsedAt = this.now()
      reg.lastAccountId = id
      reg.activeAccountId = id
      reg.autoSignInId = staySignedIn ? id : null
    })
  }

  signedOut(): void {
    this.mutate((reg) => {
      reg.autoSignInId = null
    })
  }

  /** Removes the account from the registry and returns it; the caller moves `dataDir` to the Trash. */
  remove(id: string): StoredAccount {
    return this.mutate((reg) => {
      const acc = find(reg, id)
      reg.accounts = reg.accounts.filter((a) => a.id !== id)
      if (reg.lastAccountId === id) reg.lastAccountId = reg.accounts[0]?.id ?? null
      if (reg.autoSignInId === id) reg.autoSignInId = null
      if (reg.activeAccountId === id) reg.activeAccountId = null
      return acc
    })
  }

  /** Deletes the guest workspace. Guest data is ephemeral by design (the UI warns about it). */
  wipeGuest(): void {
    // Safety: only ever the guest folder inside our own root.
    const rel = relative(this.root, this.guestDir)
    if (rel !== 'guest') throw new Error('Refusing to wipe an unexpected folder')
    rmSync(this.guestDir, { recursive: true, force: true })
  }

  /** Fresh, empty guest workspace (wipes whatever the previous guest left behind). */
  prepareGuest(): string {
    this.wipeGuest()
    mkdirSync(this.guestDir, { recursive: true })
    return this.guestDir
  }

  /** Throws the same validation errors `create` would, without writing anything. */
  validate(input: NewAccountInput, selfId?: string): void {
    this.validName(this.read(), input.name, selfId)
    passwordHashFor(input.password)
  }

  /** Turns the guest workspace into a real account: moves the folder to `accounts/<id>` and registers it. */
  saveGuestAsAccount(input: NewAccountInput): StoredAccount {
    if (!existsSync(this.guestDir)) throw new Error('There is no guest workspace to save')
    return this.mutate((reg) => {
      const id = nanoid()
      const acc: StoredAccount = {
        id,
        name: this.validName(reg, input.name),
        color: validColor(input.color) ?? TAG_COLORS[(reg.accounts.length + 6) % TAG_COLORS.length],
        passwordHash: passwordHashFor(input.password),
        dataDir: join(this.accountsDir, id),
        createdAt: this.now(),
        lastUsedAt: null
      }
      mkdirSync(this.accountsDir, { recursive: true })
      renameSync(this.guestDir, acc.dataDir)
      reg.accounts.push(acc)
      return acc
    })
  }

  private validName(reg: RegistryFile, raw: string, selfId?: string): string {
    const name = cleanName(raw)
    if (!name) throw new Error('Please enter a name')
    if (reg.accounts.some((a) => a.id !== selfId && a.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      throw new Error(`An account named “${name}” already exists`)
    return name
  }
}

function find(reg: RegistryFile, id: string): StoredAccount {
  const acc = reg.accounts.find((a) => a.id === id)
  if (!acc) throw new Error('Account not found')
  return acc
}

const cleanName = (raw: string): string => raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
const validColor = (c: string | null | undefined): string | null => (c && (TAG_COLORS as readonly string[]).includes(c) ? c : null)

function passwordHashFor(password: string | null | undefined): string | null {
  if (!password) return null
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  return hashPassword(password)
}
