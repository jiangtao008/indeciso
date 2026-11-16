import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './context/ToastContext'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

// "/indeciso/" -> "/indeciso", "/" -> "/"
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

createRoot(root).render(
  <BrowserRouter basename={basename}>
    <ToastProvider>
      <App />
    </ToastProvider>
  </BrowserRouter>,
)
