import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { DataInfo, McpConnections } from '@shared/api'
import type { FontPref, ThemePref } from '@shared/settings'
import { AskAI, Command, Download, File, Home, KeyRound, Palette, Pencil, Server, Settings, Upload } from '@/components/icons'
import { Orb } from '@/components/Orb'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { FONT_STACKS } from '@/App'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { api, useGetMcpInfoQuery } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { setSettingsOpen, setSettingsSection } from '@/store/ui'
import { ShortcutsSettings } from './ShortcutsSettings'

const SECTIONS = [
  { id: 'general', label: 'General', Icon: Settings },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'editor', label: 'Editor & canvas', Icon: Pencil },
  { id: 'shortcuts', label: 'Shortcuts', Icon: Command },
  { id: 'mcp', label: 'MCP & Claude', Icon: Server },
  { id: 'ai', label: 'AI assistant', Icon: AskAI },
  { id: 'data', label: 'Data & storage', Icon: File },
  { id: 'about', label: 'About', Icon: Home }
] as const

export function SettingsDialog() {
  const dispatch = useAppDispatch()
  const { settingsOpen, settingsSection } = useAppSelector((s) => s.ui)
  const current = SECTIONS.find((s) => s.id === settingsSection) ?? SECTIONS[0]

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => dispatch(setSettingsOpen(o))}>
      <DialogContent className="flex h-[min(680px,86vh)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <aside className="flex w-56 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2">
          <DialogTitle className="px-2 pt-2 pb-3 text-sm">Settings</DialogTitle>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => dispatch(setSettingsSection(id))}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-sm transition outline-none hover:bg-sidebar-accent focus-visible:bg-sidebar-accent',
                current.id === id && 'bg-sidebar-accent font-medium'
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </button>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
          <h2 className="mb-6 text-lg font-semibold">{current.label}</h2>
          {current.id === 'general' && <General />}
          {current.id === 'appearance' && <Appearance />}
          {current.id === 'editor' && <EditorCanvas />}
          {current.id === 'shortcuts' && <ShortcutsSettings />}
          {current.id === 'mcp' && <McpSettings />}
          {current.id === 'ai' && <AiSettings />}
          {current.id === 'data' && <DataSettings />}
          {current.id === 'about' && <About />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Row({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-4 first:pt-0 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-7 rounded-md px-3 text-sm transition', value === o.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function General() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings)
  return (
    <div>
      <Row title="Theme" description="Follow macOS or pick a fixed appearance.">
        <Segmented<ThemePref>
          value={s.theme}
          onChange={(theme) => dispatch(updateSettings({ theme }))}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
        />
      </Row>
      <Row title="Restore tabs on launch" description="Reopen the tabs and views you had open last time.">
        <Switch checked={s.restoreLastView} onCheckedChange={(v) => dispatch(updateSettings({ restoreLastView: v }))} />
      </Row>
    </div>
  )
}

const FONTS: { value: FontPref; label: string; note: string }[] = [
  { value: 'jost', label: 'Jost', note: 'Geometric, Futura-inspired (bundled)' },
  { value: 'futura', label: 'Futura', note: 'macOS system font (limited weights)' },
  { value: 'geist', label: 'Geist', note: 'Neutral grotesque (bundled)' },
  { value: 'system', label: 'SF Pro', note: 'macOS system UI font' }
]

function Appearance() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings)
  return (
    <div>
      <div className="mb-2 text-sm font-medium">Font</div>
      <div className="mb-6 grid grid-cols-2 gap-2">
        {FONTS.map((f) => (
          <button
            key={f.value}
            onClick={() => dispatch(updateSettings({ font: f.value }))}
            className={cn('rounded-xl border p-3 text-left transition hover:bg-accent', s.font === f.value && 'border-foreground/40 ring-2 ring-foreground/10')}
          >
            <div className="text-2xl" style={{ fontFamily: FONT_STACKS[f.value] }}>
              Ag {f.label}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{f.note}</div>
          </button>
        ))}
      </div>
      <Row title="Text size" description={`${s.fontSize}px`}>
        <Slider className="w-48" min={13} max={18} step={1} value={[s.fontSize]} onValueChange={([v]) => dispatch(updateSettings({ fontSize: v }))} />
      </Row>
    </div>
  )
}

