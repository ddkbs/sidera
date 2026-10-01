import { AskAI, Moon, Sun } from '@/components/icons'
import { NotificationsButton, ProfileMenuButton } from '@/features/profile/ProfileMenu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { t } from '@/lib/i18n'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { updateSettings } from '@/store/settings'
import { setChatOpen } from '@/store/ui'

/** Compact icon actions (assistant, theme, notifications, account menu) — shown in the tab bar while the sidebar is hidden. */
export function AppActions({ className }: { className?: string }) {
  const dispatch = useAppDispatch()
  const { theme, chatOpen } = useAppSelector((s) => s.ui)
  const chatKey = formatBinding(useBinding('chat.toggle'))
  const btn = 'no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground'
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button data-tour="ask-ai" className={cn(btn, chatOpen && 'bg-accent text-foreground')} onClick={() => dispatch(setChatOpen(!chatOpen))} aria-label={t('sidebar.askAi')}>
            <AskAI className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('sidebar.askAi')} {chatKey}</TooltipContent>
      </Tooltip>
      <button className={btn} onClick={() => dispatch(updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }))} aria-label={t('appActions.toggleTheme')}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <NotificationsButton className="hover:bg-accent data-[state=open]:bg-accent" />
      <ProfileMenuButton />
    </div>
  )
}
