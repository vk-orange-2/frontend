import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchServices } from '../api/client'
import type { Service, ServiceListResponse } from '../api/types'

export function HomePage() {
  const [data, setData] = useState<ServiceListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchServices()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Не удалось загрузить сервисы')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Сервисы</h1>
          <p className="page-sub">
            Данные с эндпоинта <code>/v1/services</code>
          </p>
        </div>
      </header>

      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="error-banner">{error}</p>}

      {!loading && !error && data && (
        <ul className="card-list">
          {data.items.map((s: Service) => (
            <li key={s.id}>
              <Link
                className="service-card"
                to={`/services/${s.id}/configs`}
                state={{ serviceName: s.name, namespace: s.namespace }}
              >
                <div className="service-card__top">
                  <span className="service-card__name">{s.name}</span>
                  <span className="badge">{s.namespace}</span>
                </div>
                {s.description ? (
                  <p className="service-card__desc">{s.description}</p>
                ) : (
                  <p className="service-card__desc muted">Без описания</p>
                )}
                <footer className="service-card__meta">
                  <span>id: {s.id}</span>
                  <span className="service-card__cta">Конфиги →</span>
                </footer>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && data?.items.length === 0 && (
        <p className="muted">Сервисов пока нет.</p>
      )}
    </div>
  )
}
