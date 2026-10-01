import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fileUrl } from '@shared/fileProtocol'
import { TAG_COLORS } from '@shared/util'
import { Check, Trash2, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { color } from '@/lib/colors'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  useCreateProfileMutation,
  useDeleteProfileMutation,
  useGetActiveProfileQuery,
  useImportFileDataMutation,
  useListProfilesQuery,
  useSetActiveProfileMutation,
  useUpdateProfileMutation
} from '@/store/api'
import { openProfileDialog } from '@/store/ui'
import { ProfileAvatar } from './ProfileAvatar'

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** Create / edit a profile: name, email, color and avatar image. Mounted once in AppShell. */
export function ProfileDialog() {
  const dispatch = useAppDispatch()
  const target = useAppSelector((s) => s.ui.profileDialog)
  const close = () => dispatch(openProfileDialog(null))
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{target && <ProfileForm key={target.id ?? 'new'} id={target.id} onDone={close} />}</DialogContent>
    </Dialog>
  )
}

function ProfileForm({ id, onDone }: { id: string | null; onDone: () => void }) {
  const { data: profiles = [] } = useListProfilesQuery()
  const { data: active } = useGetActiveProfileQuery()
  const existing = id ? profiles.find((p) => p.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [tone, setTone] = useState(existing?.color ?? TAG_COLORS[(profiles.length + 3) % TAG_COLORS.length])
  const [avatarFileId, setAvatarFileId] = useState<string | null>(existing?.avatarFileId ?? null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [importFileData] = useImportFileDataMutation()
  const [createProfile] = useCreateProfileMutation()
  const [updateProfile] = useUpdateProfileMutation()
  const [deleteProfile] = useDeleteProfileMutation()
  const [setActive] = useSetActiveProfileMutation()

  // profiles load async: fill the form once the edited profile arrives
  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setEmail(existing.email ?? '')
    setTone(existing.color)
    setAvatarFileId(existing.avatarFileId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id])

  const preview = { name: name || '?', color: tone, avatarUrl: avatarFileId ? fileUrl(avatarFileId) : null }
  const canDelete = !!existing && existing.id !== active?.id && profiles.length > 1

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return void toast.error(t('profile.chooseImage'))
    try {
      const res = await importFileData({ name: file.name, mime: file.type, dataBase64: await readBase64(file) })
      if ('error' in res) throw new Error(String(res.error))
      setAvatarFileId(res.data.id)
    } catch (e) {
      toast.error(t('profile.uploadFailed', { error: e instanceof Error ? e.message : String(e) }))
    }
  }

  const save = async () => {
    if (!name.trim()) return void toast.error(t('profile.nameRequired'))
    setBusy(true)
    const input = { name, email: email.trim() || null, color: tone, avatarFileId }
    const res = existing ? await updateProfile({ id: existing.id, ...input }) : await createProfile(input)
    setBusy(false)
    if ('error' in res) return void toast.error(String(res.error).replace(/^Error: /, ''))
    if (!existing) {
      await setActive(res.data.id)
      toast.success(t('profile.created', { name: res.data.name }))
    }
    onDone()
  }

  const remove = async () => {
    if (!existing) return
    const res = await deleteProfile(existing.id)
    if ('error' in res) return void toast.error(String(res.error).replace(/^Error: /, ''))
    toast.success(t('profile.deleted', { name: existing.name }))
    onDone()
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{existing ? t('settings.profile.edit') : t('settings.profile.new')}</DialogTitle>
        <DialogDescription>{t('profile.dialogHint')}</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4">
        <ProfileAvatar profile={preview} size="lg" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload />
            {avatarFileId ? t('profile.changeImage') : t('profile.uploadImage')}
          </Button>
          {avatarFileId && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarFileId(null)}>
              {t('common.remove')}
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="profile-name">{t('account.name')}</Label>
        <Input id="profile-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('account.namePlaceholder')} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="profile-email">
          {t('profile.email')} <span className="font-normal text-muted-foreground">{t('profile.optional')}</span>
        </Label>
        <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('profile.emailPlaceholder')} />
      </div>
      <div className="grid gap-2">
        <Label>{t('account.color')}</Label>
        <div className="flex flex-wrap gap-2">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              title={c}
              onClick={() => setTone(c)}
              className={cn('grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-background transition', tone === c && 'ring-2 ring-ring')}
              style={{ background: color(c).fg }}
            >
              {tone === c && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        {canDelete ? (
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()}>
            <Trash2 />
            {t('profile.delete')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {existing ? t('common.save') : t('profile.create')}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
