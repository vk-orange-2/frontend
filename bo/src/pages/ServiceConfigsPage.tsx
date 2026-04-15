import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchServiceConfigs } from '../api/client'
import type { ConfigItem, ConfigListResponse } from '../api/types'

type EnvFilterChoice = 'dev' | 'prod'

const envLabels: Record<string, string> = {
  dev: 'dev',
  stage: 'stage',
  prod: 'prod',
}

function pillModifier(env: string): string {
  if (env === 'dev' || env === 'stage' || env === 'prod') return env
  return 'other'
}

function previewValue(value: string, max = 72): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

export function ServiceConfigsPage() {
  const { serviceName: serviceNameParam } = useParams<{ serviceName: string }>()
  const serviceName = serviceNameParam ? decodeURIComponent(serviceNameParam) : ''

  const [data, setData] = useState<ConfigListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [envFilter, setEnvFilter] = useState<EnvFilterChoice | null>(null)

  useEffect(() => {
    if (!serviceName) {
      setLoading(false)
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchServiceConfigs(serviceName)
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
  }, [serviceName])

  const allRows = useMemo(() => data?.items ?? [], [data])
  const displayRows = useMemo(
    () =>
      envFilter === null
        ? allRows
        : allRows.filter((c: ConfigItem) => c.env === envFilter),
    [allRows, envFilter],
  )

  const queryExample = useMemo(() => {
    const base = 'GET /v1/configs?serviceName=…&environment=…'
    if (!serviceName) return base
    return `GET /v1/configs?serviceName=${encodeURIComponent(serviceName)}&environment=dev|stage|prod`
  }, [serviceName])

  return (
    <div className="page">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <span>{serviceName || '…'}</span>
      </nav>

      <header className="page-head page-head--split">
        <div>
          <h1>Конфигурации</h1>
          <p className="page-sub">
            <code>{queryExample}</code>
          </p>
        </div>
        {serviceName ? (
          <div className="env-filter">
            <label className="env-filter-label" htmlFor="service-config-env">
              Среда
            </label>
            <select
              id="service-config-env"
              className="env-filter-select"
              value={envFilter ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setEnvFilter(v === '' ? null : (v as EnvFilterChoice))
              }}
            >
              <option value="">Все среды</option>
              <option value="dev">dev</option>
              <option value="prod">prod</option>
            </select>
          </div>
        ) : null}
      </header>

      {!serviceName && !loading && (
        <p className="muted">Сервис не указан в адресе страницы.</p>
      )}

      {serviceName ? (
        <>
          {loading && <p className="muted">Загрузка…</p>}
          {error && <p className="error-banner">{error}</p>}

          {!loading && !error && data && displayRows.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ключ</th>
                    <th>Среда</th>
                    <th>Значение</th>
                    <th>Версия</th>
                    <th>Создан</th>
                    <th>Обновлён</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((c: ConfigItem) => (
                    <tr key={c.id}>
                      <td className="mono">{c.key}</td>
                      <td>
                        <span className={`pill pill--${pillModifier(c.env)}`}>
                          {envLabels[c.env] ?? c.env}
                        </span>
                      </td>
                      <td className="mono cell-value" title={c.value}>
                        {previewValue(c.value)}
                      </td>
                      <td className="mono">{c.version}</td>
                      <td className="mono">{c.createdAt}</td>
                      <td className="mono">{c.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-foot muted">
                Показано {displayRows.length} из {allRows.length}
              </p>
            </div>
          )}

          {!loading && !error && data && allRows.length === 0 && (
            <p className="muted">Для этого сервиса конфигураций нет.</p>
          )}

          {!loading && !error && data && allRows.length > 0 && displayRows.length === 0 && (
            <p className="muted">Для выбранной среды конфигураций нет.</p>
          )}
        </>
      ) : null}
    </div>
  )
}
