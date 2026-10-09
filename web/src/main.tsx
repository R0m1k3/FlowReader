import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Self-hosted variable fonts: no third-party request, cached offline by the SW.
// Browsers only download the unicode-range subsets a page actually uses.
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/lora/wght.css'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource-variable/playfair-display/wght.css'
import '@fontsource-variable/playfair-display/wght-italic.css'
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import './index.css'
import App from './App.tsx'
import { useUpdate } from './stores/updateStore'

// Prompt-based updates: a new version never reloads the page mid-read.
const updateSW = registerSW({
  onNeedRefresh() {
    useUpdate.getState().setAvailable(() => updateSW(true))
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
