import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { MIN_PASSWORD_LENGTH, type AuthResult } from '@shared/auth'
import { APP_NAME } from '@shared/brand'
import { Lock, LogOut, Trash2, TriangleAlert, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { ColorPicker, FormError, Spinner } from './AccountForm'
import { openSaveGuestDialog, refreshAuthSession, signOut, useAuthSession } from './AccountDialogs'

function Row({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const report = async (p: Promise<AuthResult>, success: string): Promise<boolean> => {
  const res = await p
  if (!res.ok) {
    toast.error(res.error)
    return false
  }
  await refreshAuthSession()
  toast.success(success)
  return true
}

/** Settings → Account: the local account this window is signed in to (name, color, password, delete). */
export function AccountSettings() {
  const session = useAuthSession()
  const account = session?.account

  if (session?.kind === 'guest')
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-amber-500" />
            Guest workspace
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you create as a guest — cards, whiteboards, files, settings and API keys — is deleted when you sign out or when the next guest session
            starts.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={openSaveGuestDialog}>
              <Upload />
              Save as account…
            </Button>
            <Button size="sm" variant="outline" onClick={signOut}>
              <LogOut />
              End guest session
            </Button>
          </div>
        </div>
      </div>
    )

  if (!account)
    return <p className="text-sm text-muted-foreground">Accounts are disabled for this window: it was opened on a fixed data folder (CANVASCL_DATA_DIR).</p>

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-xl border p-4">
        <ProfileAvatar profile={{ name: account.name, color: account.color, avatarUrl: account.avatarDataUrl }} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{account.name}</div>
          <div className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            {account.hasPassword && <Lock className="size-3.5" />}
            Local account · stored only on this Mac
          </div>
        </div>
        <Button variant="outline" onClick={signOut}>
          <LogOut />
          Sign out
        </Button>
      </div>

      <Row title="Name" description="Also used as your profile name on comments and tasks.">
        <NameField name={account.name} />
      </Row>
      <Row title="Color">
        <ColorPicker value={account.color} onChange={(color) => void report(window.auth.updateAccount({ color }), 'Color updated')} />
      </Row>
      <Row
        title="Password"
        description={
          account.hasPassword ? 'Asked for when signing in to this account.' : `Optional. Anyone using this Mac can open this account in ${APP_NAME}.`
        }
      >
        <PasswordButton hasPassword={account.hasPassword} />
      </Row>
      <p className="mt-1 mb-8 text-xs text-muted-foreground">
        The password locks this account inside {APP_NAME}; it does not encrypt the files on disk. Use FileVault to protect your Mac.
      </p>

      <div className="rounded-xl border border-destructive/30 p-4">
        <div className="text-sm font-medium">Delete account</div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Removes this account and moves its data folder (notes, whiteboards, files, settings) to the Trash, where you can still recover it.
        </p>
        <DeleteAccountButton id={account.id} name={account.name} hasPassword={account.hasPassword} />
      </div>
    </div>
  )
}

function NameField({ name }: { name: string }) {
  const [value, setValue] = useState(name)
  useEffect(() => setValue(name), [name])
  const save = () => {
    if (value.trim() && value.trim() !== name) void report(window.auth.updateAccount({ name: value }), 'Name updated').then((ok) => !ok && setValue(name))
    else setValue(name)
  }
  return <Input className="w-56" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
}

function PasswordButton({ hasPassword }: { hasPassword: boolean }) {
  const [mode, setMode] = useState<'set' | 'remove' | null>(null)
  return (
    <>
      <div className="flex gap-2">
        {hasPassword && (
          <Button variant="ghost" size="sm" onClick={() => setMode('remove')}>
            Remove
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setMode('set')}>
          {hasPassword ? 'Change password' : 'Set password'}
        </Button>
      </div>
      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-sm">
          {mode && <PasswordForm key={mode} mode={mode} hasPassword={hasPassword} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PasswordForm({ mode, hasPassword, onDone }: { mode: 'set' | 'remove'; hasPassword: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'set') {
      if (next.length < MIN_PASSWORD_LENGTH) return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      if (next !== confirm) return setError('Passwords don’t match')
    }
    setBusy(true)
    const res = await window.auth.updateAccount({ password: mode === 'set' ? next : null, currentPassword: current || undefined })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    await refreshAuthSession()
    toast.success(mode === 'set' ? 'Password saved' : 'Password removed')
    onDone()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{mode === 'remove' ? 'Remove password' : hasPassword ? 'Change password' : 'Set a password'}</DialogTitle>
        <DialogDescription>
          {mode === 'remove' ? 'This account will open without asking for a password.' : 'You’ll be asked for it when signing in to this account.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        {hasPassword && (
          <Input type="password" autoFocus autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
        {mode === 'set' && (
          <>
            <Input type="password" autoFocus={!hasPassword} autoComplete="new-password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
            <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </>
        )}
      </div>
      <FormError>{error}</FormError>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant={mode === 'remove' ? 'destructive' : 'default'} disabled={busy}>
          {busy && <Spinner />}
          {mode === 'remove' ? 'Remove password' : 'Save password'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function DeleteAccountButton({ id, name, hasPassword }: { id: string; name: string; hasPassword: boolean }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const confirmed = typed.trim() === name && (!hasPassword || !!password)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!confirmed) return
    setBusy(true)
    const res = await window.auth.deleteAccount(id, password || undefined)
    // success: main closes the session and reloads this window to the sign-in screen
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" className="mt-3 text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 />
        Delete account…
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Delete “{name}”?</DialogTitle>
              <DialogDescription>You’ll be signed out and the account’s data folder moves to the Trash. Type the account name to confirm.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Input autoFocus placeholder={name} value={typed} onChange={(e) => setTyped(e.target.value)} />
              {hasPassword && <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </div>
            <AnimatePresence>{error && <motion.p className="text-sm text-destructive">{error}</motion.p>}</AnimatePresence>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!confirmed || busy}>
                {busy && <Spinner />}
                Move to Trash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
