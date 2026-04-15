import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ServiceConfigsPage } from './pages/ServiceConfigsPage'
import './App.css'

function ServiceConfigsRoute() {
  const { serviceName } = useParams()
  return <ServiceConfigsPage key={serviceName} />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="app-shell">
        <header className="app-header">
          <Link to="/" className="app-brand">
            Orange BO
          </Link>
          <span className="app-tag">конфигурации</span>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/services/:serviceName/configs" element={<ServiceConfigsRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
