import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  DEFAULT_AUDIT_PAGE_SIZE,
  fetchAuditSearch,
  fetchServices,
} from '../api/client'
import type { AuditLogEntry, ServiceResponse } from '../api/types'
import { versionHistoryPath } from './configPaths'

const operationOptions = [
  { value: '', label: 'Все типы' },
  { value: 'CREATE', label: 'Создание' },
  { value: 'UPDATE', label: 'Обновление' },
  { value: 'DELETE', label: 'Удаление' },
  { value: 'ROLLBACK', label: 'Откат версии' },
  { value: 'ROLLOUT_START', label: 'Запуск доставки' },
  { value: 'ROLLOUT_STOP', label: 'Остановка доставки' },
  { value: 'ROLLOUT_COMPLETE', label: 'Завершение доставки' },
  { value: 'ROLLOUT_ROLLBACK', label: 'Откат доставки' },
] as const

const operationLabel: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Обновление',
  DELETE: 'Удаление',
  ROLLBACK: 'Откат версии',
  ROLLOUT_START: 'Запуск доставки',
  ROLLOUT_STOP: 'Остановка доставки',
  ROLLOUT_COMPLETE: 'Завершение доставки',
  ROLLOUT_ROLLBACK: 'Откат доставки',
}

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return iso
  return new Date(d).toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

function formatDiffPreview(diff: unknown, max = 100): string {
  if (diff == null) return '—'
  if (typeof diff === 'string') {
    if (diff.length <= max) return diff
    return `${diff.slice(0, max)}…`
  }
  try {
    const s = JSON.stringify(diff)
    if (s.length <= max) return s
    return `${s.slice(0, max)}…`
  } catch {
    return '—'
  }
}

function formatVersionPair(
  before: number | null,
  after: number | null,
): string {
  const b = before == null ? '—' : String(before)
  const a = after == null ? '—' : String(after)
  return `${b} → ${a}`
}

