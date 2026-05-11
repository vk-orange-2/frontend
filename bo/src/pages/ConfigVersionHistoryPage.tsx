import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiError,
  createRollout,
  deployNextRollout,
  fetchConfigVersionHistory,
  fetchConfigsForEnvironment,
  fetchRolloutsForConfig,
  rollbackConfig,
  rollbackRollout,
  stopRollout,
} from '../api/client'
import type { ConfigVersionEntry, RolloutResponse, ServiceConfigRow } from '../api/types'
import { ConfigVersionComparePanel } from './ConfigVersionComparePanel'
import { configsListPath, editConfigPath } from './configPaths'
import {
  DeliverRolloutDialog,
  type DeliverRolloutParams,
} from './ServiceConfigEditorPages'

/** Интервал опроса списка rollout на странице истории. */
const ROLLOUTS_POLL_INTERVAL_MS = 10_000

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
  return new Date(iso).toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function pillModifier(env: string): string {
  if (env === 'dev' || env === 'stage' || env === 'prod') return env
  return 'other'
}

function isActiveRolloutStatus(status: string): boolean {
  return status === 'pending' || status === 'in_progress'
}

const rolloutTypeLabel: Record<string, string> = {
  instant: 'Мгновенная',
  gradual: 'Постепенная',
}

const rolloutStatusLabel: Record<string, string> = {
  pending: 'Ожидание',
  in_progress: 'В процессе',
  completed: 'Завершена',
  stopped: 'Остановлена',
  rolled_back: 'Откат доставки',
}

