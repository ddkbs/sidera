import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimation } from 'motion/react'
import type { PublicAccount } from '@shared/auth'
import { APP_NAME, APP_TAGLINE } from '@shared/brand'
import { ArrowLeft, ArrowRight, ChevronRight, Lock, User, UserPlus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { AccountForm, FormError, Spinner } from './AccountForm'
import { LogoTile } from '@/components/Logo'

/** Account to expand on the sign-in screen after "Switch account" → a password-protected account. */
export const PRESELECT_KEY = 'canvascl.auth.preselect'

type View = { kind: 'pick' } | { kind: 'create' } | { kind: 'setup'; account: PublicAccount }

const ease = [0.22, 1, 0.36, 1] as const
const panel = {
  initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease } },
  exit: { opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: 0.18 } }
}

/** The sign-in screen follows the OS appearance (theme is a per-account preference). */
function useSystemTheme(): void {
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
}

function lastUsedLabel(ts: number | null): string {
  if (!ts) return 'Never opened'
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 2) return 'Active just now'
  if (mins < 60) return `Last opened ${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Last opened ${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Last opened yesterday'
  if (days < 30) return `Last opened ${days} days ago`
  return `Last opened ${new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const avatarOf = (a: PublicAccount) => ({ name: a.name, color: a.color, avatarUrl: a.avatarDataUrl })

/** Full-window gate shown while nobody is signed in: pick / create an account or continue as guest. */
export function SignInScreen() {
  useSystemTheme()
  const [accounts, setAccounts] = useState<PublicAccount[] | null>(null)
  const [view, setView] = useState<View>({ kind: 'pick' })

  useEffect(() => {
    void window.auth.listAccounts().then((list) => {
      setAccounts(list)
      const pending = list.find((a) => a.needsSetup)
      if (pending) setView({ kind: 'setup', account: pending })
      else if (!list.length) setView({ kind: 'create' })
    })
  }, [])

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground select-none">
      {/* canvas-like dot grid, fading out toward the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 text-foreground/[0.09] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent)]"
        style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      {/* window stays draggable; the traffic lights sit in this strip */}
      <div className="drag-region absolute inset-x-0 top-0 h-12" />

      <main className="relative flex flex-1 items-center justify-center overflow-y-auto px-6 py-16">
        <div className="w-full max-w-[380px]">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }}>
            <LogoTile className="mb-6 size-11" />
          </motion.div>
          {accounts && (
            <AnimatePresence mode="wait" initial={true}>
              {view.kind === 'pick' && (
                <motion.div key="pick" {...panel}>
                  <Picker accounts={accounts} onCreate={() => setView({ kind: 'create' })} />
                </motion.div>
              )}
              {view.kind === 'create' && (
                <motion.div key="create" {...panel}>
                  <Header
                    title={accounts.length ? 'Create an account' : `Welcome to ${APP_NAME}`}
                    subtitle={accounts.length ? 'Each account has its own notes, whiteboards, files and settings.' : APP_TAGLINE}
                    back={accounts.length ? () => setView({ kind: 'pick' }) : undefined}
                  />
                  <AccountForm
                    submitLabel={accounts.length ? 'Create account' : 'Get started'}
                    initialColor={['blue', 'purple', 'teal', 'orange', 'pink', 'green'][accounts.length % 6]}
                    onSubmit={(input) => window.auth.createAccount(input)}
                  />
                  {!accounts.length && <GuestButton className="mt-3" />}
                </motion.div>
              )}
              {view.kind === 'setup' && (
                <motion.div key="setup" {...panel}>
                  <Header
                    title="Welcome back"
                    subtitle={`${APP_NAME} now has accounts. Your notes, whiteboards and settings are safe and unchanged — confirm your name to continue.`}
                  />
                  <AccountForm
                    initialName={view.account.name}
                    initialColor={view.account.color}
                    submitLabel="Continue"
                    onSubmit={(input) => window.auth.setupAccount(view.account.id, input)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      <footer className="relative flex items-center justify-center gap-1.5 pb-5 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        Accounts are stored only on this Mac — nothing is sent to a server.
      </footer>
    </div>
  )
}

function Header({ title, subtitle, back }: { title: string; subtitle: ReactNode; back?: () => void }) {
  return (
    <div className="mb-6">
      {back && (
        <button
          type="button"
          onClick={back}
          className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All accounts
        </button>
      )}
      <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function GuestButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    const res = await window.auth.continueAsGuest()
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
    }
  }
  return (
    <div className={className}>
      <Button variant="ghost" className="w-full text-muted-foreground" disabled={busy} onClick={() => void go()} data-testid="continue-as-guest">
        {busy ? <Spinner /> : <User />}
        Continue as guest
      </Button>
      <p className="mt-1 text-center text-xs text-muted-foreground/80">A temporary workspace — deleted when you sign out.</p>
      <FormError>{error}</FormError>
    </div>
  )
}

function Picker({ accounts, onCreate }: { accounts: PublicAccount[]; onCreate: () => void }) {
  const [open, setOpen] = useState<string | null>(() => {
    try {
      const id = sessionStorage.getItem(PRESELECT_KEY)
      sessionStorage.removeItem(PRESELECT_KEY)
      return id && accounts.some((a) => a.id === id) ? id : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stay, setStay] = useState(true)

  const signIn = async (a: PublicAccount, password?: string) => {
    setBusy(a.id)
    setError(null)
    const res = await window.auth.signIn(a.id, password, stay)
    if (!res.ok) {
      setBusy(null)
      setError(res.error)
    }
    return res
  }

  return (
    <>
      <Header title={`Sign in to ${APP_NAME}`} subtitle="Choose an account to continue." />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {accounts.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.05 + i * 0.04, duration: 0.3, ease } }}
            className={cn(i > 0 && 'border-t')}
          >
            <button
              type="button"
              data-account={a.name}
              disabled={!!busy}
              onClick={() => {
                setError(null)
                if (a.hasPassword) setOpen(open === a.id ? null : a.id)
                else void signIn(a)
              }}
              className={cn(
                'group flex w-full items-center gap-3 px-3.5 py-3 text-left transition outline-none hover:bg-accent/60 focus-visible:bg-accent/60 disabled:cursor-default',
                open === a.id && 'bg-accent/40'
              )}
            >
              <ProfileAvatar profile={avatarOf(a)} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {a.hasPassword && <Lock className="size-3" />}
                  {lastUsedLabel(a.lastUsedAt)}
                </span>
              </span>
              {busy === a.id && !a.hasPassword ? (
                <Spinner className="text-muted-foreground" />
              ) : (
                <ChevronRight
                  className={cn('size-4 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground', open === a.id && 'rotate-90')}
                />
              )}
            </button>
            <AnimatePresence initial={false}>
              {open === a.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease }}
                  className="overflow-hidden"
                >
                  <PasswordRow busy={busy === a.id} onSubmit={(pw) => signIn(a, pw)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      <FormError>{error && <span className="mt-2 block">{error}</span>}</FormError>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={stay} onCheckedChange={(v) => setStay(v === true)} />
        Keep me signed in on this Mac
      </label>

      <div className="mt-6 grid gap-2">
        <Button variant="outline" className="w-full" onClick={onCreate} disabled={!!busy}>
          <UserPlus />
          Add account
        </Button>
        <GuestButton />
      </div>
    </>
  )
}

function PasswordRow({ busy, onSubmit }: { busy: boolean; onSubmit: (pw: string) => Promise<{ ok: boolean }> }) {
  const [pw, setPw] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const shake = useAnimation()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!pw) return input.current?.focus()
    const res = await onSubmit(pw)
    if (!res.ok) {
      setPw('')
      input.current?.focus()
      void shake.start({ x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.35 } })
    }
  }
  return (
    <motion.form animate={shake} onSubmit={submit} className="flex gap-2 px-3.5 pt-1 pb-3.5 pl-[3.75rem]">
      <Input ref={input} autoFocus type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-8" aria-label="Password" />
      <Button type="submit" size="icon-sm" disabled={busy} aria-label="Sign in">
        {busy ? <Spinner /> : <ArrowRight />}
      </Button>
    </motion.form>
  )
}
