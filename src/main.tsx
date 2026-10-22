import '@fontsource/oswald/latin-500.css'
import '@fontsource/oswald/latin-600.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Without it, customers' booking messages would go nowhere.
if (!import.meta.env.VITE_BARBER_WHATSAPP) {
  throw new Error('Missing VITE_BARBER_WHATSAPP. Copy .env.example to .env.local and fill it in.')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
