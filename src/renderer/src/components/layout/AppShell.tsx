import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { AccountDialogs } from '@/features/auth/AccountDialogs'
import { redoWithToast, undoWithToast } from '@/lib/undo-actions'
import { AnimatePresence, motion } from 'motion/react'
import { CardPanel } from '@/features/card/CardPanel'
import { WhiteboardView } from '@/features/canvas/WhiteboardView'
import { HomeView } from '@/features/home/HomeView'
import { LibraryView } from '@/features/library/LibraryView'
import { TasksView } from '@/features/tasks/TasksView'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { ShortcutsDialog } from '@/features/help/ShortcutsDialog'
import { store, useAppDispatch, useAppSelector } from '@/store'
import { back, closeTab, cycleTab, forward, navigate, openSettings, openTab, setChatOpen, setPaletteOpen, toggleSidebar } from '@/store/ui'
import { useCommands } from '@/lib/shortcuts'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { TabBar } from './TabBar'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { PdfReader } from '@/features/pdf/PdfReader'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const dispatch = useAppDispatch()
  const { sidebarOpen, view, openCardId, chatOpen, pdf } = useAppSelector((s) => s.ui)

  useCommands({
    'palette.open': () => dispatch(setPaletteOpen(true)),
    'settings.open': () => dispatch(openSettings(undefined)),
    'sidebar.toggle': () => dispatch(toggleSidebar()),
    'chat.toggle': () => dispatch(setChatOpen(!store.getState().ui.chatOpen)),
    'edit.undo': () => void undoWithToast(),
    'edit.redo': () => void redoWithToast(),
    'nav.back': () => dispatch(back()),
    'nav.forward': () => dispatch(forward()),
    'nav.tasks': () => dispatch(navigate({ type: 'tasks' })),
    'capture.open': () => void window.app.openCapture(),
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
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <ErrorBoundary key={JSON.stringify(view)}>
              {view.type === 'whiteboard' && <WhiteboardView key={view.id} id={view.id} />}
              {view.type === 'library' && <LibraryView />}
              {view.type === 'tasks' && <TasksView />}
              {view.type === 'home' && <HomeView />}
            </ErrorBoundary>
            <AnimatePresence>{openCardId && <CardPanel key={openCardId} cardId={openCardId} />}</AnimatePresence>
          </div>
          <AnimatePresence initial={false}>{pdf && <PdfReader key="pdf" />}</AnimatePresence>
          <AnimatePresence initial={false}>{chatOpen && <ChatPanel key="chat" />}</AnimatePresence>
        </div>
      </main>
      <CommandPalette />
      <ShortcutsDialog />
      <SettingsDialog />
      <ProfileDialog />
      <AccountDialogs />
      <Onboarding />
    </div>
  )
}
