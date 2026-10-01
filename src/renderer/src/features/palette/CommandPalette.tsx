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
import { api } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { useEffect, useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
import { useAppDispatch, useAppSelector } from '@/store'
import { useClipUrlMutation, useCreateCardMutation, useCreateWhiteboardMutation, useGetWhiteboardQuery, useListTagsQuery, useSearchQuery } from '@/store/api'
import { onboarding } from '@/features/onboarding/controller'
import { SIDERA_DRAW_OPEN_EVENT } from '@/features/draw/DrawOnIpadDialog'
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
    const t = setTimeout(() => setDebounced(q), 80)
    return () => clearTimeout(t)
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
  const tagHits = text ? tags.filter((t) => t.name.toLowerCase().includes(text.toLowerCase())) : []

  return (
    <>
      <CommandDialog open={open} onOpenChange={(o) => dispatch(setPaletteOpen(o))} shouldFilter={false} className="sm:max-w-xl">
        <CommandInput placeholder="Search cards, whiteboards, or run a command…" value={q} onValueChange={setQ} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No results</CommandEmpty>
          {hits.length > 0 && (
            <CommandGroup heading={text ? 'Results' : 'Recent'}>
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
                    <div className="truncate">{h.title || 'Untitled'}</div>
                    {h.kind === 'card' && h.snippet && <div className="truncate text-xs text-muted-foreground">{h.snippet}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {tagHits.length > 0 && (
            <CommandGroup heading="Tags">
              {tagHits.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`tag-${t.id}`}
                  onSelect={run(() => dispatch(navigate({ type: 'library', tagId: t.id, mode: view.type === 'library' ? view.mode : 'table' })))}
                >
                  <Hash style={{ color: color(t.color).fg }} /> {t.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {view.type === 'whiteboard' && (!text || /text|block|note|write/i.test(text)) && (
              <CommandItem value="new-text-block" onSelect={run(() => canvasAction('text'))}>
                <Type /> New text box <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
            )}
            {view.type === 'whiteboard' && (!text || /table|grid|data/i.test(text)) && (
              <CommandItem value="new-table" onSelect={run(() => canvasAction('table'))}>
                <Table2 /> New table
              </CommandItem>
            )}
            <CommandItem
              value="new-card"
              onSelect={run(async () => {
                const r = await createCard({ title: text })
                if ('data' in r && r.data) dispatch(openCard(r.data.id))
              })}
            >
              <Plus /> {text ? `New card “${text}”` : 'New card'}
            </CommandItem>
            <CommandItem
              value="new-whiteboard"
              onSelect={run(async () => {
                const r = await createWhiteboard({
                  name: text || 'Untitled whiteboard'
                })
                if ('data' in r && r.data) dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
              })}
            >
              <LayoutDashboard /> {text ? `New whiteboard “${text}”` : 'New whiteboard'}
            </CommandItem>
            {view.type === 'whiteboard' && (!text || /ipad|draw|pencil|sketch|tablet/i.test(text)) && (
              <CommandItem value="draw-on-ipad" onSelect={run(() => window.dispatchEvent(new Event(SIDERA_DRAW_OPEN_EVENT)))}>
                <Tablet /> Draw on iPad…
              </CommandItem>
            )}
            {!text && (
              <>
                <CommandItem value="home" onSelect={run(() => dispatch(navigate({ type: 'home' })))}>
                  <Home /> Go to Home
                </CommandItem>
                <CommandItem value="tasks" onSelect={run(() => dispatch(navigate({ type: 'tasks' })))}>
                  <ListChecks /> Open tasks
                </CommandItem>
                <CommandItem value="library" onSelect={run(() => dispatch(navigate({ type: 'library', tagId: null, mode: 'table' })))}>
                  <BookOpen /> Open card library
                </CommandItem>
                <CommandItem value="sidebar" onSelect={run(() => dispatch(toggleSidebar()))}>
                  <PanelLeft /> Toggle sidebar <CommandShortcut>⌘\</CommandShortcut>
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
                  <Moon /> Toggle dark mode
                </CommandItem>
                <CommandItem
                  value="export"
                  onSelect={run(async () => {
                    const r = await window.api.exportMarkdown()
                    if (r)
                      toast.success(`Exported ${r.count} files`, {
                        description: r.dir
                      })
                  })}
                >
                  <Download /> Export all cards as Markdown
                </CommandItem>
                <CommandItem
                  value="import"
                  onSelect={run(async () => {
                    const r = await window.api.importMarkdown()
                    if (r.count) {
                      dispatch(api.util.invalidateTags(['CardList', 'Tag']))
                      toast.success(`Imported ${r.count} cards`)
                    }
                  })}
                >
                  <Upload /> Import Markdown files
                </CommandItem>
                <CommandItem
                  value="clip"
                  onSelect={run(() => {
                    setClipUrlText('')
                    setClipOpen(true)
                  })}
                >
                  <Bookmark /> Clip web page…
                </CommandItem>
                <CommandItem value="mcp" onSelect={run(() => dispatch(openSettings('mcp')))}>
                  <Sparkles /> Connect AI via MCP
                </CommandItem>
                <CommandItem value="take-the-tour" onSelect={run(() => onboarding.startTour())}>
                  <Compass /> Take the tour again
                </CommandItem>
                <CommandItem value="welcome-screens" onSelect={run(() => onboarding.showWelcome())}>
                  <Sparkles /> Show welcome screens
                </CommandItem>
                {view.type === 'whiteboard' && currentBoard && (
                  <CommandItem
                    value="organize-board"
                    onSelect={run(async () => {
                      const hasKey = await window.chat.hasKey()
                      if (!hasKey) {
                        toast('Add an Anthropic API key to organize with the built-in assistant', {
                          description: 'Or ask Claude Desktop/Code to do it via the "organize-board" MCP prompt.'
                        })
                        return
                      }
                      dispatch(
                        queueChatMessage(
                          `Organize the whiteboard "${currentBoard.whiteboard.name}" (id ${currentBoard.whiteboard.id}) into meaningful sections.`
                        )
                      )
                    })}
                  >
                    <Sparkles /> Organize this whiteboard with AI
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
            <DialogTitle>Clip web page</DialogTitle>
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
                toast.success(`Saved “${res.data.title || 'Untitled'}”`, {
                  action: {
                    label: 'Open',
                    onClick: () => dispatch(openCard(res.data!.id))
                  }
                })
              } else {
                toast.error('Could not fetch that page')
              }
            }}
          >
            <Input autoFocus placeholder="https://example.com/article" value={clipUrlText} onChange={(e) => setClipUrlText(e.target.value)} />
            <DialogFooter className="mt-4">
              <Button type="submit">Clip</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
