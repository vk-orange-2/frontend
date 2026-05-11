import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createOrUpdateConfig,
  createRollout,
  deployNextRollout,
  fetchActiveRolloutForConfig,
  fetchConfigsForEnvironment,
  rollbackRollout,
  stopRollout,
} from '../api/client'
import type { RolloutResponse, ServiceConfigRow } from '../api/types'
import { configsListPath, versionHistoryPath } from './configPaths'

function isActiveRolloutStatus(status: string): boolean {
  return status === 'pending' || status === 'in_progress'
}

function formatInstant(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—'
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return iso
  return new Date(d).toLocaleString()
}

type EnvChoice = 'dev' | 'stage' | 'prod'

function parseConfigValue(raw: string): unknown {
  const t = raw.trim()
  if (!t) throw new Error('Укажите значение (value)')
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function formatPayloadForEditor(payload: unknown): string {
  if (payload === null || payload === undefined) return ''
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

function ConfigFormShell(props: {
  title: string
  serviceName: string
  children: ReactNode
  onSubmit: (e: FormEvent) => void
  submitting: boolean
  error: string | null
  submitLabel: string
  submitDisabled?: boolean
  beforeSubmit?: ReactNode
}) {
  const {
    title,
    serviceName,
    children,
    onSubmit,
    submitting,
    error,
    submitLabel,
    submitDisabled,
    beforeSubmit,
  } = props
  const saveBlocked = Boolean(submitting || submitDisabled)
  return (
    <div className="page">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <Link to={configsListPath(serviceName)}>{serviceName}</Link>
        <span aria-hidden="true"> / </span>
        <span>{title}</span>
      </nav>

      {error ? <p className="error-banner">{error}</p> : null}

      <form className="config-form" onSubmit={onSubmit}>
        {children}
        <div className="config-form__actions">
          {beforeSubmit}
          <button type="submit" className="btn btn--primary" disabled={saveBlocked}>
            {submitting ? 'Сохранение…' : submitLabel}
          </button>
          <Link className="btn btn--ghost" to={configsListPath(serviceName)}>
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}

/** Параметры из модалки «Сохранить и доставить». */
export type DeliverRolloutParams = {
  type: 'instant' | 'gradual'
  totalDeployments?: number
  deploymentIntervalSeconds?: number
  author?: string
}

export function DeliverRolloutDialog(props: {
  open: boolean
  onClose: () => void
  description: string
  error: string | null
  submitting: boolean
  onConfirm: (params: DeliverRolloutParams) => void | Promise<void>
  /** По умолчанию: «Сохранить и доставить». */
  dialogTitle?: string
  /** По умолчанию: «Сохранить и запустить». */
  confirmLabel?: string
}) {
  const {
    open,
    onClose,
    description,
    error,
    submitting,
    onConfirm,
    dialogTitle = 'Сохранить и доставить',
    confirmLabel = 'Сохранить и запустить',
  } = props
  const titleId = useId()
  const descId = useId()
  const radioName = useId()
  const stepsId = useId()
  const intervalId = useId()
  const authorId = useId()

  const [deliverType, setDeliverType] = useState<'instant' | 'gradual'>('instant')
  const [deliverTotalDeployments, setDeliverTotalDeployments] = useState(4)
  const [deliverInterval, setDeliverInterval] = useState(60)
  const [deliverAuthor, setDeliverAuthor] = useState('')

  if (!open) return null

  function handleConfirm() {
    const params: DeliverRolloutParams = {
      type: deliverType,
      ...(deliverType === 'gradual'
        ? {
            totalDeployments: deliverTotalDeployments,
            deploymentIntervalSeconds: deliverInterval,
          }
        : {}),
      ...(deliverAuthor.trim() !== '' ? { author: deliverAuthor.trim() } : {}),
    }
    void onConfirm(params)
  }

  return (
    <div
      className="rollback-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
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
          {dialogTitle}
        </h2>
        <p id={descId} className="rollback-dialog__text">
          {description}
        </p>
        {error ? (
          <p className="error-banner rollback-dialog__err" role="alert">
            {error}
          </p>
        ) : null}

        <fieldset className="rollback-dialog__fieldset-plain">
          <legend className="rollback-dialog__label">Тип доставки</legend>
          <label className="rollback-dialog__field">
            <input
              type="radio"
              name={radioName}
              checked={deliverType === 'instant'}
              onChange={() => setDeliverType('instant')}
            />{' '}
            Мгновенно всем
          </label>
          <label className="rollback-dialog__field">
            <input
              type="radio"
              name={radioName}
              checked={deliverType === 'gradual'}
              onChange={() => setDeliverType('gradual')}
            />{' '}
            Постепенно
          </label>
        </fieldset>

        {deliverType === 'gradual' ? (
          <>
            <label className="rollback-dialog__field" htmlFor={stepsId}>
              <span className="rollback-dialog__label">Число этапов (1–100)</span>
              <input
                id={stepsId}
                className="config-form__input"
                type="number"
                min={1}
                max={100}
                value={deliverTotalDeployments}
                onChange={(ev) =>
                  setDeliverTotalDeployments(
                    Math.min(100, Math.max(1, Number.parseInt(ev.target.value, 10) || 1)),
                  )
                }
              />
            </label>
            <label className="rollback-dialog__field" htmlFor={intervalId}>
              <span className="rollback-dialog__label">Интервал между этапами (сек)</span>
              <input
                id={intervalId}
                className="config-form__input"
                type="number"
                min={0}
                value={deliverInterval}
                onChange={(ev) =>
                  setDeliverInterval(Math.max(0, Number.parseInt(ev.target.value, 10) || 0))
                }
              />
            </label>
          </>
        ) : null}

        <label className="rollback-dialog__field" htmlFor={authorId}>
          <span className="rollback-dialog__label">Автор в журнале (необязательно)</span>
          <input
            id={authorId}
            className="config-form__input mono"
            value={deliverAuthor}
            onChange={(ev) => setDeliverAuthor(ev.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="X-Author"
          />
        </label>

        <div className="rollback-dialog__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={submitting}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Выполняется…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ServiceConfigCreatePage() {
  const { serviceName: serviceNameParam } = useParams<{ serviceName: string }>()
  const serviceName = serviceNameParam ? decodeURIComponent(serviceNameParam) : ''
  const navigate = useNavigate()

  const [env, setEnv] = useState<EnvChoice>('dev')
  const [configKey, setConfigKey] = useState('')
  const [valueText, setValueText] = useState('{\n  \n}')
  const [isSecret, setIsSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false)
  const [deliverError, setDeliverError] = useState<string | null>(null)
  const [deliverSubmitting, setDeliverSubmitting] = useState(false)

  const canSubmit = useMemo(
    () => Boolean(serviceName && configKey.trim()),
    [serviceName, configKey],
  )

  async function onConfirmCreateDeliver(params: DeliverRolloutParams) {
    if (!serviceName) return
    setDeliverError(null)
    let value: unknown
    try {
      value = parseConfigValue(valueText)
    } catch (err) {
      setDeliverError(err instanceof Error ? err.message : 'Некорректное значение')
      return
    }
    setDeliverSubmitting(true)
    try {
      const created = await createOrUpdateConfig({
        service: serviceName,
        env,
        key: configKey.trim(),
        value,
        ...(isSecret ? { isSecret: true } : {}),
      })
      const configId = created.id
      if (!configId) {
        setDeliverError('У конфигурации нет id — нельзя запустить доставку.')
        return
      }
      await createRollout(
        {
          configId,
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
      setDeliverDialogOpen(false)
      navigate(configsListPath(serviceName))
    } catch (err) {
      setDeliverError(
        err instanceof Error ? err.message : 'Не удалось создать конфигурацию или запустить доставку',
      )
    } finally {
      setDeliverSubmitting(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!serviceName) return
    setError(null)
    let value: unknown
    try {
      value = parseConfigValue(valueText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Некорректное значение')
      return
    }
    setSubmitting(true)
    try {
      await createOrUpdateConfig({
        service: serviceName,
        env,
        key: configKey.trim(),
        value,
        ...(isSecret ? { isSecret: true } : {}),
      })
      navigate(configsListPath(serviceName))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setSubmitting(false)
    }
  }

  if (!serviceName) {
    return (
      <div className="page">
        <p className="muted">Сервис не указан в адресе страницы.</p>
        <Link to="/">На главную</Link>
      </div>
    )
  }

  return (
    <>
      <ConfigFormShell
        title="создание свойства"
        serviceName={serviceName}
        onSubmit={onSubmit}
        submitting={submitting}
        error={error}
        submitLabel="Создать"
        beforeSubmit={
          <button
            type="button"
            className="btn btn--secondary"
            disabled={submitting || !canSubmit}
            onClick={() => {
              setDeliverError(null)
              setDeliverDialogOpen(true)
            }}
          >
            Сохранить и доставить
          </button>
        }
      >
        <label className="config-form__field">
          <span className="config-form__label">Среда</span>
          <select
            className="config-form__input"
            value={env}
            onChange={(ev) => setEnv(ev.target.value as EnvChoice)}
          >
            <option value="dev">dev</option>
            <option value="stage">stage</option>
            <option value="prod">prod</option>
          </select>
        </label>

        <label className="config-form__field">
          <span className="config-form__label">Ключ</span>
          <input
            className="config-form__input mono"
            value={configKey}
            onChange={(ev) => setConfigKey(ev.target.value)}
            placeholder="feature_flags"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="config-form__field config-form__field--checkbox">
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(ev) => setIsSecret(ev.target.checked)}
          />{' '}
          <span>Секретное значение</span>
          <span className="muted config-form__checkbox-hint">
            В списке свойств и в истории версий payload не показывается; в редакторе значение по-прежнему
            доступно после сохранения.
          </span>
        </label>

        <label className="config-form__field">
          <span className="config-form__label">Значение</span>
          <textarea
            className="config-form__textarea mono"
            value={valueText}
            onChange={(ev) => setValueText(ev.target.value)}
            rows={14}
            spellCheck={false}
          />
        </label>

        {!canSubmit ? (
          <p className="muted config-form__hint">Укажите ключ конфигурации.</p>
        ) : null}
      </ConfigFormShell>

      <DeliverRolloutDialog
        open={deliverDialogOpen}
        onClose={() => setDeliverDialogOpen(false)}
        description="Сначала будет создана конфигурация, затем запущена доставка клиентам."
        error={deliverError}
        submitting={deliverSubmitting}
        onConfirm={onConfirmCreateDeliver}
      />
    </>
  )
}

export function ServiceConfigEditPage() {
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
  const navigate = useNavigate()

  const [valueText, setValueText] = useState('')
  const [row, setRow] = useState<ServiceConfigRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [activeRollout, setActiveRollout] = useState<RolloutResponse | null>(null)
  const [rolloutLoading, setRolloutLoading] = useState(false)
  const [rolloutLoadError, setRolloutLoadError] = useState<string | null>(null)
  const [rolloutMutationError, setRolloutMutationError] = useState<string | null>(null)
  const [rolloutAction, setRolloutAction] = useState<
    null | 'stop' | 'rollback' | 'deploy-next'
  >(null)

  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false)
  const [deliverSubmitting, setDeliverSubmitting] = useState(false)
  const [deliverError, setDeliverError] = useState<string | null>(null)

  useEffect(() => {
    if (!serviceName || !environment || !configKey) {
      setLoading(false)
      setRow(null)
      setLoadError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchConfigsForEnvironment(serviceName, environment)
      .then((rows) => {
        if (cancelled) return
        const found = rows.find((r) => r.configKey === configKey) ?? null
        setRow(found)
        if (found) setValueText(formatPayloadForEditor(found.latestVersion.payload))
        else setLoadError('Конфигурация не найдена')
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить конфигурацию')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [serviceName, environment, configKey])

  useEffect(() => {
    if (!row?.id) {
      setActiveRollout(null)
      setRolloutLoading(false)
      setRolloutLoadError(null)
      return
    }
    let cancelled = false
    setRolloutLoading(true)
    setRolloutLoadError(null)
    fetchActiveRolloutForConfig(row.id)
      .then((r) => {
        if (!cancelled) setActiveRollout(r)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setRolloutLoadError(
            e instanceof Error ? e.message : 'Не удалось загрузить состояние доставки',
          )
      })
      .finally(() => {
        if (!cancelled) setRolloutLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [row?.id])

  const rolloutIsActive =
    activeRollout != null && isActiveRolloutStatus(activeRollout.status)

  async function reloadEditorData() {
    if (!serviceName || !environment || !configKey) return
    const rows = await fetchConfigsForEnvironment(serviceName, environment)
    const found = rows.find((r) => r.configKey === configKey) ?? null
    setRow(found)
    if (found) {
      setValueText(formatPayloadForEditor(found.latestVersion.payload))
      if (found.id) {
        const ar = await fetchActiveRolloutForConfig(found.id)
        setActiveRollout(ar)
      } else {
        setActiveRollout(null)
      }
    } else {
      setActiveRollout(null)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!serviceName || !environment || !configKey || !row) return
    setError(null)
    let value: unknown
    try {
      value = parseConfigValue(valueText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Некорректное значение')
      return
    }
    setSubmitting(true)
    try {
      await createOrUpdateConfig({
        service: serviceName,
        env: environment,
        key: configKey,
        value,
        expectedVersion: row.currentVersion,
      })
      navigate(configsListPath(serviceName))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setSubmitting(false)
    }
  }

  async function onConfirmDeliver(params: DeliverRolloutParams) {
    if (!serviceName || !environment || !configKey || !row) return
    setDeliverError(null)
    let value: unknown
    try {
      value = parseConfigValue(valueText)
    } catch (err) {
      setDeliverError(err instanceof Error ? err.message : 'Некорректное значение')
      return
    }
    setDeliverSubmitting(true)
    try {
      const updated = await createOrUpdateConfig({
        service: serviceName,
        env: environment,
        key: configKey,
        value,
        expectedVersion: row.currentVersion,
      })
      const configId = updated.id ?? row.id
      if (!configId) {
        setDeliverError('У конфигурации нет id — нельзя запустить доставку.')
        return
      }
      await createRollout(
        {
          configId,
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
      setDeliverDialogOpen(false)
      navigate(configsListPath(serviceName))
    } catch (err) {
      setDeliverError(
        err instanceof Error ? err.message : 'Не удалось сохранить или запустить доставку',
      )
    } finally {
      setDeliverSubmitting(false)
    }
  }

  async function handleRolloutStop() {
    if (!activeRollout?.id) return
    setRolloutMutationError(null)
    setRolloutAction('stop')
    try {
      await stopRollout(activeRollout.id)
      await reloadEditorData()
    } catch (err) {
      setRolloutMutationError(
        err instanceof Error ? err.message : 'Не удалось остановить доставку',
      )
    } finally {
      setRolloutAction(null)
    }
  }

  async function handleRolloutDeployNext() {
    if (!activeRollout?.id) return
    setRolloutMutationError(null)
    setRolloutAction('deploy-next')
    try {
      await deployNextRollout(activeRollout.id)
      await reloadEditorData()
    } catch (err) {
      setRolloutMutationError(
        err instanceof Error ? err.message : 'Не удалось выполнить следующий этап',
      )
    } finally {
      setRolloutAction(null)
    }
  }

  async function handleRolloutRollback() {
    if (!activeRollout?.id) return
    setRolloutMutationError(null)
    setRolloutAction('rollback')
    try {
      await rollbackRollout(activeRollout.id)
      await reloadEditorData()
    } catch (err) {
      setRolloutMutationError(
        err instanceof Error ? err.message : 'Не удалось откатить доставку',
      )
    } finally {
      setRolloutAction(null)
    }
  }

  if (!serviceName || !environment || !configKey) {
    return (
      <div className="page">
        <p className="muted">Некорректный адрес страницы.</p>
        <Link to="/">На главную</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page">
        <nav className="breadcrumb">
          <Link to="/">Сервисы</Link>
          <span aria-hidden="true"> / </span>
          <Link to={configsListPath(serviceName)}>{serviceName}</Link>
        </nav>
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  if (loadError || !row) {
    return (
      <div className="page">
        <nav className="breadcrumb">
          <Link to="/">Сервисы</Link>
          <span aria-hidden="true"> / </span>
          <Link to={configsListPath(serviceName)}>{serviceName}</Link>
        </nav>
        <p className="error-banner">{loadError ?? 'Конфигурация не найдена'}</p>
        <Link className="btn btn--ghost" to={configsListPath(serviceName)}>
          К списку конфигураций
        </Link>
      </div>
    )
  }

  const blockEdits = rolloutIsActive

  return (
    <>
      <ConfigFormShell
        title="редактирование"
        serviceName={serviceName}
        onSubmit={onSubmit}
        submitting={submitting}
        error={error}
        submitLabel="Сохранить"
        submitDisabled={blockEdits}
        beforeSubmit={
          <button
            type="button"
            className="btn btn--secondary"
            disabled={submitting || blockEdits || !row.id}
            onClick={() => {
              setDeliverError(null)
              setDeliverDialogOpen(true)
            }}
          >
            Сохранить и доставить
          </button>
        }
      >
        {row.id && rolloutLoading ? (
          <p className="muted config-form__hint">Состояние доставки: загрузка…</p>
        ) : null}
        {rolloutLoadError ? <p className="error-banner">{rolloutLoadError}</p> : null}
        {rolloutIsActive && activeRollout ? (
          <div className="rollout-banner" role="status">
            <p className="rollout-banner__head">Активная доставка конфигурации</p>
            <p className="rollout-banner__meta mono">
              Тип: {activeRollout.type} · Статус: {activeRollout.status}
              <br />
              Версии: {activeRollout.baselineVersion} → {activeRollout.targetVersion} · Этап{' '}
              {activeRollout.currentDeployment}/{activeRollout.totalDeployments}
              <br />
              Следующий этап: {formatInstant(activeRollout.nextDeploymentAt)}
            </p>
            <div className="rollout-banner__actions">
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={rolloutAction != null}
                onClick={() => void handleRolloutStop()}
              >
                {rolloutAction === 'stop' ? 'Остановка…' : 'Остановить'}
              </button>
              {activeRollout.type === 'gradual' ? (
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={rolloutAction != null}
                  onClick={() => void handleRolloutDeployNext()}
                >
                  {rolloutAction === 'deploy-next' ? 'Этап…' : 'Следующий этап'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={rolloutAction != null}
                onClick={() => void handleRolloutRollback()}
              >
                {rolloutAction === 'rollback' ? 'Откат…' : 'Откатить доставку'}
              </button>
            </div>
          </div>
        ) : null}
        {rolloutMutationError ? (
          <p className="error-banner" role="alert">
            {rolloutMutationError}
          </p>
        ) : null}

        {row.isSecret ? (
          <div className="secret-config-banner" role="status">
            <p className="secret-config-banner__text">
              <span className="badge badge--secret">секрет</span> Это секретная конфигурация: в списке и в
              истории версий содержимое скрыто; здесь показывается актуальный payload с сервера (для правки и
              доставки).
            </p>
          </div>
        ) : null}

        <div className="config-form__field">
          <span className="config-form__label">Среда</span>
          <p className="config-form__readonly mono">
            <span
              className={`pill pill--${environment === 'dev' || environment === 'stage' || environment === 'prod' ? environment : 'other'}`}
            >
              {environment}
            </span>
          </p>
        </div>

        <div className="config-form__field">
          <span className="config-form__label">Ключ</span>
          <p className="config-form__readonly mono">{configKey}</p>
        </div>

        <label className="config-form__field">
          <span className="config-form__label">Значение</span>
          <textarea
            className="config-form__textarea mono"
            value={valueText}
            onChange={(ev) => setValueText(ev.target.value)}
            rows={14}
            spellCheck={false}
            disabled={blockEdits}
          />
        </label>

        <p className="muted config-form__hint config-form__hint--row">
          <span>Текущая версия: {row.currentVersion}</span>
          {row.id ? (
            <Link
              className="config-form__history-link"
              to={versionHistoryPath(serviceName, environment, configKey)}
            >
              История версий
            </Link>
          ) : null}
        </p>
        {blockEdits ? (
          <p className="muted config-form__hint">
            Пока идёт доставка, сохранение отключено. Остановите доставку или дождитесь завершения.
          </p>
        ) : null}
      </ConfigFormShell>

      <DeliverRolloutDialog
        open={deliverDialogOpen}
        onClose={() => setDeliverDialogOpen(false)}
        description="Сначала будет сохранена новая версия конфигурации, затем запущена доставка клиентам."
        error={deliverError}
        submitting={deliverSubmitting}
        onConfirm={onConfirmDeliver}
      />
    </>
  )
}
