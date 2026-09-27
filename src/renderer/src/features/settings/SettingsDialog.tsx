import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { DataInfo, McpConnections, ProviderStatus } from '@shared/api'
import { APP_NAME } from '@shared/brand'
import { AI_PROVIDERS, getProviderMeta, type AiProviderId } from '@shared/ai'
import type { FontPref, ThemePref } from '@shared/settings'
import { AskAI, ArrowUpRight, Check, CircleCheck, Command, Download, File, Home, KeyRound, Palette, Pencil, RotateCcw, Server, Settings, Upload, User, UserCircle, UserPlus } from '@/components/icons'
import { AccountSettings } from '@/features/auth/AccountSettings'
import { LogoTile } from '@/components/Logo'
import { Orb } from '@/components/Orb'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { FONT_STACKS } from '@/App'
import { eventToBinding, formatBinding, shortcutRecording } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { api, useGetActiveProfileQuery, useGetMcpInfoQuery, useListProfilesQuery, useSetActiveProfileMutation } from '@/store/api'
import { settingsLoaded, updateSettings } from '@/store/settings'
import { openProfileDialog, setSettingsOpen, setSettingsSection } from '@/store/ui'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { ShortcutsSettings } from './ShortcutsSettings'
import { onboarding } from '@/features/onboarding/controller'

const SECTIONS = [
  { id: 'general', label: 'General', Icon: Settings },
  { id: 'account', label: 'Account', Icon: UserCircle },
  { id: 'profile', label: 'Profile', Icon: User },
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
          {current.id === 'account' && <AccountSettings />}
          {current.id === 'profile' && <ProfileSettings />}
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

function ProfileSettings() {
  const dispatch = useAppDispatch()
  const { data: active } = useGetActiveProfileQuery()
  const { data: profiles = [] } = useListProfilesQuery()
  const [setActive] = useSetActiveProfileMutation()
  return (
    <div>
      {active && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border p-4">
          <ProfileAvatar profile={active} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{active.name}</div>
            <div className="truncate text-sm text-muted-foreground">{active.email ?? 'No email · local profile'}</div>
          </div>
          <Button variant="outline" onClick={() => dispatch(openProfileDialog({ id: active.id }))}>
            <Pencil />
            Edit profile
          </Button>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Profiles</div>
          <div className="text-sm text-muted-foreground">The active profile signs new task comments, including ones added over MCP.</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => dispatch(openProfileDialog({ id: null }))}>
          <UserPlus />
          New profile
        </Button>
      </div>
      <div className="divide-y rounded-xl border">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <ProfileAvatar profile={p} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{p.name}</div>
              {p.email && <div className="truncate text-xs text-muted-foreground">{p.email}</div>}
            </div>
            {p.id === active?.id ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CircleCheck className="size-3.5 text-emerald-500" /> Active
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void setActive(p.id)}>
                Switch
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => dispatch(openProfileDialog({ id: p.id }))}>
              Edit
            </Button>
          </div>
        ))}
      </div>
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
      <QuickCaptureRow />
      <Row title="Onboarding" description="Replay the welcome screens or the guided tour of the sidebar, canvas and AI features.">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              dispatch(setSettingsOpen(false))
              onboarding.showWelcome()
            }}
          >
            Welcome
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              dispatch(setSettingsOpen(false))
              onboarding.startTour()
            }}
          >
            Take the tour
          </Button>
        </div>
      </Row>
    </div>
  )
}

function QuickCaptureRow() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings.quickCapture)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    shortcutRecording.active = recording
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(false)
      const binding = eventToBinding(e)
      if (!binding) return
      setRecording(false)
      void save({ accelerator: binding })
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      shortcutRecording.active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  const save = async (patch: Partial<typeof s>) => {
    try {
      await dispatch(updateSettings({ quickCapture: { ...s, ...patch } })).unwrap()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      dispatch(settingsLoaded(await window.app.getSettings()))
    }
  }

  return (
    <Row title="Quick capture" description="Global shortcut opens a small capture window from anywhere, even while CanvasCL is in the background.">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setRecording((r) => !r)}
          className={cn('h-7 min-w-28 rounded-md border px-2 text-xs tracking-wider transition hover:bg-accent', recording && 'border-brand bg-brand/10 text-brand')}
        >
          {recording ? 'Press keys…' : formatBinding(s.accelerator)}
        </button>
        <Switch checked={s.enabled} onCheckedChange={(v) => void save({ enabled: v })} />
      </div>
    </Row>
  )
}

const FONTS: { value: FontPref; label: string; note: string }[] = [
  { value: 'geist', label: 'Geist', note: 'Neutral grotesque, bundled with the app' },
  { value: 'system', label: 'SF Pro', note: "macOS system font — matches your Mac's UI" }
]
const SAMPLE = 'The quick brown fox — Ideas connect on the canvas.'

function FontOption({ font, selected, onSelect }: { font: (typeof FONTS)[number]; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'relative flex flex-col gap-3 rounded-xl border p-4 text-left transition outline-none hover:bg-accent',
        'focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-foreground/40 bg-accent/60 ring-2 ring-foreground/10' : 'border-border'
      )}
      style={{ fontFamily: FONT_STACKS[font.value] }}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-3" />
        </span>
      )}
      <div className="text-4xl leading-none">Aa</div>
      <div>
        <div className="text-sm font-medium">{font.label}</div>
        <div className="text-xs text-muted-foreground">{font.note}</div>
      </div>
      <div className="border-t pt-3 text-sm text-foreground/80">{SAMPLE}</div>
      <div className="text-lg font-medium">{SAMPLE}</div>
    </button>
  )
}

