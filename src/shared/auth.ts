// Local accounts: every account is a separate data folder (database, files, settings, API keys) on this Mac.
// There is no server — "signing in" just picks which folder the app opens.

/** What the renderer may know about an account. Never includes the password hash or the data path. */
export interface PublicAccount {
  id: string
  name: string
  /** TAG_COLORS key used as the initials background */
  color: string
  /** small data: URL of the account picture, if any */
  avatarDataUrl: string | null
  hasPassword: boolean
  /** migrated from the single-user data folder and not yet named — show the "Welcome back" flow */
  needsSetup: boolean
  createdAt: number
  lastUsedAt: number | null
}

export type SessionKind = 'account' | 'guest' | 'dev'

export interface SessionInfo {
  kind: SessionKind
  /** null for guest and dev (SIDERA_DATA_DIR) sessions */
  account: PublicAccount | null
  /** suffix for renderer localStorage keys, so tabs & UI state don't leak between accounts ('' = bare keys) */
  storageNamespace: string
}

export interface AuthStatus {
  session: SessionInfo | null
  lastAccountId: string | null
}

export interface NewAccountInput {
  name: string
  color?: string
  password?: string | null
  staySignedIn?: boolean
}

export interface AccountPatch {
  name?: string
  color?: string
  /** string sets/changes the password, null removes it */
  password?: string | null
  /** required when the account already has a password and `password` changes */
  currentPassword?: string
}

export type AuthResult = { ok: true } | { ok: false; error: string }

export interface AuthBridge {
  /** synchronous snapshot taken when the page loaded (the page reloads on every sign-in / sign-out) */
  readonly session: SessionInfo | null
  status(): Promise<AuthStatus>
  listAccounts(): Promise<PublicAccount[]>
  createAccount(input: NewAccountInput): Promise<AuthResult>
  /** finishes the "Welcome back" flow for a migrated account (name, color, optional password) and signs in */
  setupAccount(id: string, input: NewAccountInput): Promise<AuthResult>
  signIn(id: string, password?: string, staySignedIn?: boolean): Promise<AuthResult>
  continueAsGuest(): Promise<AuthResult>
  saveGuestAsAccount(input: NewAccountInput): Promise<AuthResult>
  signOut(): Promise<void>
  updateAccount(patch: AccountPatch): Promise<AuthResult>
  /** moves the account's data folder to the Trash (never hard-deleted) */
  deleteAccount(id: string, password?: string): Promise<AuthResult>
}

export const MIN_PASSWORD_LENGTH = 4

/** Renderer localStorage key for the given session namespace ('' keeps the bare key: legacy account, dev folders). */
export const namespacedKey = (key: string, namespace: string): string => (namespace ? `${key}@${namespace}` : key)

export const GUEST_NAMESPACE = 'guest'
