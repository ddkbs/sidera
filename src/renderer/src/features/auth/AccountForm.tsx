import { useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MIN_PASSWORD_LENGTH, type AuthResult, type NewAccountInput } from '@shared/auth'
import { TAG_COLORS } from '@shared/util'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { color, colorName } from '@/lib/colors'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { authError } from '@/lib/i18n/authErrors'

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent', className)} />
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('account.color')}>
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={colorName(c)}
          onClick={() => onChange(c)}
          className={cn(
            'grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-background transition outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === c && 'ring-2 ring-foreground/70'
          )}
        >
          <span className="size-5 rounded-full" style={{ background: color(c).fg }} />
        </button>
      ))}
    </div>
  )
}

export const FormError = ({ children }: { children: ReactNode }) => (
  <AnimatePresence initial={false}>
    {children && (
      <motion.p
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden text-sm text-destructive"
        role="alert"
      >
        {children}
      </motion.p>
    )}
  </AnimatePresence>
)

/**
 * Name, color, optional password and "keep me signed in" — used to create an account, to name the migrated
 * first account ("Welcome back") and to save a guest workspace as an account.
 */
export function AccountForm({
  initialName = '',
  initialColor = 'blue',
  submitLabel,
  showStaySignedIn = true,
  onSubmit,
  footer
}: {
  initialName?: string
  initialColor?: string
  submitLabel: string
  showStaySignedIn?: boolean
  onSubmit: (input: NewAccountInput) => Promise<AuthResult>
  footer?: ReactNode
}) {
  const [name, setName] = useState(initialName)
  const [tone, setTone] = useState(initialColor)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stay, setStay] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError(t('account.nameRequired'))
    if (usePassword) {
      if (password.length < MIN_PASSWORD_LENGTH) return setError(t('account.passwordTooShort', { n: MIN_PASSWORD_LENGTH }))
      if (password !== confirm) return setError(t('account.passwordMismatch'))
    }
    setError(null)
    setBusy(true)
    const res = await onSubmit({ name, color: tone, password: usePassword ? password : null, staySignedIn: stay })
    // on success the window reloads into the new session — stay busy until then
    if (!res.ok) {
      setBusy(false)
      setError(authError(res.error))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3.5">
        <ProfileAvatar profile={{ name: name || '?', color: tone, avatarUrl: null }} size="lg" className="shadow-sm" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="account-name" className="text-xs text-muted-foreground">
            {t('account.name')}
          </Label>
          <Input id="account-name" autoFocus value={name} maxLength={60} placeholder={t('account.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">{t('account.color')}</div>
        <ColorPicker value={tone} onChange={setTone} />
      </div>
      <div className="rounded-lg border bg-card/60">
        <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3">
          <span>
            <span className="block text-sm font-medium">{t('account.requirePassword')}</span>
            <span className="block text-xs text-muted-foreground">{t('account.requirePasswordHint')}</span>
          </span>
          <Switch checked={usePassword} onCheckedChange={setUsePassword} aria-label={t('account.requirePassword')} />
        </label>
        <AnimatePresence initial={false}>
          {usePassword && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="grid gap-2 border-t px-3.5 py-3">
                <Input type="password" autoComplete="new-password" placeholder={t('account.password')} value={password} onChange={(e) => setPassword(e.target.value)} />
                <Input type="password" autoComplete="new-password" placeholder={t('account.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {showStaySignedIn && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={stay} onCheckedChange={(v) => setStay(v === true)} />
          {t('account.staySignedIn')}
        </label>
      )}
      <FormError>{error}</FormError>
      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy && <Spinner />}
        {submitLabel}
      </Button>
      {footer}
    </form>
  )
}
