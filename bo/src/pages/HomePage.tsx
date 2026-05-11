import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { createService, fetchServices } from '../api/client'
import type { ServiceResponse } from '../api/types'

export function HomePage() {
  const [data, setData] = useState<ServiceResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const titleId = useId()
  const nameId = useId()
  const descId = useId()

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

  function openDialog() {
    setFormName('')
    setFormDescription('')
    setSubmitError(null)
    setDialogOpen(true)
  }

  function closeDialog() {
    if (submitting) return
    setDialogOpen(false)
    setSubmitError(null)
  }

  async function handleSubmit() {
    const name = formName.trim()
    if (name.length === 0) {
      setSubmitError('Укажите название сервиса')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const description = formDescription.trim()
      const created = await createService({
        name,
        description: description.length > 0 ? description : undefined,
      })
      setData((prev) => {
        const next = prev ? [...prev, created] : [created]
        next.sort((a, b) => a.name.localeCompare(b.name))
        return next
      })
      setDialogOpen(false)
    } catch (e: unknown) {
      setSubmitError(
        e instanceof Error ? e.message : 'Не удалось создать сервис',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head page-head--split">
        <div>
          <h1>Сервисы</h1>
        </div>
        <div className="page-toolbar">
          <button
            type="button"
            className="btn btn--primary"
            onClick={openDialog}
          >
            Создать сервис
          </button>
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

      {dialogOpen ? (
        <div
          className="rollback-dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog()
          }}
        >
          <form
            className="rollback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
          >
            <h2 id={titleId} className="rollback-dialog__title">
              Новый сервис
            </h2>

            {submitError ? (
              <p className="error-banner rollback-dialog__err" role="alert">
                {submitError}
              </p>
            ) : null}

            <label className="rollback-dialog__field" htmlFor={nameId}>
              <span className="rollback-dialog__label">Название</span>
              <input
                id={nameId}
                className="config-form__input"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={submitting}
                maxLength={255}
                autoFocus
                required
              />
            </label>

            <label className="rollback-dialog__field" htmlFor={descId}>
              <span className="rollback-dialog__label">Описание</span>
              <textarea
                id={descId}
                className="config-form__input rollback-dialog__textarea"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                disabled={submitting}
                maxLength={1000}
              />
            </label>

            <div className="rollback-dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeDialog}
                disabled={submitting}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting}
              >
                {submitting ? 'Создание…' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
