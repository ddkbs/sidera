import './assets-path'
import './fonts.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App } from './App'
import { SignInScreen } from './features/auth/SignInScreen'
import { CaptureApp } from './features/capture/CaptureApp'
import { resolveUiLang, setLang } from './lib/i18n'
import { store } from './store'
import { settingsLoaded } from './store/settings'
import { resetTabs } from './store/ui'

const isCapture = location.hash === '#capture'
if (isCapture) {
  // Frameless window: let our own rounded container show through instead of the app background.
  document.documentElement.style.setProperty('background', 'transparent')
  document.body.style.setProperty('background', 'transparent', 'important')
}

const root = createRoot(document.getElementById('root')!)

if (!window.auth.session) {
  // Signed out: only the sign-in screen (main reloads this window once a session is open).
  if (!isCapture) root.render(<StrictMode><SignInScreen /></StrictMode>)
} else {
  // Settings must be known before first paint (theme, font, shortcuts).
  const settings = await window.app.getSettings()
  store.dispatch(settingsLoaded(settings))
  // UI language follows the account setting (null = system language)
  setLang(resolveUiLang(settings.language))
  store.subscribe(() => setLang(resolveUiLang(store.getState().settings.language)))
  if (!isCapture && !settings.restoreLastView) store.dispatch(resetTabs())

  root.render(
    <StrictMode>
      <Provider store={store}>{isCapture ? <CaptureApp /> : <App />}</Provider>
    </StrictMode>
  )
}
