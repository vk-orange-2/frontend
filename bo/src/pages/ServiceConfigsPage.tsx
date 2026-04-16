import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchServiceConfigs } from '../api/client'
import type { ServiceConfigRow } from '../api/types'
import { editConfigPath } from './ServiceConfigEditorPages'

type EnvFilterChoice = 'dev' | 'stage' | 'prod'

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

function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return ''
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function ServiceConfigsPage() {
  const { serviceName: serviceNameParam } = useParams<{ serviceName: string }>()
  const serviceName = serviceNameParam ? decodeURIComponent(serviceNameParam) : ''

  const [rows, setRows] = useState<ServiceConfigRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [envFilter, setEnvFilter] = useState<EnvFilterChoice | null>(null)

  useEffect(() => {
    if (!serviceName) {
      setLoading(false)
      setRows(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchServiceConfigs(serviceName)
      .then((res) => {
        if (!cancelled) setRows(res)
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

  const allRows = useMemo(() => rows ?? [], [rows])
  const displayRows = useMemo(
    () =>
      envFilter === null
        ? allRows
        : allRows.filter((c: ServiceConfigRow) => c.environment === envFilter),
    [allRows, envFilter],
  )

  const totalRowsForSummary = useMemo(() => {
    if (envFilter === null) return allRows.length
    return allRows.filter((c: ServiceConfigRow) => c.environment === envFilter).length
  }, [allRows, envFilter])

  return (
    <div className="page">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <span>{serviceName || '…'}</span>
      </nav>

      <header className="page-head page-head--split">
        <div>
          <h1>Свойства</h1>
        </div>
        {serviceName ? (
          <div className="page-toolbar">
            <div className="env-filter">
              <label className="env-filter-label" htmlFor="service-config-env">
                Окружение
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
                <option value="">Все окружения</option>
                <option value="dev">dev</option>
                <option value="stage">stage</option>
                <option value="prod">prod</option>
              </select>
            </div>
            <Link
              className="btn btn--primary"
              to={`/services/${encodeURIComponent(serviceName)}/configs/new`}
            >
              Создать свойство
            </Link>
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

          {!loading && !error && rows && displayRows.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ключ</th>
                    <th>Среда</th>
                    <th>Значение (payload)</th>
                    <th>Версия</th>
                    <th className="data-table__actions-col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((c: ServiceConfigRow) => {
                    const valueStr = formatPayload(c.latestVersion.payload)
                    return (
                      <tr key={`${c.environment}:${c.configKey}`}>
                        <td className="mono">{c.configKey}</td>
                        <td>
                          <span className={`pill pill--${pillModifier(c.environment)}`}>
                            {envLabels[c.environment] ?? c.environment}
                          </span>
                        </td>
                        <td className="mono cell-value" title={valueStr}>
                          {previewValue(valueStr)}
                        </td>
                        <td className="mono">{c.currentVersion}</td>
                        <td className="data-table__actions">
                          <Link
                            className="btn btn--ghost btn--small"
                            to={editConfigPath(serviceName, c.environment, c.configKey)}
                          >
                            Изменить
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="table-foot muted">
                Показано {displayRows.length} из {totalRowsForSummary}
              </p>
            </div>
          )}

          {!loading && !error && rows && allRows.length === 0 && (
            <p className="muted">Для этого сервиса конфигураций нет.</p>
          )}

          {!loading && !error && rows && allRows.length > 0 && displayRows.length === 0 && (
            <p className="muted">Для выбранной среды конфигураций нет.</p>
          )}
        </>
      ) : null}
    </div>
  )
}