function formatRolloutInstant(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—'
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return iso
  return new Date(iso).toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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

  const [rollouts, setRollouts] = useState<RolloutResponse[] | null>(null)
  const [rolloutsLoading, setRolloutsLoading] = useState(false)
  const [rolloutsError, setRolloutsError] = useState<string | null>(null)
  const [rolloutsOpen, setRolloutsOpen] = useState(false)

  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [deploySubmitting, setDeploySubmitting] = useState(false)
  const [deployDialogError, setDeployDialogError] = useState<string | null>(null)

  const [rolloutBannerAction, setRolloutBannerAction] = useState<
    null | 'stop' | 'deploy-next'
  >(null)
  const [rolloutBannerError, setRolloutBannerError] = useState<string | null>(null)

  const [rolloutRollbackPendingId, setRolloutRollbackPendingId] = useState<
    string | null
  >(null)
  const [rolloutTableError, setRolloutTableError] = useState<string | null>(null)

  const [rollbackTarget, setRollbackTarget] = useState<ConfigVersionEntry | null>(null)
  const [rollbackComment, setRollbackComment] = useState('')
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [rollbackResult, setRollbackResult] = useState<{
    newVersion: number
    fromVersion: number
  } | null>(null)

  const titleId = useId()
  const descId = useId()
  const rolloutsToggleId = useId()
  const rolloutsPanelId = useId()

  const refetchAfterRollback = useCallback(
    async (configId: string) => {
      const list = await fetchConfigVersionHistory(configId)
      setVersions(list)
      try {
        const ro = await fetchRolloutsForConfig(configId)
        setRollouts(ro)
        setRolloutsError(null)
      } catch (e: unknown) {
        setRolloutsError(
          e instanceof Error ? e.message : 'Не удалось обновить список доставки',
        )
      }
    },
    [],
  )

  const confirmRolloutFromHistory = useCallback(
    async (params: DeliverRolloutParams) => {
      if (!row?.id) return
      setDeployDialogError(null)
      setDeploySubmitting(true)
      try {
        await createRollout(
          {
            configId: row.id,
            type: params.type,
            ...(params.type === 'gradual'
              ? {
                  totalDeployments: params.totalDeployments,
                  deploymentIntervalSeconds: params.deploymentIntervalSeconds,
                }
              : {}),
          },
          { author: params.author },
        )
        setDeployDialogOpen(false)
        const ro = await fetchRolloutsForConfig(row.id)
        setRollouts(ro)
        setRolloutsError(null)
        setRolloutsOpen(true)
      } catch (e: unknown) {
        setDeployDialogError(
          e instanceof Error ? e.message : 'Не удалось запустить доставку',
        )
      } finally {
        setDeploySubmitting(false)
      }
    },
    [row?.id],
  )

  const refetchRolloutsOnly = useCallback(async () => {
    if (!row?.id) return
    try {
      const ro = await fetchRolloutsForConfig(row.id)
      setRollouts(ro)
      setRolloutsError(null)
    } catch (e: unknown) {
      setRolloutsError(
        e instanceof Error ? e.message : 'Не удалось обновить список доставки',
      )
    }
  }, [row?.id])

  const handleBannerStop = useCallback(async () => {
    if (!rollouts) return
    const active = rollouts.find((r) => isActiveRolloutStatus(r.status))
    if (!active?.id) return
    setRolloutBannerError(null)
    setRolloutBannerAction('stop')
    try {
      await stopRollout(active.id)
      await refetchRolloutsOnly()
    } catch (e: unknown) {
      setRolloutBannerError(
        e instanceof Error ? e.message : 'Не удалось остановить доставку',
      )
    } finally {
      setRolloutBannerAction(null)
    }
  }, [rollouts, refetchRolloutsOnly])

  const handleBannerDeployNext = useCallback(async () => {
    if (!rollouts) return
    const active = rollouts.find((r) => isActiveRolloutStatus(r.status))
    if (!active?.id) return
    setRolloutBannerError(null)
    setRolloutBannerAction('deploy-next')
    try {
      await deployNextRollout(active.id)
      await refetchRolloutsOnly()
    } catch (e: unknown) {
      setRolloutBannerError(
        e instanceof Error ? e.message : 'Не удалось выполнить следующий этап',
      )
    } finally {
      setRolloutBannerAction(null)
    }
  }, [rollouts, refetchRolloutsOnly])

  const handleRolloutTableRollback = useCallback(
    async (ro: RolloutResponse) => {
      if (!isActiveRolloutStatus(ro.status) || !ro.id) return
      if (!row?.id || !serviceName || !environment || !configKey) return
      const configId = row.id
      setRolloutTableError(null)
      setRolloutRollbackPendingId(ro.id)
      try {
        await rollbackRollout(ro.id)
        const [cfgRows, hist, rolloutList] = await Promise.all([
          fetchConfigsForEnvironment(serviceName, environment),
          fetchConfigVersionHistory(configId),
          fetchRolloutsForConfig(configId),
        ])
        const found = cfgRows.find((r) => r.configKey === configKey) ?? null
        setRow(found)
        setVersions(hist)
        setVersionsError(null)
        setRollouts(rolloutList)
        setRolloutsError(null)
      } catch (e: unknown) {
        setRolloutTableError(
          e instanceof Error ? e.message : 'Не удалось откатить доставку',
        )
      } finally {
        setRolloutRollbackPendingId(null)
      }
    },
    [row?.id, serviceName, environment, configKey],
  )

  const closeRollbackDialog = useCallback(() => {
    if (rollbackSubmitting) return
    setRollbackTarget(null)
    setRollbackComment('')
    setRollbackError(null)
  }, [rollbackSubmitting])

  const confirmRollback = useCallback(async () => {
    if (!row?.id || !rollbackTarget) return
    setRollbackSubmitting(true)
    setRollbackError(null)
    const configId = row.id
    const fromVer = rollbackTarget.version
    try {
      const res = await rollbackConfig(configId, {
        targetVersion: rollbackTarget.version,
        expectedVersion: row.currentVersion,
        comment: rollbackComment.trim() ? rollbackComment.trim() : undefined,
      })
      setRow((prev) =>
        prev
          ? {
              ...prev,
              currentVersion: res.currentVersion,
              latestVersion: res.latestVersion,
              updatedAt: res.updatedAt ?? prev.updatedAt,
            }
          : null,
      )
      await refetchAfterRollback(configId)
      setRollbackResult({
        newVersion: res.currentVersion,
        fromVersion: fromVer,
      })
      setRollbackTarget(null)
      setRollbackComment('')
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Не удалось выполнить откат'
      setRollbackError(msg)
    } finally {
      setRollbackSubmitting(false)
    }
  }, [
    row,
    rollbackTarget,
    rollbackComment,
    refetchAfterRollback,
  ])

  useEffect(() => {
    if (!rollbackTarget) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !rollbackSubmitting) {
        setRollbackTarget(null)
        setRollbackError(null)
        setRollbackComment('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rollbackTarget, rollbackSubmitting])

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
    setRollbackResult(null)
    setRollbackError(null)
    setRollbackTarget(null)
    setRollbackComment('')

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

  useEffect(() => {
    if (!row?.id) {
      setRollouts(null)
      setRolloutsLoading(false)
      setRolloutsError(null)
      return
    }
    const configId = row.id
    let cancelled = false

    async function loadRollouts(isInitial: boolean) {
      if (isInitial) {
        setRolloutsLoading(true)
        setRolloutsError(null)
      }
      try {
        const list = await fetchRolloutsForConfig(configId)
        if (!cancelled) {
          setRollouts(list)
          setRolloutsError(null)
          if (isInitial) setRolloutsLoading(false)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            e instanceof Error ? e.message : 'Не удалось загрузить доставку'
          if (isInitial) {
            setRollouts([])
            setRolloutsLoading(false)
          }
          setRolloutsError(msg)
        }
      }
    }

    void loadRollouts(true)

    const intervalId = window.setInterval(() => {
      void loadRollouts(false)
    }, ROLLOUTS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [row?.id])

  if (!serviceName || !environment || !configKey) {
    return (
      <div className="page">
        <p className="muted">Некорректный адрес страницы.</p>
        <Link to="/">На главную</Link>
      </div>
    )
  }

  const activeRolloutBanner =
    rollouts?.find((r) => isActiveRolloutStatus(r.status)) ?? null

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
            <button
              type="button"
              className="btn btn--primary"
              disabled={
                rolloutsLoading ||
                Boolean(activeRolloutBanner) ||
                deploySubmitting
              }
              title={
                rolloutsLoading
                  ? 'Загрузка состояния доставки…'
                  : activeRolloutBanner
                    ? 'Уже есть активная доставка для этого конфига'
                    : undefined
              }
              onClick={() => {
                setDeployDialogError(null)
                setDeployDialogOpen(true)
              }}
            >
              Раскатить конфиг
            </button>
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

      {!loading && !loadError && row && row.id && (
        <div className="rollouts-delivery-section">
          {!rolloutsLoading && activeRolloutBanner ? (
            <>
              <div className="rollout-banner rollout-banner--compact" role="status">
                <p className="rollout-banner__head">Активная доставка</p>
                <p className="rollout-banner__meta mono">
                  Тип:{' '}
                  {rolloutTypeLabel[activeRolloutBanner.type] ??
                    activeRolloutBanner.type}{' '}
                  · Статус:{' '}
                  {rolloutStatusLabel[activeRolloutBanner.status] ??
                    activeRolloutBanner.status}
                  <br />
                  Версии: {activeRolloutBanner.baselineVersion} →{' '}
                  {activeRolloutBanner.targetVersion} · Этап{' '}
                  {activeRolloutBanner.currentDeployment}/
                  {activeRolloutBanner.totalDeployments}
                  <br />
                  Следующий этап:{' '}
                  {activeRolloutBanner.nextDeploymentAt != null &&
                  activeRolloutBanner.nextDeploymentAt !== ''
                    ? formatRolloutInstant(activeRolloutBanner.nextDeploymentAt)
                    : '—'}
                </p>
                <div className="rollout-banner__actions">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={
                      rolloutBannerAction != null || rolloutRollbackPendingId !== null
                    }
                    onClick={() => void handleBannerStop()}
                  >
                    {rolloutBannerAction === 'stop' ? 'Остановка…' : 'Отменить'}
                  </button>
                  {activeRolloutBanner.type === 'gradual' ? (
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      disabled={
                        rolloutBannerAction != null || rolloutRollbackPendingId !== null
                      }
                      onClick={() => void handleBannerDeployNext()}
                    >
                      {rolloutBannerAction === 'deploy-next'
                        ? 'Этап…'
                        : 'Следующий этап'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={
                      rolloutBannerAction != null || rolloutRollbackPendingId !== null
                    }
                    title="Откатить доставку к baseline (новая версия конфига)"
                    onClick={() => void handleRolloutTableRollback(activeRolloutBanner)}
                  >
                    {rolloutRollbackPendingId === activeRolloutBanner.id
                      ? 'Откат…'
                      : 'Откатить'}
                  </button>
                </div>
              </div>
              {rolloutBannerError ? (
                <p className="error-banner" role="alert">
                  {rolloutBannerError}
                </p>
              ) : null}
            </>
          ) : null}

          <div className="rollouts-disclosure">
            <button
              type="button"
              id={rolloutsToggleId}
              className="rollouts-disclosure__toggle"
              aria-expanded={rolloutsOpen}
              aria-controls={rolloutsPanelId}
              onClick={() => setRolloutsOpen((o) => !o)}
            >
              <span className="rollouts-disclosure__chevron" aria-hidden="true">
                {rolloutsOpen ? '▼' : '▶'}
              </span>
              <span>
                {rolloutsOpen ? 'Скрыть' : 'Показать'} историю доставки
                {!rolloutsOpen && rollouts && rollouts.length > 0 ? (
                  <span className="muted"> ({rollouts.length})</span>
                ) : null}
              </span>
            </button>

            {rolloutsOpen ? (
              <div
                id={rolloutsPanelId}
                className="rollouts-disclosure__panel"
                role="region"
                aria-labelledby={rolloutsToggleId}
              >
                {rolloutsLoading && (
                  <p className="muted">Загрузка состояния доставки…</p>
                )}

                {!rolloutsLoading && rolloutsError && (
                  <p className="error-banner">{rolloutsError}</p>
                )}

                {!rolloutsLoading && rolloutTableError && (
                  <p className="error-banner" role="alert">
                    {rolloutTableError}
                  </p>
                )}

                {!rolloutsLoading &&
                  !rolloutsError &&
                  rollouts &&
                  rollouts.length > 0 && (
                    <section
                      className="rollouts-history"
                      aria-labelledby="rollouts-history-title"
                    >
                      <h2 id="rollouts-history-title" className="rollouts-history__title">
                        Доставка конфигурации
                      </h2>
                      <div className="table-wrap rollouts-history__table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Создан</th>
                              <th>Тип</th>
                              <th>Статус</th>
                              <th>Версии</th>
                              <th>Этап</th>
                              <th>Завершение</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rollouts.map((ro) => {
                              const endLabel =
                                ro.rolledBackAt != null && ro.rolledBackAt !== ''
                                  ? formatRolloutInstant(ro.rolledBackAt)
                                  : ro.stoppedAt != null && ro.stoppedAt !== ''
                                    ? formatRolloutInstant(ro.stoppedAt)
                                    : ro.completedAt != null && ro.completedAt !== ''
                                      ? formatRolloutInstant(ro.completedAt)
                                      : '—'
                              return (
                                <tr key={ro.id}>
                                  <td>{formatRolloutInstant(ro.createdAt)}</td>
                                  <td>{rolloutTypeLabel[ro.type] ?? ro.type}</td>
                                  <td>{rolloutStatusLabel[ro.status] ?? ro.status}</td>
                                  <td className="mono">
                                    {ro.baselineVersion} → {ro.targetVersion}
                                  </td>
                                  <td className="mono">
                                    {ro.currentDeployment}/{ro.totalDeployments}
                                  </td>
                                  <td>{endLabel}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                {!rolloutsLoading &&
                  !rolloutsError &&
                  rollouts &&
                  rollouts.length === 0 && (
                    <p className="muted">
                      Записей о доставке (rollout) для этого ключа пока нет.
                    </p>
                  )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!loading && !loadError && row && row.id && !versionsError && rollbackResult && (
        <div
          className="success-banner"
          role="status"
          aria-live="polite"
        >
          <p className="success-banner__text">
            Откат выполнен. Создана новая версия{' '}
            <span className="mono">v{rollbackResult.newVersion}</span> с состоянием payload,
            соответствующим версии <span className="mono">v{rollbackResult.fromVersion}</span>.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setRollbackResult(null)}
          >
            Скрыть
          </button>
        </div>
      )}

      {!loading && !loadError && row && row.id && !versionsError && versions && versions.length === 0 && (
        <p className="muted">Версий пока нет.</p>
      )}

      {!loading && !loadError && row && row.id && !versionsError && versions && versions.length > 0 && (
        <ConfigVersionComparePanel versions={versions} />
      )}

      {!loading && !loadError && row && row.id && !versionsError && versions && versions.length > 0 && (
        <ol className="version-feed" aria-label="История изменений">
          {versions.map((v) => {
            const typeKey = v.changeType.toLowerCase()
            const typeText = changeTypeLabel[typeKey] ?? v.changeType
            const isHead = v.version === row.currentVersion
            const canRollback = v.version < row.currentVersion
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
                    {isHead ? (
                      <span className="badge version-card__head-badge" title="Текущая версия конфигурации">
                        Текущая
                      </span>
                    ) : null}
                  </div>
                  {canRollback ? (
                    <div className="version-card__actions">
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        onClick={() => {
                          setRollbackResult(null)
                          setRollbackTarget(v)
                          setRollbackError(null)
                        }}
                      >
                        Откатить к этой версии
                      </button>
                    </div>
                  ) : null}
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

      <DeliverRolloutDialog
        open={deployDialogOpen}
        onClose={() => setDeployDialogOpen(false)}
        dialogTitle="Раскатить конфиг"
        description="Будет запущена доставка текущей версии конфигурации клиентам (без изменения payload)."
        error={deployDialogError}
        submitting={deploySubmitting}
        confirmLabel="Запустить доставку"
        onConfirm={confirmRolloutFromHistory}
      />

      {rollbackTarget && row?.id ? (
        <div
          className="rollback-dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeRollbackDialog()
          }}
        >
          <div
            className="rollback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
          >
            <h2 id={titleId} className="rollback-dialog__title">
              Подтверждение отката
            </h2>
            <p id={descId} className="rollback-dialog__text">
              В истории появится <strong>новая версия</strong>: payload конфигурации совпадёт
              с содержимым <span className="mono">v{rollbackTarget.version}</span>. Сейчас
              на сервере зафиксирована <span className="mono">v{row.currentVersion}</span> —
              при расхождении запрос отклонится, обновите страницу.
            </p>
            {rollbackError ? (
              <p className="error-banner rollback-dialog__err" role="alert">
                {rollbackError}
              </p>
            ) : null}
            <label className="rollback-dialog__field">
              <span className="rollback-dialog__label">Комментарий (необязательно)</span>
              <textarea
                className="config-form__input rollback-dialog__textarea"
                value={rollbackComment}
                onChange={(e) => setRollbackComment(e.target.value)}
                rows={2}
                disabled={rollbackSubmitting}
              />
            </label>
            <div className="rollback-dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeRollbackDialog}
                disabled={rollbackSubmitting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  void confirmRollback()
                }}
                disabled={rollbackSubmitting}
              >
                {rollbackSubmitting ? 'Выполняется…' : 'Подтвердить откат'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
