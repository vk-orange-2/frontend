import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchServices } from '../api/client'
import type { ServiceResponse } from '../api/types'

export function HomePage() {
  const [data, setData] = useState<ServiceResponse[] | null>(null)
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
        </div>
      </header>

      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="error-banner">{error}</p>}

      {!loading && !error && data && data.length > 0 && (
        <ul className="card-list">
          {data.map((s: ServiceResponse) => (
            <li key={s.id || s.name}>
              <Link
                className="service-card"
                to={`/services/${encodeURIComponent(s.name)}/configs`}
              >
                <div className="service-card__top">
                  <span className="service-card__name">{s.name}</span>
                </div>
                {s.description ? (
                  <p className="service-card__desc muted">{s.description}</p>
                ) : (
                  <p className="service-card__desc muted">Конфигурации по имени сервиса</p>
                )}
                <footer className="service-card__meta">
                  <span className="service-card__cta">Свойства →</span>
                </footer>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && data?.length === 0 && (
        <p className="muted">Сервисов пока нет.</p>
      )}
    </div>
  )
}
