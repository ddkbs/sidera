import './assets-path'
import './fonts.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App } from './App'
import { CaptureApp } from './features/capture/CaptureApp'
import { store } from './store'
import { settingsLoaded } from './store/settings'
import { resetTabs } from './store/ui'

const isCapture = location.hash === '#capture'
if (isCapture) {
  // Frameless window: let our own rounded container show through instead of the app background.
  document.documentElement.style.setProperty('background', 'transparent')
  document.body.style.setProperty('background', 'transparent', 'important')
}

// Settings must be known before first paint (theme, font, shortcuts).
const settings = await window.app.getSettings()
store.dispatch(settingsLoaded(settings))
if (!isCapture && !settings.restoreLastView) store.dispatch(resetTabs())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>{isCapture ? <CaptureApp /> : <App />}</Provider>
  </StrictMode>
)
