import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import type { McpActivity } from '@shared/api'

export type View =
  | { type: 'whiteboard'; id: string }
  | { type: 'library'; tagId: string | null; mode: 'table' | 'list' | 'kanban' }
  | { type: 'tasks' }
  | { type: 'home' }

/** Legacy persisted view kinds no longer supported (e.g. the removed journal) — fall back to Home. */
type LegacyView = View | { type: 'journal' }
const migrateView = (v: LegacyView | undefined): View => (v && v.type !== 'journal' ? v : HOME)

/** The PDF docked in the split-screen reader on the right. */
export interface PdfReaderState {
  fileId: string
  name: string
  /** page to scroll to once the document is ready (cleared after the jump) */
  jumpTo?: number
}

export const PDF_MIN_WIDTH = 360
export const PDF_MAX_WIDTH = 1100
export const PDF_DEFAULT_WIDTH = 560

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
  /** PDF reader docked on the right half of the window (null = closed) */
  pdf: PdfReaderState | null
  /** width of the PDF reader in px (persisted) */
  pdfWidth: number
  /** list of all highlights of the open PDF, shown next to the pages */
  pdfListOpen: boolean
  /** resolved from settings.theme + OS appearance */
  theme: 'light' | 'dark'
  activity: McpActivity[]
  /** native macOS fullscreen — traffic lights are hidden, so layout can reclaim their space */
  fullscreen: boolean
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

const initialTabs: Tab[] = stored.tabs?.length
  ? stored.tabs.map((t) => ({ ...t, view: migrateView(t.view), back: [], forward: [] }))
  : [newTab(migrateView(stored.view))]
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
  pdf: stored.pdf ?? null,
  pdfWidth: Math.min(PDF_MAX_WIDTH, Math.max(PDF_MIN_WIDTH, stored.pdfWidth ?? PDF_DEFAULT_WIDTH)),
  pdfListOpen: stored.pdfListOpen ?? false,
  queuedChatMessage: null,
  settingsOpen: false,
  settingsSection: 'general',
  shortcutsOpen: false,
  profileDialog: null,
  activity: [],
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  fullscreen: false
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
    /** Dock a PDF in the reader; passing the file that is already open just jumps to the page. */
    openPdf: (s, a: PayloadAction<PdfReaderState>) => void (s.pdf = { ...s.pdf, ...a.payload }),
    closePdf: (s) => void (s.pdf = null),
    clearPdfJump: (s) => {
      if (s.pdf) s.pdf = { fileId: s.pdf.fileId, name: s.pdf.name }
    },
    setPdfWidth: (s, a: PayloadAction<number>) =>
      void (s.pdfWidth = Math.min(PDF_MAX_WIDTH, Math.max(PDF_MIN_WIDTH, Math.round(a.payload)))),
    setPdfListOpen: (s, a: PayloadAction<boolean>) => void (s.pdfListOpen = a.payload),
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
    pushActivity: (s, a: PayloadAction<McpActivity>) => void (s.activity = [a.payload, ...s.activity].slice(0, 30)),
    setFullscreen: (s, a: PayloadAction<boolean>) => void (s.fullscreen = a.payload)
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
  openPdf,
  closePdf,
  clearPdfJump,
  setPdfWidth,
  setPdfListOpen,
  queueChatMessage,
  clearQueuedChatMessage,
  openSettings,
  setSettingsOpen,
  setSettingsSection,
  setShortcutsOpen,
  openProfileDialog,
  setResolvedTheme,
  pushActivity,
  setFullscreen
} = ui.actions
