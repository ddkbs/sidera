import {
  Bookmark,
  BookOpen,
  Download,
  FileText,
  Hash,
  Home,
  LayoutDashboard,
  ListChecks,
  Moon,
  PanelLeft,
  Plus,
  Sparkles,
  Table2,
  Tablet,
  TextBlock,
  Type,
  Compass,
  Upload
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { color } from '@/lib/colors'
import { t } from '@/lib/i18n'
import { api } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { useEffect, useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
import { useAppDispatch, useAppSelector } from '@/store'
import { useClipUrlMutation, useCreateCardMutation, useCreateWhiteboardMutation, useGetWhiteboardQuery, useListTagsQuery, useSearchQuery } from '@/store/api'
import { onboarding } from '@/features/onboarding/controller'
import { IPAD_OPEN_EVENT } from '@/features/ipad/IpadControl'
import { CANVAS_ACTION_EVENT, type CanvasAction } from '@/features/canvas/actions'
import { navigate, openCard, openSettings, queueChatMessage, setPaletteOpen, toggleSidebar } from '@/store/ui'

export function CommandPalette() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.paletteOpen)
  const theme = useAppSelector((s) => s.ui.theme)
  const view = useAppSelector((s) => s.ui.view)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const { data: hits = [] } = useSearchQuery(debounced, { skip: !open })
  const { data: tags = [] } = useListTagsQuery(undefined, { skip: !open })
  const [createCard] = useCreateCardMutation()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [clipUrl] = useClipUrlMutation()
  const [clipOpen, setClipOpen] = useState(false)
  const [clipUrlText, setClipUrlText] = useState('')
  const { data: currentBoard } = useGetWhiteboardQuery(view.type === 'whiteboard' ? view.id : '', { skip: view.type !== 'whiteboard' })

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 80)
    return () => clearTimeout(timer)
  }, [q])
  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const close = () => dispatch(setPaletteOpen(false))
  const canvasAction = (a: CanvasAction) => window.dispatchEvent(new CustomEvent(CANVAS_ACTION_EVENT, { detail: a }))
  const run = (fn: () => unknown) => () => {
    close()
    void fn()
  }
  const text = q.trim()
  const tagHits = text ? tags.filter((tag) => tag.name.toLowerCase().includes(text.toLowerCase())) : []

  return (
    <>
      <CommandDialog open={open} onOpenChange={(o) => dispatch(setPaletteOpen(o))} shouldFilter={false} className="sm:max-w-xl">
        <CommandInput placeholder={t('palette.placeholder')} value={q} onValueChange={setQ} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>{t('palette.noResults')}</CommandEmpty>
          {hits.length > 0 && (
            <CommandGroup heading={text ? t('palette.results') : t('palette.recent')}>
              {hits.map((h) => (
                <CommandItem
                  key={h.kind + h.id}
                  value={h.kind + h.id}
                  onSelect={run(() => (h.kind === 'card' ? dispatch(openCard(h.id)) : dispatch(navigate({ type: 'whiteboard', id: h.id }))))}
                >
                  {h.kind === 'whiteboard' ? (
                    <LayoutDashboard className="text-muted-foreground" />
                  ) : h.cardKind === 'block' ? (
                    <TextBlock className="text-muted-foreground" />
                  ) : (
                    <FileText className="text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate">{h.title || t('common.untitled')}</div>
                    {h.kind === 'card' && h.snippet && <div className="truncate text-xs text-muted-foreground">{h.snippet}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {tagHits.length > 0 && (
            <CommandGroup heading={t('palette.tags')}>
              {tagHits.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={`tag-${tag.id}`}
                  onSelect={run(() => dispatch(navigate({ type: 'library', tagId: tag.id, mode: view.type === 'library' ? view.mode : 'table' })))}
                >
                  <Hash style={{ color: color(tag.color).fg }} /> {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading={t('palette.actions')}>
            {view.type === 'whiteboard' && (!text || /text|block|note|write|notiz|schreib/i.test(text)) && (
              <CommandItem value="new-text-block" onSelect={run(() => canvasAction('text'))}>
                <Type /> {t('cmd.canvas.newTextBlock')} <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
            )}
            {view.type === 'whiteboard' && (!text || /table|grid|data|tabelle|daten/i.test(text)) && (
              <CommandItem value="new-table" onSelect={run(() => canvasAction('table'))}>
                <Table2 /> {t('palette.newTable')}
              </CommandItem>
            )}
            <CommandItem
              value="new-card"
              onSelect={run(async () => {
                const r = await createCard({ title: text })
                if ('data' in r && r.data) dispatch(openCard(r.data.id))
              })}
            >
              <Plus /> {text ? t('palette.newCardNamed', { name: text }) : t('palette.newCard')}
            </CommandItem>
            <CommandItem
              value="new-whiteboard"
              onSelect={run(async () => {
                const r = await createWhiteboard({
                  name: text || t('board.untitled')
                })
                if ('data' in r && r.data) dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
              })}
            >
              <LayoutDashboard /> {text ? t('palette.newBoardNamed', { name: text }) : t('board.new')}
            </CommandItem>
            {/ipad|pencil|tablet/i.test(text) && (
              <CommandItem value="ipad" onSelect={run(() => window.dispatchEvent(new Event(IPAD_OPEN_EVENT)))}>
                <Tablet /> {t('cmd.canvas.ipad')}
              </CommandItem>
            )}
            {!text && (
              <>
                <CommandItem value="home" onSelect={run(() => dispatch(navigate({ type: 'home' })))}>
                  <Home /> {t('palette.goHome')}
                </CommandItem>
                <CommandItem value="tasks" onSelect={run(() => dispatch(navigate({ type: 'tasks' })))}>
                  <ListChecks /> {t('cmd.nav.tasks')}
                </CommandItem>
                <CommandItem value="library" onSelect={run(() => dispatch(navigate({ type: 'library', tagId: null, mode: 'table' })))}>
                  <BookOpen /> {t('palette.openLibrary')}
                </CommandItem>
                <CommandItem value="sidebar" onSelect={run(() => dispatch(toggleSidebar()))}>
                  <PanelLeft /> {t('cmd.sidebar.toggle')} <CommandShortcut>⌘\</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="theme"
                  onSelect={run(() =>
                    dispatch(
                      updateSettings({
                        theme: theme === 'dark' ? 'light' : 'dark'
                      })
                    )
                  )}
                >
                  <Moon /> {t('palette.toggleDark')}
                </CommandItem>
                <CommandItem
                  value="export"
                  onSelect={run(async () => {
                    const r = await window.api.exportMarkdown()
                    if (r)
                      toast.success(t('settings.data.exported', { count: r.count }), {
                        description: r.dir
                      })
                  })}
                >
                  <Download /> {t('palette.exportAll')}
                </CommandItem>
                <CommandItem
                  value="import"
                  onSelect={run(async () => {
                    const r = await window.api.importMarkdown()
                    if (r.count) {
                      dispatch(api.util.invalidateTags(['CardList', 'Tag']))
                      toast.success(t('settings.data.imported', { count: r.count }))
                    }
                  })}
                >
                  <Upload /> {t('palette.importMd')}
                </CommandItem>
                <CommandItem
                  value="clip"
                  onSelect={run(() => {
                    setClipUrlText('')
                    setClipOpen(true)
                  })}
                >
                  <Bookmark /> {t('palette.clipEllipsis')}
                </CommandItem>
                <CommandItem value="mcp" onSelect={run(() => dispatch(openSettings('mcp')))}>
                  <Sparkles /> {t('palette.connectMcp')}
                </CommandItem>
                <CommandItem value="take-the-tour" onSelect={run(() => onboarding.startTour())}>
                  <Compass /> {t('palette.tourAgain')}
                </CommandItem>
                <CommandItem value="welcome-screens" onSelect={run(() => onboarding.showWelcome())}>
                  <Sparkles /> {t('palette.showWelcome')}
                </CommandItem>
                {view.type === 'whiteboard' && currentBoard && (
                  <CommandItem
                    value="organize-board"
                    onSelect={run(async () => {
                      const hasKey = await window.chat.hasKey()
                      if (!hasKey) {
                        toast(t('board.organizeNoKey'), { description: t('board.organizeNoKeyHint') })
                        return
                      }
                      dispatch(queueChatMessage(t('board.organizePrompt', { name: currentBoard.whiteboard.name, id: currentBoard.whiteboard.id })))
                    })}
                  >
                    <Sparkles /> {t('palette.organizeThis')}
                  </CommandItem>
                )}
              </>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <Dialog open={clipOpen} onOpenChange={setClipOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('palette.clipTitle')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const raw = clipUrlText.trim()
              if (!raw) return
              const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
              setClipOpen(false)
              const res = await clipUrl({ url })
              if ('data' in res && res.data) {
                toast.success(t('palette.clipSaved', { title: res.data.title || t('common.untitled') }), {
                  action: {
                    label: t('common.open'),
                    onClick: () => dispatch(openCard(res.data!.id))
                  }
                })
              } else {
                toast.error(t('palette.clipFailed'))
              }
            }}
          >
            <Input autoFocus placeholder="https://example.com/article" value={clipUrlText} onChange={(e) => setClipUrlText(e.target.value)} />
            <DialogFooter className="mt-4">
              <Button type="submit">{t('palette.clip')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
