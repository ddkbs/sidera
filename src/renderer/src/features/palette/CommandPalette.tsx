import { BookOpen, CalendarDays, Download, FileText, Home, LayoutDashboard, Moon, PanelLeft, Plus, Sparkles, Upload } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { useEffect, useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
import { useAppDispatch, useAppSelector } from '@/store'
import { useCreateCardMutation, useCreateWhiteboardMutation, useGetWhiteboardQuery, useSearchQuery } from '@/store/api'
import { navigate, openCard, openSettings, queueChatMessage, setPaletteOpen, toggleSidebar } from '@/store/ui'

export function CommandPalette() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.paletteOpen)
  const theme = useAppSelector((s) => s.ui.theme)
  const view = useAppSelector((s) => s.ui.view)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const { data: hits = [] } = useSearchQuery(debounced, { skip: !open })
  const [createCard] = useCreateCardMutation()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const { data: currentBoard } = useGetWhiteboardQuery(view.type === 'whiteboard' ? view.id : '', { skip: view.type !== 'whiteboard' })

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 80)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const close = () => dispatch(setPaletteOpen(false))
  const run = (fn: () => unknown) => () => {
    close()
    void fn()
  }
  const text = q.trim()

  return (
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
                {h.kind === 'card' ? <FileText className="text-muted-foreground" /> : <LayoutDashboard className="text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="truncate">{h.title || 'Untitled'}</div>
                  {h.kind === 'card' && h.snippet && <div className="truncate text-xs text-muted-foreground">{h.snippet}</div>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
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
              const r = await createWhiteboard({ name: text || 'Untitled whiteboard' })
              if ('data' in r && r.data) dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
            })}
          >
            <LayoutDashboard /> {text ? `New whiteboard “${text}”` : 'New whiteboard'}
          </CommandItem>
          {!text && (
            <>
              <CommandItem value="home" onSelect={run(() => dispatch(navigate({ type: 'home' })))}>
                <Home /> Go to Home
              </CommandItem>
              <CommandItem value="journal" onSelect={run(() => dispatch(navigate({ type: 'journal' })))}>
                <CalendarDays /> Open today's journal
              </CommandItem>
              <CommandItem value="library" onSelect={run(() => dispatch(navigate({ type: 'library', tagId: null, mode: 'table' })))}>
                <BookOpen /> Open card library
              </CommandItem>
              <CommandItem value="sidebar" onSelect={run(() => dispatch(toggleSidebar()))}>
                <PanelLeft /> Toggle sidebar <CommandShortcut>⌘\</CommandShortcut>
              </CommandItem>
              <CommandItem value="theme" onSelect={run(() => dispatch(updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })))}>
                <Moon /> Toggle dark mode
              </CommandItem>
              <CommandItem
                value="export"
                onSelect={run(async () => {
                  const r = await window.api.exportMarkdown()
                  if (r) toast.success(`Exported ${r.count} files`, { description: r.dir })
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
              <CommandItem value="mcp" onSelect={run(() => dispatch(openSettings('mcp')))}>
                <Sparkles /> Connect AI via MCP
              </CommandItem>
              <CommandItem value="restart-tour" onSelect={run(() => dispatch(updateSettings({ tourCompleted: false })))}>
                <Sparkles /> Restart onboarding tour
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
                    dispatch(queueChatMessage(`Organize the whiteboard "${currentBoard.whiteboard.name}" (id ${currentBoard.whiteboard.id}) into meaningful sections.`))
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
  )
}
