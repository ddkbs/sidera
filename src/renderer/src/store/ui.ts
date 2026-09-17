import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import type { McpActivity } from '@shared/api'

export type View =
  | { type: 'whiteboard'; id: string }
  | { type: 'library'; tagId: string | null; mode: 'table' | 'list' | 'kanban' }
  | { type: 'journal' }
  | { type: 'tasks' }
  | { type: 'home' }

export type CanvasTool = 'select' | 'card' | 'import' | 'connector' | 'text' | 'section' | 'search'

export interface Tab {
  id: string
  view: View
  back: View[]
  forward: View[]
}

export interface UiState {
  sidebarOpen: boolean
  tabs: Tab[]
  activeTabId: string
  /** mirror of the active tab's view (kept in sync by every reducer) */
  view: View
  tool: CanvasTool
  openCardId: string | null
  paletteOpen: boolean
  chatOpen: boolean
  /** set to send a message into the chat panel as soon as it's mounted/open; consumed then cleared */
  queuedChatMessage: string | null
  settingsOpen: boolean
  settingsSection: string
  shortcutsOpen: boolean
  /** profile create/edit dialog: `id` null = new profile */
  profileDialog: { id: string | null } | null
  /** resolved from settings.theme + OS appearance */
  theme: 'light' | 'dark'
  activity: McpActivity[]
}

const HOME: View = { type: 'home' }
const newTab = (view: View = HOME): Tab => ({ id: nanoid(8), view, back: [], forward: [] })
const same = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b)

const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem('canvascl.ui') ?? '{}') as Partial<UiState>
  } catch {
    return {}
  }
})()

const initialTabs: Tab[] = stored.tabs?.length ? stored.tabs.map((t) => ({ ...t, back: [], forward: [] })) : [newTab(stored.view ?? HOME)]
const initialActive = initialTabs.find((t) => t.id === stored.activeTabId) ?? initialTabs[0]

const initialState: UiState = {
  sidebarOpen: stored.sidebarOpen ?? true,
  tabs: initialTabs,
  activeTabId: initialActive.id,
  view: initialActive.view,
  tool: 'select',
  openCardId: null,
  paletteOpen: false,
  chatOpen: stored.chatOpen ?? false,
  queuedChatMessage: null,
  settingsOpen: false,
  settingsSection: 'general',
  shortcutsOpen: false,
  profileDialog: null,
  activity: [],
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const active = (s: UiState): Tab => s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]
const sync = (s: UiState): void => {
  const tab = active(s)
  s.activeTabId = tab.id
  s.view = tab.view
  s.tool = 'select'
}

export const ui = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (s) => void (s.sidebarOpen = !s.sidebarOpen),
    navigate: (s, a: PayloadAction<View>) => {
      const tab = active(s)
      if (same(tab.view, a.payload)) return
      tab.back.push(tab.view)
      if (tab.back.length > 50) tab.back.shift()
      tab.forward = []
      tab.view = a.payload
      sync(s)
    },
    back: (s) => {
      const tab = active(s)
      const prev = tab.back.pop()
      if (!prev) return
      tab.forward.push(tab.view)
      tab.view = prev
      sync(s)
    },
    forward: (s) => {
      const tab = active(s)
      const next = tab.forward.pop()
      if (!next) return
      tab.back.push(tab.view)
      tab.view = next
      sync(s)
    },
    openTab: (s, a: PayloadAction<View | undefined>) => {
      const tab = newTab(a.payload ?? HOME)
      const i = s.tabs.findIndex((t) => t.id === s.activeTabId)
      s.tabs.splice(i + 1, 0, tab)
      s.activeTabId = tab.id
      sync(s)
    },
    closeTab: (s, a: PayloadAction<string | undefined>) => {
      const id = a.payload ?? s.activeTabId
      const i = s.tabs.findIndex((t) => t.id === id)
      if (i < 0) return
      s.tabs.splice(i, 1)
      if (!s.tabs.length) s.tabs.push(newTab())
      if (id === s.activeTabId) s.activeTabId = s.tabs[Math.min(i, s.tabs.length - 1)].id
      sync(s)
    },
    selectTab: (s, a: PayloadAction<string | number>) => {
      const tab = typeof a.payload === 'number' ? s.tabs[a.payload] : s.tabs.find((t) => t.id === a.payload)
      if (!tab || tab.id === s.activeTabId) return
      s.activeTabId = tab.id
      sync(s)
    },
    cycleTab: (s, a: PayloadAction<1 | -1>) => {
      const i = s.tabs.findIndex((t) => t.id === s.activeTabId)
      s.activeTabId = s.tabs[(i + a.payload + s.tabs.length) % s.tabs.length].id
      sync(s)
    },
    moveTab: (s, a: PayloadAction<{ from: number; to: number }>) => {
      const [tab] = s.tabs.splice(a.payload.from, 1)
      s.tabs.splice(a.payload.to, 0, tab)
    },
    resetTabs: (s) => {
      s.tabs = [newTab()]
      sync(s)
    },
    setTool: (s, a: PayloadAction<CanvasTool>) => void (s.tool = a.payload),
    openCard: (s, a: PayloadAction<string | null>) => void (s.openCardId = a.payload),
    setPaletteOpen: (s, a: PayloadAction<boolean>) => void (s.paletteOpen = a.payload),
    setChatOpen: (s, a: PayloadAction<boolean>) => void (s.chatOpen = a.payload),
    /** Opens the chat panel and queues a message for it to send once mounted. */
    queueChatMessage: (s, a: PayloadAction<string>) => {
      s.chatOpen = true
      s.queuedChatMessage = a.payload
    },
    clearQueuedChatMessage: (s) => void (s.queuedChatMessage = null),
    openSettings: (s, a: PayloadAction<string | undefined>) => {
      s.settingsOpen = true
      if (a.payload) s.settingsSection = a.payload
    },
    setSettingsOpen: (s, a: PayloadAction<boolean>) => void (s.settingsOpen = a.payload),
    setSettingsSection: (s, a: PayloadAction<string>) => void (s.settingsSection = a.payload),
    setShortcutsOpen: (s, a: PayloadAction<boolean>) => void (s.shortcutsOpen = a.payload),
    openProfileDialog: (s, a: PayloadAction<{ id: string | null } | null>) => void (s.profileDialog = a.payload),
    setResolvedTheme: (s, a: PayloadAction<'light' | 'dark'>) => void (s.theme = a.payload),
    pushActivity: (s, a: PayloadAction<McpActivity>) => void (s.activity = [a.payload, ...s.activity].slice(0, 30))
  }
})

export const {
  toggleSidebar,
  navigate,
  back,
  forward,
  openTab,
  closeTab,
  selectTab,
  cycleTab,
  moveTab,
  resetTabs,
  setTool,
  openCard,
  setPaletteOpen,
  setChatOpen,
  queueChatMessage,
  clearQueuedChatMessage,
  openSettings,
  setSettingsOpen,
  setSettingsSection,
  setShortcutsOpen,
  openProfileDialog,
  setResolvedTheme,
  pushActivity
} = ui.actions
