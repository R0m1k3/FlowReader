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

const reload = () => window.location.reload()

registerSW({
  immediate: true,
  onNeedRefresh() {
    useUpdate.getState().setAvailable(reload)
  },
})

// The service worker activates new versions right away; when it takes over a
// page that was already controlled, offer a reload instead of forcing one
// under the reader.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) useUpdate.getState().setAvailable(reload)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
