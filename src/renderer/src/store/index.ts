import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { api } from './api'
import { ui } from './ui'

export const store = configureStore({
  reducer: { ui: ui.reducer, [api.reducerPath]: api.reducer },
  middleware: (gdm) => gdm().concat(api.middleware)
})

store.subscribe(() => {
  const { sidebarOpen, view, theme, chatOpen } = store.getState().ui
  try {
    localStorage.setItem('canvascl.ui', JSON.stringify({ sidebarOpen, view, theme, chatOpen }))
  } catch {
    /* ignore */
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
