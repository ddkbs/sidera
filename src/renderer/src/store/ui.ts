import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type View =
  | { type: 'whiteboard'; id: string }
  | { type: 'library'; tagId: string | null; mode: 'table' | 'list' | 'kanban' }
  | { type: 'journal' }
  | { type: 'home' }

export type CanvasTool = 'select' | 'card' | 'import' | 'connector' | 'text' | 'section' | 'search'

export interface UiState {
  sidebarOpen: boolean
  view: View
  history: View[]
  tool: CanvasTool
  openCardId: string | null
  paletteOpen: boolean
  mcpDialogOpen: boolean
  theme: 'light' | 'dark'
}

const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem('canvascl.ui') ?? '{}') as Partial<UiState>
  } catch {
    return {}
  }
})()

const initialState: UiState = {
  sidebarOpen: stored.sidebarOpen ?? true,
  view: stored.view ?? { type: 'home' },
  history: [],
  tool: 'select',
  openCardId: null,
  paletteOpen: false,
  mcpDialogOpen: false,
  theme: stored.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export const ui = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (s) => void (s.sidebarOpen = !s.sidebarOpen),
    navigate: (s, a: PayloadAction<View>) => {
      if (JSON.stringify(s.view) === JSON.stringify(a.payload)) return
      s.history.push(s.view)
      if (s.history.length > 50) s.history.shift()
      s.view = a.payload
      s.tool = 'select'
    },
    back: (s) => {
      const prev = s.history.pop()
      if (prev) s.view = prev
    },
    setTool: (s, a: PayloadAction<CanvasTool>) => void (s.tool = a.payload),
    openCard: (s, a: PayloadAction<string | null>) => void (s.openCardId = a.payload),
    setPaletteOpen: (s, a: PayloadAction<boolean>) => void (s.paletteOpen = a.payload),
    setMcpDialogOpen: (s, a: PayloadAction<boolean>) => void (s.mcpDialogOpen = a.payload),
    toggleTheme: (s) => void (s.theme = s.theme === 'dark' ? 'light' : 'dark')
  }
})

export const { toggleSidebar, navigate, back, setTool, openCard, setPaletteOpen, setMcpDialogOpen, toggleTheme } = ui.actions