/** ISO 8601 ↔ значение input[type=datetime-local] (локальная зона). */
function isoToLocalDatetimeValue(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

function localDatetimeToIso(local: string): string | undefined {
  if (!local.trim()) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

type AuditQuery = {
  serviceName: string
  actor: string
  operation: string
  fromIso: string
  toIso: string
  page: number
}

function readQueryFromParams(sp: URLSearchParams): AuditQuery {
  return {
    serviceName: sp.get('serviceName') ?? '',
    actor: sp.get('actor') ?? '',
    operation: sp.get('operation') ?? '',
    fromIso: sp.get('from') ?? '',
    toIso: sp.get('to') ?? '',
    page: Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0),
  }
}

function toSearchParams(q: AuditQuery, resetPage = false): URLSearchParams {
  const p = new URLSearchParams()
  if (q.serviceName) p.set('serviceName', q.serviceName)
  if (q.actor) p.set('actor', q.actor)
  if (q.operation) p.set('operation', q.operation)
  if (q.fromIso) p.set('from', q.fromIso)
  if (q.toIso) p.set('to', q.toIso)
  const page = resetPage ? 0 : q.page
  if (page > 0) p.set('page', String(page))
  return p
}

function pillModifier(env: string): string {
  if (env === 'dev' || env === 'stage' || env === 'prod') return env
  return 'other'
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = useMemo(() => readQueryFromParams(searchParams), [searchParams])

  const [draft, setDraft] = useState<AuditQuery>(query)
  const [services, setServices] = useState<ServiceResponse[] | null>(null)
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)

  const serviceId = useId()
  const actorId = useId()
  const opId = useId()
  const fromId = useId()
  const toId = useId()

  useEffect(() => {
    setDraft(query)
  }, [query])

  useEffect(() => {
    let cancelled = false
    fetchServices()
      .then((res) => {
        if (!cancelled) setServices(res)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setServicesError(
            e instanceof Error ? e.message : 'Не удалось загрузить сервисы',
          )
      })
    return () => {
      cancelled = true
    }
  }, [])

  const runFetch = useCallback(async (q: AuditQuery) => {
    setLoadError(null)
    setLoading(true)
    try {
      const res = await fetchAuditSearch({
        serviceName: q.serviceName || undefined,
        actor: q.actor || undefined,
        from: q.fromIso || undefined,
        to: q.toIso || undefined,
        operation: q.operation || undefined,
        page: q.page,
        size: DEFAULT_AUDIT_PAGE_SIZE,
      })
      setEntries(res.entries)
      setTotalCount(res.totalCount)
    } catch (e: unknown) {
      setEntries(null)
      setTotalCount(0)
      setLoadError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Не удалось загрузить журнал',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void runFetch(query)
  }, [query, runFetch])

  const applyFilters = useCallback(() => {
    setSearchParams(toSearchParams(draft, true))
  }, [draft, setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  const pageCount = Math.max(1, Math.ceil(totalCount / DEFAULT_AUDIT_PAGE_SIZE))
  const currentPageDisplay = query.page + 1

  const goPage = (next: number) => {
    if (next < 0) return
    if (next >= pageCount) return
    setSearchParams(toSearchParams({ ...query, page: next }))
  }

  return (
    <div className="page page--wide page--audit">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <span>Аудит</span>
      </nav>

      <header className="page-head page-head--split">
        <div>
          <h1>Журнал аудита</h1>
          <p className="page-sub muted">
            Изменения конфигураций. Фильтр по пользователю — точное совпадение с
            именем, переданным в запросе.
          </p>
        </div>
      </header>

      {servicesError && (
        <p className="error-banner" role="status">
          {servicesError} (список сервисов для фильтра не загружен)
        </p>
      )}

      <div className="audit-filters">
        <div className="env-filter">
          <label className="env-filter-label" htmlFor={serviceId}>
            Сервис
          </label>
          <select
            id={serviceId}
            className="env-filter-select audit-filters__select--grow"
            value={draft.serviceName}
            onChange={(e) =>
              setDraft((d) => ({ ...d, serviceName: e.target.value }))
            }
          >
            <option value="">Все сервисы</option>
            {(services ?? []).map((s) => (
              <option key={s.id || s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="env-filter audit-filters__text">
          <label className="env-filter-label" htmlFor={actorId}>
            Пользователь
          </label>
          <input
            id={actorId}
            type="text"
            className="config-form__input audit-filters__input"
            value={draft.actor}
            onChange={(e) =>
              setDraft((d) => ({ ...d, actor: e.target.value }))
            }
            placeholder="actor"
            autoComplete="off"
          />
        </div>

        <div className="env-filter">
          <label className="env-filter-label" htmlFor={opId}>
            Тип операции
          </label>
          <select
            id={opId}
            className="env-filter-select"
            value={draft.operation}
            onChange={(e) =>
              setDraft((d) => ({ ...d, operation: e.target.value }))
            }
          >
            {operationOptions.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="env-filter">
          <label className="env-filter-label" htmlFor={fromId}>
            С даты
          </label>
          <input
            id={fromId}
            type="datetime-local"
            className="config-form__input audit-filters__datetime"
            value={isoToLocalDatetimeValue(draft.fromIso)}
            onChange={(e) => {
              const v = e.target.value
              const iso = v ? localDatetimeToIso(v) : ''
              setDraft((d) => ({ ...d, fromIso: iso ?? '' }))
            }}
          />
        </div>

        <div className="env-filter">
          <label className="env-filter-label" htmlFor={toId}>
            По дату
          </label>
          <input
            id={toId}
            type="datetime-local"
            className="config-form__input audit-filters__datetime"
            value={isoToLocalDatetimeValue(draft.toIso)}
            onChange={(e) => {
              const v = e.target.value
              const iso = v ? localDatetimeToIso(v) : ''
              setDraft((d) => ({ ...d, toIso: iso ?? '' }))
            }}
          />
        </div>

        <div className="audit-filters__actions">
          <button type="button" className="btn btn--primary" onClick={applyFilters}>
            Применить
          </button>
          <button type="button" className="btn btn--ghost" onClick={clearFilters}>
            Сбросить
          </button>
        </div>
      </div>

      {loadError && <p className="error-banner">{loadError}</p>}

      {loading && <p className="muted">Загрузка…</p>}

      {!loading && !loadError && entries && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Операция</th>
                  <th>Сервис</th>
                  <th>Среда</th>
                  <th>Ключ</th>
                  <th>Пользователь</th>
                  <th>Версия</th>
                  <th>IP</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted">
                      Записей не найдено.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id}>
                      <td>{formatWhen(e.createdAt)}</td>
                      <td>
                        {operationLabel[e.operation] ?? e.operation}
                      </td>
                      <td>{e.serviceName || '—'}</td>
                      <td>
                        {e.environment ? (
                          <span
                            className={`pill pill--${pillModifier(e.environment)}`}
                          >
                            {e.environment}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell-value" title={e.configKey}>
                        {e.configKey && e.configId ? (
                          <Link
                            to={versionHistoryPath(
                              e.serviceName,
                              e.environment,
                              e.configKey,
                            )}
                          >
                            {e.configKey}
                          </Link>
                        ) : (
                          e.configKey || '—'
                        )}
                      </td>
                      <td className="cell-value" title={e.actor}>
                        {e.actor || '—'}
                      </td>
                      <td
                        className="cell-mono"
                        title={formatVersionPair(
                          e.versionBefore,
                          e.versionAfter,
                        )}
                      >
                        {formatVersionPair(e.versionBefore, e.versionAfter)}
                      </td>
                      <td className="cell-mono cell-value" title={e.sourceIp ?? ''}>
                        {e.sourceIp || '—'}
                      </td>
                      <td
                        className="cell-value cell-diff"
                        title={formatDiffPreview(e.diff, 4000)}
                      >
                        {formatDiffPreview(e.diff)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalCount > 0 && (
            <p className="table-foot table-foot--split">
              <span>
                Показано {entries.length} из {totalCount} · стр.{' '}
                {currentPageDisplay} / {pageCount}
              </span>
              <span className="table-foot__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={query.page <= 0}
                  onClick={() => goPage(query.page - 1)}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={query.page >= pageCount - 1}
                  onClick={() => goPage(query.page + 1)}
                >
                  Вперёд
                </button>
              </span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
