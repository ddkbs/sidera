import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ThemePref } from '@shared/settings'
import { Bell, Check, Compass, Ellipsis, Keyboard, LogOut, Palette, Pencil, Settings, Upload, UserPlus, Users } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { t } from '@/lib/i18n'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetActiveProfileQuery, useGetMcpInfoQuery, useListProfilesQuery, useSetActiveProfileMutation } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { openProfileDialog, openSettings, setShortcutsOpen } from '@/store/ui'
import { openSaveGuestDialog, signOut, switchToAccount, useAuthSession, useOtherAccounts } from '@/features/auth/AccountDialogs'
import { ProfileAvatar } from './ProfileAvatar'
import { onboarding } from '@/features/onboarding/controller'

const mcpPort = (url: string | null | undefined, fallback: number): number => {
  try {
    return url ? Number(new URL(url).port) || fallback : fallback
  } catch {
    return fallback
  }
}

/** Items of the account menu (profile header, switcher, theme, settings, MCP status, shortcuts). */
export function ProfileMenuContent({ side = 'top', align = 'start' }: { side?: 'top' | 'bottom'; align?: 'start' | 'end' }) {
  const dispatch = useAppDispatch()
  const { data: active } = useGetActiveProfileQuery()
  const { data: profiles = [] } = useListProfilesQuery()
  const { data: mcp } = useGetMcpInfoQuery()
  const [setActive] = useSetActiveProfileMutation()
  const themePref = useAppSelector((s) => s.settings.theme)
  const configuredPort = useAppSelector((s) => s.settings.mcp.port)
  const settingsKey = formatBinding(useBinding('settings.open'))
  const shortcutsKey = formatBinding(useBinding('shortcuts.open'))
  const session = useAuthSession()
  const otherAccounts = useOtherAccounts(session?.kind === 'account')

  const switchTo = async (id: string) => {
    if (id === active?.id) return
    const res = await setActive(id)
    if ('error' in res) toast.error(t('profile.switchFailed'))
    else toast.success(t('profile.switched', { name: res.data.name }))
  }

  return (
    <DropdownMenuContent side={side} align={align} sideOffset={6} className="w-64">
      {active && (
        <div className="flex items-center gap-2.5 px-2 py-2">
          <ProfileAvatar profile={active} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{active.name}</span>
              {session?.kind === 'guest' && <GuestBadge />}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {session?.kind === 'guest' ? t('profile.tempWorkspace') : (active.email ?? (session?.kind === 'account' ? t('profile.localAccount') : t('profile.localProfile')))}
            </div>
          </div>
        </div>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('profile.switch')}</DropdownMenuLabel>
      {profiles.map((p) => (
        <DropdownMenuItem key={p.id} onSelect={() => void switchTo(p.id)}>
          <ProfileAvatar profile={p} size="xs" />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.id === active?.id && <Check className="size-4 text-foreground" />}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onSelect={() => dispatch(openProfileDialog({ id: null }))}>
        <UserPlus />
        {t('profile.newEllipsis')}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!active} onSelect={() => active && dispatch(openProfileDialog({ id: active.id }))}>
        <Pencil />
        {t('profile.editEllipsis')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2 [&_svg:not([class*='text-'])]:text-muted-foreground">
          <Palette className="size-4" />
          {t('settings.general.theme')}
          <span className="ml-auto text-xs text-muted-foreground">{t(themePref === 'light' ? 'settings.general.themeLight' : themePref === 'dark' ? 'settings.general.themeDark' : 'settings.general.themeSystem')}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={themePref} onValueChange={(v) => dispatch(updateSettings({ theme: v as ThemePref }))}>
            <DropdownMenuRadioItem value="light">{t('settings.general.themeLight')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">{t('settings.general.themeDark')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">{t('settings.general.themeSystem')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onSelect={() => dispatch(openSettings(undefined))}>
        <Settings />
        {t('settings.title')}
        <DropdownMenuShortcut>{settingsKey}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => dispatch(setShortcutsOpen(true))}>
        <Keyboard />
        {t('cmd.shortcuts.open')}
        <DropdownMenuShortcut>{shortcutsKey}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onboarding.startTour()}>
        <Compass />
        {t('settings.general.takeTour')}
      </DropdownMenuItem>
      {session?.kind === 'account' && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 [&_svg:not([class*='text-'])]:text-muted-foreground">
              <Users className="size-4" />
              {t('account.switch')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {otherAccounts.map((a) => (
                <DropdownMenuItem key={a.id} onSelect={() => void switchToAccount(a)}>
                  <ProfileAvatar profile={{ name: a.name, color: a.color, avatarUrl: a.avatarDataUrl }} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                </DropdownMenuItem>
              ))}
              {otherAccounts.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => void window.auth.signOut()}>
                <UserPlus />
                {t('account.manage')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={signOut}>
            <LogOut />
            {t('account.signOut')}
          </DropdownMenuItem>
        </>
      )}
      {session?.kind === 'guest' && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openSaveGuestDialog}>
            <Upload />
            {t('account.saveGuest')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut}>
            <LogOut />
            {t('account.endGuest')}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => dispatch(openSettings('mcp'))} className="text-xs text-muted-foreground">
        <span className="grid size-4 place-items-center">
          <span className={cn('size-2 rounded-full', mcp?.running ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        </span>
        {mcp?.running ? t('profile.mcpRunning', { port: mcpPort(mcp.url, configuredPort) }) : t('profile.mcpOffline')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function GuestBadge() {
  return (
    <Badge variant="outline" className="h-4 shrink-0 rounded px-1 text-[10px] font-medium tracking-wide text-amber-600 uppercase dark:text-amber-400">
      {t('account.guest')}
    </Badge>
  )
}

/** Shown above the account row while in a guest session: data is temporary, offer to keep it. */
function GuestBanner() {
  return (
    <div className="mx-2 mb-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5">
      <div className="text-xs font-medium">{t('account.guestBanner')}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t('account.guestBannerHint')}</div>
      <button onClick={openSaveGuestDialog} className="mt-1.5 text-[11px] font-medium text-foreground underline-offset-2 hover:underline">
        {t('account.saveGuestArrow')}
      </button>
    </div>
  )
}

/** Small notification bell; there is no notification source yet, so it shows an empty state. */
export function NotificationsButton({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label={t('profile.notifications')} title={t('profile.notifications')} className={cn('no-drag grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-foreground', className)}>
          <Bell className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">{t('profile.notifications')}</div>
        <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
          <Bell className="size-5 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">{t('profile.noNotifications')}</div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Vercel-style account row for the sidebar footer: avatar + name, "…" menu and bell. */
export function ProfileFooter({ status }: { status?: ReactNode }) {
  const { data: active } = useGetActiveProfileQuery()
  const session = useAuthSession()
  const guest = session?.kind === 'guest'
  const [open, setOpen] = useState(false)
  const hover = 'transition hover:bg-sidebar-accent hover:text-foreground'
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {guest && <GuestBanner />}
      <div data-tour="account" className="flex items-center gap-0.5 border-t border-sidebar-border p-2">
        <DropdownMenuTrigger asChild>
          <button
            data-testid="profile-row"
            className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left', hover, open && 'bg-sidebar-accent')}
          >
            <ProfileAvatar profile={active} size="sm" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{active?.name ?? ' '}</span>
                {guest && <GuestBadge />}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{status ?? active?.email ?? (guest ? t('profile.tempWorkspace') : t('profile.local'))}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <button
          data-tour="settings-gear"
          aria-label={t('profile.accountMenu')}
          title={t('profile.accountMenu')}
          onClick={() => setOpen(true)}
          className={cn('grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground', hover, open && 'bg-sidebar-accent text-foreground')}
        >
          <Ellipsis className="size-4" />
        </button>
        <NotificationsButton />
      </div>
      <ProfileMenuContent />
    </DropdownMenu>
  )
}

/** Compact avatar button for the tab bar (sidebar hidden) that opens the same account menu. */
export function ProfileMenuButton({ className }: { className?: string }) {
  const { data: active } = useGetActiveProfileQuery()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={t('profile.accountMenu')} title={active?.name} className={cn('no-drag grid size-7 place-items-center rounded-md transition hover:bg-accent', className)}>
          <ProfileAvatar profile={active} size="xs" />
        </button>
      </DropdownMenuTrigger>
      <ProfileMenuContent side="bottom" align="end" />
    </DropdownMenu>
  )
}
