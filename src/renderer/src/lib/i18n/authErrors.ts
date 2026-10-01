import type { MessageKey } from './en'
import { t } from './index'

/**
 * Auth errors come from the main process in English (it runs before any account — and its language — is known).
 * Known messages are translated for display; anything else is shown as-is.
 */
const EXACT: Record<string, MessageKey> = {
  'Wrong password': 'authError.wrongPassword',
  'Account not found': 'authError.notFound',
  'Finish setting up this account first': 'authError.finishSetup',
  'This account’s data folder is missing.': 'authError.folderMissing',
  'Not in a guest session': 'authError.notGuest',
  'Not signed in to an account': 'authError.notSignedIn',
  'This account is already set up': 'authError.alreadySetUp',
  'Current password is incorrect': 'authError.currentWrong',
  'There is no guest workspace to save': 'authError.noGuest',
  'Please enter a name': 'account.nameRequired'
}

export function authError(message: string): string {
  if (message in EXACT) return t(EXACT[message])
  const exists = /^An account named “(.*)” already exists$/.exec(message)
  if (exists) return t('authError.exists', { name: exists[1] })
  const short = /^Password must be at least (\d+) characters$/.exec(message)
  if (short) return t('account.passwordTooShort', { n: short[1] })
  return message
}
