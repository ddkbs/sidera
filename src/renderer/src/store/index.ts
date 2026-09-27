import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { api } from './api'
import { settingsSlice } from './settings'
import { ui } from './ui'
import { UI_KEY } from '@/lib/storage'

export const store = configureStore({
  reducer: { ui: ui.reducer, settings: settingsSlice.reducer, [api.reducerPath]: api.reducer },
  middleware: (gdm) => gdm().concat(api.middleware)
})

store.subscribe(() => {
  const { sidebarOpen, tabs, activeTabId, chatOpen, pdf, pdfWidth, pdfListOpen } = store.getState().ui
  try {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        sidebarOpen,
        tabs: tabs.map(({ id, view }) => ({ id, view })),
        activeTabId,
        chatOpen,
        pdf: pdf && { fileId: pdf.fileId, name: pdf.name },
        pdfWidth,
        pdfListOpen
      })
    )
  } catch {
    /* ignore */
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
