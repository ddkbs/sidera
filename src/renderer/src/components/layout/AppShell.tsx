import { AnimatePresence, motion } from 'motion/react'
import { CardPanel } from '@/features/card/CardPanel'
import { WhiteboardView } from '@/features/canvas/WhiteboardView'
import { HomeView } from '@/features/home/HomeView'
import { JournalView } from '@/features/journal/JournalView'
import { LibraryView } from '@/features/library/LibraryView'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { ShortcutsDialog } from '@/features/help/ShortcutsDialog'
import { store, useAppDispatch, useAppSelector } from '@/store'
import { back, closeTab, cycleTab, forward, navigate, openSettings, openTab, setChatOpen, setPaletteOpen, toggleSidebar } from '@/store/ui'
import { useCommands } from '@/lib/shortcuts'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { Tour } from '@/features/onboarding/Tour'
import { TabBar } from './TabBar'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  const dispatch = useAppDispatch()
  const { sidebarOpen, view, openCardId, chatOpen } = useAppSelector((s) => s.ui)

  useCommands({
    'palette.open': () => dispatch(setPaletteOpen(true)),
    'settings.open': () => dispatch(openSettings(undefined)),
    'sidebar.toggle': () => dispatch(toggleSidebar()),
    'chat.toggle': () => dispatch(setChatOpen(!store.getState().ui.chatOpen)),
    'nav.back': () => dispatch(back()),
    'nav.forward': () => dispatch(forward()),
    'nav.journal': () => dispatch(navigate({ type: 'journal' })),
    'tab.new': () => dispatch(openTab(undefined)),
    'tab.close': () => dispatch(closeTab(undefined)),
    'tab.next': () => dispatch(cycleTab(1)),
    'tab.prev': () => dispatch(cycleTab(-1))
  })

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
        <TabBar />
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <ErrorBoundary key={JSON.stringify(view)}>
              {view.type === 'whiteboard' && <WhiteboardView key={view.id} id={view.id} />}
              {view.type === 'library' && <LibraryView />}
              {view.type === 'journal' && <JournalView />}
              {view.type === 'home' && <HomeView />}
            </ErrorBoundary>
            <AnimatePresence>{openCardId && <CardPanel key={openCardId} cardId={openCardId} />}</AnimatePresence>
          </div>
          <AnimatePresence initial={false}>{chatOpen && <ChatPanel key="chat" />}</AnimatePresence>
        </div>
      </main>
      <CommandPalette />
      <ShortcutsDialog />
      <SettingsDialog />
      <Tour />
    </div>
  )
}
