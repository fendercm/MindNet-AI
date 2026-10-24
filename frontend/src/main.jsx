import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode убран намеренно: двойное монтирование в dev ломает
// инициализацию reactflow (onInit/fire измерений) и начальный fitBounds.
createRoot(document.getElementById('root')).render(<App />)
