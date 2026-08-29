import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminToastHost } from './components/admin/AdminToastHost'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AdminToastHost />
  </StrictMode>,
)
