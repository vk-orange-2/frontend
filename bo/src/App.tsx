import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ConfigVersionHistoryPage } from './pages/ConfigVersionHistoryPage'
import {
  ServiceConfigCreatePage,
  ServiceConfigEditPage,
} from './pages/ServiceConfigEditorPages'
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
            Сервис конфигураций
          </Link>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/services/:serviceName/configs/new" element={<ServiceConfigCreatePage />} />
            <Route
              path="/services/:serviceName/configs/:environment/history/:configKey"
              element={<ConfigVersionHistoryPage />}
            />
            <Route
              path="/services/:serviceName/configs/:environment/edit/:configKey"
              element={<ServiceConfigEditPage />}
            />
            <Route path="/services/:serviceName/configs" element={<ServiceConfigsRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
