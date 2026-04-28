import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchConfigVersionHistory, fetchConfigsForEnvironment } from '../api/client'
import type { ConfigVersionEntry, ServiceConfigRow } from '../api/types'
import { configsListPath, editConfigPath } from './configPaths'

const changeTypeLabel: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  rollback: 'Откат',
}

function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return ''
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return iso
  return new Date(d).toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function pillModifier(env: string): string {
  if (env === 'dev' || env === 'stage' || env === 'prod') return env
  return 'other'
}

export function ConfigVersionHistoryPage() {
  const {
    serviceName: serviceNameParam,
    environment: environmentParam,
    configKey: configKeyParam,
  } = useParams<{
    serviceName: string
    environment: string
    configKey: string
  }>()

  const serviceName = serviceNameParam ? decodeURIComponent(serviceNameParam) : ''
  const environment = environmentParam ? decodeURIComponent(environmentParam) : ''
  const configKey = configKeyParam ? decodeURIComponent(configKeyParam) : ''

  const [row, setRow] = useState<ServiceConfigRow | null>(null)
  const [versions, setVersions] = useState<ConfigVersionEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!serviceName || !environment || !configKey) {
      setLoading(false)
      setRow(null)
      setVersions(null)
      setLoadError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setVersionsError(null)
    setVersions(null)
    setRow(null)

    let rowAfterFetch: ServiceConfigRow | null = null

    ;(async () => {
      try {
        const rows = await fetchConfigsForEnvironment(serviceName, environment)
        if (cancelled) return
        const found = rows.find((r) => r.configKey === configKey) ?? null
        setRow(found)
        rowAfterFetch = found
        if (!found) {
          setLoadError('Конфигурация не найдена')
          return
        }
        if (!found.id) {
          setLoadError(
            'Идентификатор конфигурации отсутствует: история версий недоступна',
          )
          return
        }
        const list = await fetchConfigVersionHistory(found.id)
        if (cancelled) return
        setVersions(list)
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить данные'
        if (rowAfterFetch?.id) setVersionsError(msg)
        else setLoadError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [serviceName, environment, configKey])

  if (!serviceName || !environment || !configKey) {
    return (
      <div className="page">
        <p className="muted">Некорректный адрес страницы.</p>
        <Link to="/">На главную</Link>
      </div>
    )
  }

  return (
    <div className="page page--wide">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <Link to={configsListPath(serviceName)}>{serviceName}</Link>
        <span aria-hidden="true"> / </span>
        <span>История версий</span>
      </nav>

      <header className="page-head page-head--split">
        <div>
          <h1>История версий</h1>
          <p className="page-sub version-history__subtitle">
            <code className="mono">{configKey}</code>
            {row ? (
              <>
                {' '}
                ·{' '}
                <span
                  className={`pill pill--${pillModifier(row.environment)}`}
                >
                  {row.environment}
                </span>
              </>
            ) : null}
          </p>
        </div>
        {row?.id ? (
          <div className="page-toolbar">
            <Link
              className="btn btn--ghost"
              to={editConfigPath(serviceName, environment, configKey)}
            >
              Редактировать
            </Link>
            <Link className="btn btn--ghost" to={configsListPath(serviceName)}>
              К списку
            </Link>
          </div>
        ) : null}
      </header>

      {loading && <p className="muted">Загрузка…</p>}

      {!loading && loadError && (
        <>
          <p className="error-banner">{loadError}</p>
          <Link className="btn btn--ghost" to={configsListPath(serviceName)}>
            К списку конфигураций
          </Link>
        </>
      )}

      {!loading && !loadError && row && row.id && versionsError && (
        <p className="error-banner">{versionsError}</p>
      )}

      {!loading && !loadError && row && row.id && !versionsError && versions && versions.length === 0 && (
        <p className="muted">Версий пока нет.</p>
      )}

      {!loading && !loadError && row && row.id && !versionsError && versions && versions.length > 0 && (
        <ol className="version-feed" aria-label="История изменений">
          {versions.map((v) => {
            const typeKey = v.changeType.toLowerCase()
            const typeText = changeTypeLabel[typeKey] ?? v.changeType
            return (
              <li key={v.id ?? `v${v.version}`} className="version-feed__item">
                <article className="version-card">
                  <div className="version-card__head">
                    <span className="version-card__ver mono">v{v.version}</span>
                    <span
                      className={`badge version-card__type version-card__type--${typeKey}`}
                      title={v.changeType}
                    >
                      {typeText}
                    </span>
                  </div>
                  <dl className="version-card__meta">
                    <div>
                      <dt>Автор</dt>
                      <dd className="mono">{v.author || '—'}</dd>
                    </div>
                    <div>
                      <dt>Время</dt>
                      <dd>{formatWhen(v.createdAt)}</dd>
                    </div>
                  </dl>
                  {v.comment ? <p className="version-card__comment">{v.comment}</p> : null}
                  <details className="version-card__payload">
                    <summary>Payload</summary>
                    <pre className="version-card__pre mono">
                      {v.payload == null
                        ? 'null'
                        : formatPayload(v.payload)}
                    </pre>
                  </details>
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
