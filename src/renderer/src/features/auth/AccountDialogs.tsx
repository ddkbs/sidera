import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type { PublicAccount, SessionInfo } from '@shared/auth'
import { TriangleAlert } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/lib/i18n'
import { AccountForm, Spinner } from './AccountForm'
import { PRESELECT_KEY } from './SignInScreen'

// ─── session snapshot (window.auth.session is fixed per page load; account edits update it here) ──────

let current: SessionInfo | null = window.auth?.session ?? null
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))

export function useAuthSession(): SessionInfo | null {
  return useSyncExternalStore(subscribe, () => current)
}

/** Re-reads the session from main (after renaming the account, changing its password, …). */
export async function refreshAuthSession(): Promise<void> {
  current = (await window.auth.status()).session
  listeners.forEach((l) => l())
}

// ─── dialogs, opened from anywhere ────────────────────────────────────────────────────────────────

type DialogKind = 'save-guest' | 'end-guest' | null
let dialog: DialogKind = null
const dialogListeners = new Set<() => void>()
const setDialog = (d: DialogKind) => {
  dialog = d
  dialogListeners.forEach((l) => l())
}
export const openSaveGuestDialog = () => setDialog('save-guest')

/** Sign out; a guest is asked first because that deletes the guest workspace. */
export function signOut(): void {
  if (current?.kind === 'guest') return setDialog('end-guest')
  void window.auth.signOut()
}

/** Switch straight to another account; password-protected ones open the sign-in screen with that row expanded. */
export async function switchToAccount(a: PublicAccount): Promise<void> {
  if (current?.kind === 'guest') return setDialog('end-guest')
  if (a.hasPassword || a.needsSetup) {
    try {
      sessionStorage.setItem(PRESELECT_KEY, a.id)
    } catch {
      /* ignore */
    }
    return void window.auth.signOut()
  }
  const res = await window.auth.signIn(a.id)
  if (!res.ok) toast.error(res.error)
}

export function useOtherAccounts(enabled: boolean): PublicAccount[] {
  const session = useAuthSession()
  const [list, setList] = useState<PublicAccount[]>([])
  useEffect(() => {
    if (enabled) void window.auth.listAccounts().then(setList)
  }, [enabled])
  return list.filter((a) => a.id !== session?.account?.id)
}

/** Mounted once in AppShell. */
export function AccountDialogs() {
  const open = useSyncExternalStore(
    (cb) => (dialogListeners.add(cb), () => dialogListeners.delete(cb)),
    () => dialog
  )
  const [ending, setEnding] = useState(false)
  const close = () => setDialog(null)
  return (
    <>
      <Dialog open={open === 'save-guest'} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('account.saveGuestTitle')}</DialogTitle>
            <DialogDescription>{t('account.saveGuestBody')}</DialogDescription>
          </DialogHeader>
          {open === 'save-guest' && <AccountForm submitLabel={t('account.saveAccount')} onSubmit={(input) => window.auth.saveGuestAsAccount(input)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'end-guest'} onOpenChange={(o) => !o && !ending && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-500" />
              {t('account.endGuestTitle')}
            </DialogTitle>
            <DialogDescription>{t('account.endGuestBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setDialog('save-guest')} disabled={ending}>
              {t('account.saveGuest')}
            </Button>
            <Button
              variant="destructive"
              disabled={ending}
              onClick={() => {
                setEnding(true)
                void window.auth.signOut()
              }}
            >
              {ending && <Spinner />}
              {t('account.deleteSignOut')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
