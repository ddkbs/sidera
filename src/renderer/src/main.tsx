import './assets-path'
import '@fontsource-variable/jost'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App } from './App'
import { store } from './store'
import { settingsLoaded } from './store/settings'
import { resetTabs } from './store/ui'

// Settings must be known before first paint (theme, font, shortcuts).
const settings = await window.app.getSettings()
store.dispatch(settingsLoaded(settings))
if (!settings.restoreLastView) store.dispatch(resetTabs())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
)