function EditorCanvas() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings)
  return (
    <div>
      <Row title="Spell check" description="Underline misspelled words in cards and the journal.">
        <Switch checked={s.editor.spellcheck} onCheckedChange={(v) => dispatch(updateSettings({ editor: { spellcheck: v } }))} />
      </Row>
      <Row title="Show minimap" description="Show the minimap on whiteboards by default.">
        <Switch checked={s.canvas.showMinimap} onCheckedChange={(v) => dispatch(updateSettings({ canvas: { showMinimap: v } }))} />
      </Row>
      <Row title="Snap to grid" description="Align objects to the dot grid while moving them.">
        <Switch checked={s.canvas.snapToGrid} onCheckedChange={(v) => dispatch(updateSettings({ canvas: { snapToGrid: v } }))} />
      </Row>
    </div>
  )
}

const TOOL_NAMES = [
  'search_cards', 'list_cards', 'get_card', 'create_card', 'update_card', 'clip_url', 'list_tags', 'tag_card', 'create_property', 'set_card_property',
  'list_whiteboards', 'get_whiteboard', 'create_whiteboard', 'add_card_to_whiteboard', 'add_section', 'connect_objects',
  'get_kanban', 'move_kanban_item', 'get_journal', 'append_to_journal'
]

function McpSettings() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings.mcp)
  const activity = useAppSelector((st) => st.ui.activity)
  const { data: info, refetch } = useGetMcpInfoQuery()
  const [conn, setConn] = useState<McpConnections | null>(null)
  const [busy, setBusy] = useState(false)
  const [port, setPort] = useState(String(s.port))

  const load = () => void window.app.getMcpConnections().then(setConn)
  useEffect(load, [info?.url])

  const connect = async (targets: ('desktop' | 'code')[]) => {
    setBusy(true)
    for (const t of targets) {
      const r = await window.app.connectClaude(t)
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
    }
    setBusy(false)
    load()
  }

  const applyServer = async (patch: { httpEnabled?: boolean; port?: number }) => {
    await dispatch(updateSettings({ mcp: patch }))
    dispatch(api.util.invalidateTags([]))
    refetch()
  }

  const desktopJson = conn ? JSON.stringify({ mcpServers: { canvascl: conn.stdio } }, null, 2) : ''
  const codeCmd = `claude mcp add --scope user --transport http canvascl ${info?.url ?? `http://127.0.0.1:${s.port}/mcp`}`

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <Orb online={!!info?.running} active={busy} className="mt-1 size-8 [&>span]:size-6" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Connect Claude to your knowledge base</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Adds all {TOOL_NAMES.length} CanvasCL tools to Claude Desktop and Claude Code in one step. Your data never leaves this Mac.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button disabled={busy} onClick={() => void connect(['desktop', 'code'])}>
                Connect everything
              </Button>
              <Status label="Claude Desktop" ok={conn?.desktop} onClick={() => void connect(['desktop'])} />
              <Status label="Claude Code" ok={conn?.code} missing={conn?.code === null} onClick={() => void connect(['code'])} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <Row title="Local HTTP server" description={info?.running ? <code className="font-mono text-xs">{info.url}</code> : 'Off — only stdio clients (Claude Desktop) can connect.'}>
          <Switch checked={s.httpEnabled} onCheckedChange={(v) => void applyServer({ httpEnabled: v })} />
        </Row>
        <Row title="Port" description="Used by Claude Code and other HTTP clients. Bound to 127.0.0.1 only.">
          <Input
            className="w-24 text-right"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
            onBlur={() => {
              const n = Number(port)
              if (n >= 1024 && n <= 65535 && n !== s.port) void applyServer({ port: n })
              else setPort(String(s.port))
            }}
          />
        </Row>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Manual setup</h3>
        <Snippet label="Claude Code" text={codeCmd} />
        <Snippet label="Claude Desktop — claude_desktop_config.json" text={desktopJson || 'Loading…'} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Tools</h3>
        <div className="flex flex-wrap gap-1">
          {TOOL_NAMES.map((t) => (
            <code key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {t}
            </code>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Recent agent activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tool calls yet in this session.</p>
        ) : (
          <div className="space-y-1">
            {activity.map((a, i) => (
              <div key={a.at + ':' + i} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground tabular-nums">{new Date(a.at).toLocaleTimeString()}</span>
                <code className="shrink-0 font-mono font-medium">{a.tool}</code>
                <span className="truncate font-mono text-muted-foreground">{a.args}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Status({ label, ok, missing, onClick }: { label: string; ok?: boolean | null; missing?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={missing}
      title={missing ? 'CLI not installed' : ok ? 'Connected — click to update' : 'Click to connect'}
      className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition hover:bg-accent disabled:opacity-50"
    >
      <span className={cn('size-2 rounded-full', ok ? 'bg-emerald-500' : missing ? 'bg-muted-foreground/30' : 'bg-amber-500')} />
      {label}
      <span className="text-xs text-muted-foreground">{missing ? 'not installed' : ok ? 'connected' : 'not connected'}</span>
    </button>
  )
}

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="group relative">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-16 font-mono text-xs whitespace-pre-wrap break-all">{text}</pre>
        <Button
          size="sm"
          variant="secondary"
          className="absolute top-2 right-2 h-7"
          onClick={() => {
            void navigator.clipboard.writeText(text)
            toast.success('Copied')
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  )
}

function AiSettings() {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [key, setKey] = useState('')
  useEffect(() => void window.chat.hasKey().then(setHasKey), [])
  return (
    <div>
      <Row title="Model" description="The assistant uses Claude Opus 5 with the same tools as the MCP server.">
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">claude-opus-5</code>
      </Row>
      <Row
        title="Anthropic API key"
        description={hasKey ? 'A key is stored, encrypted with your macOS Keychain.' : 'Required for the built-in assistant (⌘J). Not needed for MCP.'}
      >
        {hasKey ? (
          <Button
            variant="outline"
            onClick={async () => {
              await window.chat.setKey(null)
              setHasKey(await window.chat.hasKey())
              toast('API key removed')
            }}
          >
            Remove key
          </Button>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await window.chat.setKey(key)
                setKey('')
                setHasKey(await window.chat.hasKey())
                toast.success('API key saved')
              } catch (err) {
                toast.error(String(err))
              }
            }}
          >
            <Input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} className="w-56" />
            <Button type="submit" disabled={!key.trim()}>
              <KeyRound /> Save
            </Button>
          </form>
        )}
      </Row>
    </div>
  )
}

const bytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)

function DataSettings() {
  const dispatch = useAppDispatch()
  const [info, setInfo] = useState<DataInfo | null>(null)
  useEffect(() => void window.app.getDataInfo().then(setInfo), [])
  return (
    <div>
      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="text-sm font-medium">Everything is stored locally in one folder</div>
        <code className="mt-2 block rounded bg-muted px-2 py-1.5 font-mono text-xs break-all">{info?.dataDir ?? '…'}</code>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>
            <code className="font-mono text-xs text-foreground">canvascl.db</code> — cards, whiteboards, tags, journal (SQLite){info && ` · ${bytes(info.dbBytes)}`}
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">files/</code> — imported PDFs and images{info && ` · ${info.fileCount} files`}
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">settings.json</code> — these settings
          </li>
        </ul>
        <Button className="mt-4" variant="outline" onClick={() => void window.app.revealDataDir()}>
          Show in Finder
        </Button>
      </div>
      <Row title="Export as Markdown" description="One .md file per card with tags in front matter, plus a journal folder.">
        <Button
          variant="outline"
          onClick={async () => {
            const r = await window.api.exportMarkdown()
            if (r) toast.success(`Exported ${r.count} files`, { description: r.dir })
          }}
        >
          <Download /> Export
        </Button>
      </Row>
      <Row title="Import Markdown" description="Create cards from .md files (front matter title/tags supported).">
        <Button
          variant="outline"
          onClick={async () => {
            const r = await window.api.importMarkdown()
            if (r.count) {
              dispatch(api.util.invalidateTags(['CardList', 'Tag']))
              toast.success(`Imported ${r.count} cards`)
            }
          }}
        >
          <Upload /> Import
        </Button>
      </Row>
    </div>
  )
}

function About() {
  const [version, setVersion] = useState('')
  useEffect(() => void window.app.getDataInfo().then((i) => setVersion(i.version)), [])
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3">
        <Orb online active={false} className="size-10 [&>span]:size-8" />
        <div>
          <div className="text-base font-semibold">CanvasCL</div>
          <div className="text-muted-foreground">Version {version}</div>
        </div>
      </div>
      <p className="text-muted-foreground">Free, open-source, local-first visual knowledge base with first-class MCP support. MIT licensed.</p>
      <p className="text-muted-foreground">
        Press <Kbd>⌘/</Kbd> anytime to see keyboard shortcuts.
      </p>
    </div>
  )
}
