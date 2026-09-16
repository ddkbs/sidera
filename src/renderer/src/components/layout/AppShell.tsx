import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { CardPanel } from '@/features/card/CardPanel'
import { WhiteboardView } from '@/features/canvas/WhiteboardView'
import { HomeView } from '@/features/home/HomeView'
import { JournalView } from '@/features/journal/JournalView'
import { LibraryView } from '@/features/library/LibraryView'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { McpDialog } from '@/features/mcp/McpDialog'
import { ShortcutsDialog } from '@/features/help/ShortcutsDialog'
import { useAppDispatch, useAppSelector } from '@/store'
import { back, setPaletteOpen, toggleSidebar } from '@/store/ui'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  const dispatch = useAppDispatch()
  const { sidebarOpen, view, openCardId } = useAppSelector((s) => s.ui)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.key === 'k') {
        e.preventDefault()
        dispatch(setPaletteOpen(true))
      } else if (e.key === '\\') {
        e.preventDefault()
        dispatch(toggleSidebar())
      } else if (e.key === '[') {
        e.preventDefault()
        dispatch(back())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return (
    <div className="flex h-full w-full bg-sidebar">
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className="h-full shrink-0 overflow-hidden"
          >
            <Sidebar />
          </motion.aside>
        )}
      </AnimatePresence>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            {view.type === 'whiteboard' && <WhiteboardView key={view.id} id={view.id} />}
            {view.type === 'library' && <LibraryView />}
            {view.type === 'journal' && <JournalView />}
            {view.type === 'home' && <HomeView />}
          </div>
          <AnimatePresence>{openCardId && <CardPanel key={openCardId} cardId={openCardId} />}</AnimatePresence>
        </div>
      </main>
      <CommandPalette />
      <McpDialog />
      <ShortcutsDialog />
    </div>
  )
}
