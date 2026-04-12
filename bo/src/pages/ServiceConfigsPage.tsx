import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { fetchServiceConfigs } from '../api/client'
import type { BaseConfig, ConfigListResponse } from '../api/types'

type LocationState = { serviceName?: string; namespace?: string } | null

const envLabels: Record<string, string> = {
  dev: 'dev',
  stage: 'stage',
  prod: 'prod',
}

export function ServiceConfigsPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const location = useLocation()
  const state = location.state as LocationState

  const [data, setData] = useState<ConfigListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const title = state?.serviceName ?? 'Сервис'
  const namespace = state?.namespace

  const id = serviceId ?? ''

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetchServiceConfigs(id)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'Не удалось загрузить конфигурации',
          )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const rows = useMemo(() => data?.items ?? [], [data])

  return (
    <div className="page">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <span>{title}</span>
      </nav>

      <header className="page-head">
        <div>
          <h1>Конфигурации</h1>
          <p className="page-sub">
            <code>/v1/services/{id || '…'}/configs</code>
            {namespace ? (
              <>
                {' '}
                · <span className="badge badge--inline">{namespace}</span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="error-banner">{error}</p>}

      {!loading && !error && data && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ключ</th>
                <th>Среда</th>
                <th>Тип</th>
                <th>Формат</th>
                <th>Версия</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: BaseConfig) => (
                <tr key={c.id}>
                  <td className="mono">{c.configKey}</td>
                  <td>
                    <span className={`pill pill--${c.environment}`}>
                      {envLabels[c.environment] ?? c.environment}
                    </span>
                  </td>
                  <td>{c.configType}</td>
                  <td>{c.format}</td>
                  <td className="mono">{c.currentVersion}</td>
                  <td>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="table-foot muted">
            Показано {rows.length} из {data.pagination.total}
          </p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="muted">Для этого сервиса конфигураций нет.</p>
      )}
    </div>
  )
}