function Appearance() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings)
  return (
    <div>
      <div className="mb-2 text-sm font-medium">Font</div>
      <div
        role="radiogroup"
        aria-label="Font"
        className="mb-6 grid grid-cols-2 gap-3"
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
          e.preventDefault()
          const i = FONTS.findIndex((f) => f.value === s.font)
          const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
          const next = FONTS[(i + dir + FONTS.length) % FONTS.length]
          dispatch(updateSettings({ font: next.value }))
          ;(e.currentTarget.querySelectorAll('[role="radio"]')[FONTS.indexOf(next)] as HTMLElement | undefined)?.focus()
        }}
      >
        {FONTS.map((f) => (
          <FontOption key={f.value} font={f} selected={s.font === f.value} onSelect={() => dispatch(updateSettings({ font: f.value }))} />
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
      <Row title="Spell check" description="Underline misspelled words in cards.">
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
  'list_whiteboards', 'get_whiteboard', 'create_whiteboard', 'add_card_to_whiteboard', 'add_section', 'organize_board', 'connect_objects',
  'list_folders', 'create_folder', 'move_whiteboard_to_folder',
  'add_chart', 'update_chart', 'add_mindmap', 'add_flowchart', 'update_diagram',
  'get_kanban', 'move_kanban_item', 'list_tasks', 'add_task', 'update_task', 'complete_task', 'list_profiles',
  'list_task_comments', 'add_task_comment'
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

/** Shared by Settings → AI assistant and the ChatPanel's compact switcher / connect state. */
export function AiSettings() {
  const dispatch = useAppDispatch()
  const s = useAppSelector((st) => st.settings)
  const [status, setStatus] = useState<ProviderStatus[]>([])
  const [selected, setSelected] = useState<AiProviderId>(s.ai.provider)
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(s.ai.baseUrl ?? '')
  const [model, setModel] = useState(s.ai.model)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const refreshStatus = () => void window.chat.getProviderStatus().then(setStatus)
  useEffect(refreshStatus, [])

  const meta = getProviderMeta(selected)
  const isActive = selected === s.ai.provider
  const connected = status.find((p) => p.provider === selected)?.hasKey ?? false

  useEffect(() => {
    setBaseUrl(selected === s.ai.provider ? (s.ai.baseUrl ?? '') : '')
    setModel(selected === s.ai.provider ? s.ai.model : (meta.defaultModels[0] ?? ''))
    setModels([])
    setKey('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      const list = await window.chat.listModels(selected, baseUrl || undefined)
      setModels(list)
      if (!model && list[0]) setModel(list[0])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <div className="flex gap-6">
      <div className="w-44 shrink-0 space-y-0.5">
        {AI_PROVIDERS.map((p) => {
          const st = status.find((x) => x.provider === p.id)
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-accent',
                selected === p.id && 'bg-accent font-medium'
              )}
            >
              <span className="truncate">{p.label}</span>
              {p.id === s.ai.provider ? (
                <CircleCheck className="size-3.5 shrink-0 text-primary" />
              ) : st?.hasKey ? (
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{meta.label}</h3>
          {isActive && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Active</span>}
        </div>

        {meta.needsKey && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm font-medium">
              <span>API key</span>
              {meta.keyDocsUrl && (
                <a href={meta.keyDocsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-foreground">
                  Get a key <ArrowUpRight className="size-3" />
                </a>
              )}
            </div>
            {connected ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CircleCheck className="size-3.5" /> Connected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await window.chat.setProviderKey(selected, null)
                    refreshStatus()
                    toast('API key removed')
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    await window.chat.setProviderKey(selected, key)
                    setKey('')
                    refreshStatus()
                    toast.success('API key saved')
                  } catch (err) {
                    toast.error(String(err))
                  }
                }}
              >
                <Input type="password" placeholder={meta.keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} className="w-64" />
                <Button type="submit" disabled={!key.trim()}>
                  <KeyRound /> Save
                </Button>
              </form>
            )}
          </div>
        )}

        {meta.editableBaseUrl && (
          <div>
            <div className="mb-1.5 text-sm font-medium">Base URL</div>
            <Input placeholder={meta.id === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'https://your-endpoint/v1'} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-80" />
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm font-medium">Model</div>
          <div className="flex items-center gap-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Pick or type a model" />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...meta.defaultModels, ...models])].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadModels()} disabled={loadingModels}>
              <RotateCcw className={cn('size-3.5', loadingModels && 'animate-spin')} /> Load models
            </Button>
          </div>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Or type a model id" className="mt-2 w-64" />
        </div>

        <Button
          onClick={() =>
            dispatch(updateSettings({ ai: { provider: selected, model: model.trim(), baseUrl: meta.editableBaseUrl ? baseUrl.trim() : undefined } }))
          }
          disabled={isActive && s.ai.model === model.trim() && (s.ai.baseUrl ?? '') === baseUrl.trim() || !model.trim()}
        >
          Use this provider
        </Button>
      </div>
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
            <code className="font-mono text-xs text-foreground">canvascl.db</code> — cards, whiteboards, tags (SQLite){info && ` · ${bytes(info.dbBytes)}`}
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
      <Row title="Export as Markdown" description="One .md file per card with tags in front matter.">
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
        <LogoTile />
        <div>
          <div className="text-base font-semibold">{APP_NAME}</div>
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
