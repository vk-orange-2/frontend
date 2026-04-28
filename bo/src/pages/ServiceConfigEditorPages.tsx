import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createOrUpdateConfig, fetchConfigsForEnvironment } from '../api/client'
import type { ServiceConfigRow } from '../api/types'
import { configsListPath, versionHistoryPath } from './configPaths'

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
}) {
  const { title, serviceName, children, onSubmit, submitting, error, submitLabel } = props
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
          <button type="submit" className="btn btn--primary" disabled={submitting}>
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

export function ServiceConfigCreatePage() {
  const { serviceName: serviceNameParam } = useParams<{ serviceName: string }>()
  const serviceName = serviceNameParam ? decodeURIComponent(serviceNameParam) : ''
  const navigate = useNavigate()

  const [env, setEnv] = useState<EnvChoice>('dev')
  const [configKey, setConfigKey] = useState('')
  const [valueText, setValueText] = useState('{\n  \n}')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = useMemo(
    () => Boolean(serviceName && configKey.trim()),
    [serviceName, configKey],
  )

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
    <ConfigFormShell
      title="создание свойства"
      serviceName={serviceName}
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      submitLabel="Создать"
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

  return (
    <ConfigFormShell
      title="редактирование"
      serviceName={serviceName}
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      submitLabel="Сохранить"
    >
      <div className="config-form__field">
        <span className="config-form__label">Среда</span>
        <p className="config-form__readonly mono">
          <span className={`pill pill--${environment === 'dev' || environment === 'stage' || environment === 'prod' ? environment : 'other'}`}>
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
    </ConfigFormShell>
  )
}
