import { useMemo, useState } from 'react'
import type { ConfigVersionEntry } from '../api/types'
import {
  diffConfigPayloads,
  lineDiffText,
  shouldUseLineDiff,
} from '../lib/configPayloadDiff'
import type { DiffRow } from '../lib/configPayloadDiff'

type Props = {
  versions: ConfigVersionEntry[]
  /** Скрыть сравнение payload (секретные конфигурации). */
  isSecret?: boolean
}

type LinePart = { text: string; type: 'same' | 'add' | 'rem' }

function versionNumbers(versions: ConfigVersionEntry[]): number[] {
  return [...new Set(versions.map((v) => v.version))].sort((a, b) => b - a)
}

function initialSelects(vers: ConfigVersionEntry[]): { from: number | null; to: number | null } {
  const nums = versionNumbers(vers)
  if (nums.length < 2) {
    return { from: null, to: null }
  }
  return { to: nums[0] ?? null, from: nums[1] ?? null }
}

const emptyDiff = { rows: [] as DiffRow[], lineParts: [] as LinePart[], isLineMode: false as const }

type BodyProps = {
  versions: ConfigVersionEntry[]
}

function ConfigVersionCompareBody({ versions }: BodyProps) {
  const byNum = useMemo(() => {
    const m = new Map<number, ConfigVersionEntry>()
    for (const v of versions) m.set(v.version, v)
    return m
  }, [versions])

  const nums = useMemo(() => versionNumbers(versions), [versions])

  const [from, setFrom] = useState<number | null>(() => initialSelects(versions).from)
  const [to, setTo] = useState<number | null>(() => initialSelects(versions).to)

  const fromEntry = from != null ? byNum.get(from) : undefined
  const toEntry = to != null ? byNum.get(to) : undefined

  const { rows, lineParts, isLineMode } = useMemo(() => {
    if (from == null || to == null || !fromEntry || !toEntry) {
      return emptyDiff
    }
    if (from === to) {
      return emptyDiff
    }
    const r = diffConfigPayloads(fromEntry.payload, toEntry.payload)
    const aPl = fromEntry.payload
    const bPl = toEntry.payload
    if (
      shouldUseLineDiff(aPl, bPl, r) &&
      typeof aPl === 'string' &&
      typeof bPl === 'string'
    ) {
      const parts = lineDiffText(aPl, bPl)
      if (parts.length > 0) {
        return { rows: r, lineParts: parts, isLineMode: true as const }
      }
    }
    return { rows: r, lineParts: [] as LinePart[], isLineMode: false as const }
  }, [from, to, fromEntry, toEntry])

  return (
    <section className="config-compare" aria-label="Сравнение версий">
      <h2 className="config-compare__title">Сравнение версий</h2>
      <p className="config-compare__hint muted">
        Выпадающие списки задают <strong>исход</strong> и <strong>результат</strong> сравнения (слева — откуда, справа — куда
        ведут отличия ниже).
      </p>
      <div className="config-compare__toolbar" role="group" aria-label="Выбор версий">
        <label className="config-compare__field">
          <span className="config-compare__label">Было</span>
          <select
            className="config-compare__select"
            value={from ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value)
              setFrom(Number.isFinite(v) ? v : null)
            }}
            aria-label="Прежняя версия (было)"
          >
            {nums.map((n) => (
              <option key={n} value={n} disabled={n === to}>
                v{n}
              </option>
            ))}
          </select>
        </label>
        <span className="config-compare__arrow" aria-hidden>
          →
        </span>
        <label className="config-compare__field">
          <span className="config-compare__label">Стало</span>
          <select
            className="config-compare__select"
            value={to ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value)
              setTo(Number.isFinite(v) ? v : null)
            }}
            aria-label="Новая версия (стало)"
          >
            {nums.map((n) => (
              <option key={n} value={n} disabled={n === from}>
                v{n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {from != null && to != null && from === to && (
        <p className="config-compare__empty muted">Выберите две разные версии.</p>
      )}

      {from != null && to != null && from !== to && rows.length === 0 && !isLineMode && (
        <p className="config-compare__empty config-compare__empty--ok" role="status">
          Отличий в payload нет: значения совпадают.
        </p>
      )}

      {from != null && to != null && from !== to && isLineMode && lineParts.length > 0 && (
        <pre
          className="config-line-diff mono"
          role="log"
          aria-label="Построчные отличия"
        >
          {lineParts.map((part, i) => {
            const cls =
              part.type === 'add'
                ? 'config-line-diff__add'
                : part.type === 'rem'
                  ? 'config-line-diff__rem'
                  : 'config-line-diff__same'
            return (
              <span key={i} className={cls}>
                {part.text}
              </span>
            )
          })}
        </pre>
      )}

      {from != null && to != null && from !== to && !isLineMode && rows.length > 0 && (
        <div className="config-diff-wrap">
          <table className="config-diff data-table" aria-label="Список отличий">
            <thead>
              <tr>
                <th className="config-diff__th-kind" scope="col">
                  Тип
                </th>
                <th className="config-diff__th-path" scope="col">
                  Путь
                </th>
                <th className="config-diff__th-val" scope="col">
                  Значение
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                if (row.kind === 'added') {
                  return (
                    <tr
                      key={`a-${row.path}-${idx}`}
                      className="config-diff__row config-diff__row--add"
                    >
                      <td>Добавлено</td>
                      <td className="mono config-diff__path">{row.path}</td>
                      <td className="cell-value">
                        <pre className="config-diff__val mono">{row.after}</pre>
                      </td>
                    </tr>
                  )
                }
                if (row.kind === 'removed') {
                  return (
                    <tr
                      key={`r-${row.path}-${idx}`}
                      className="config-diff__row config-diff__row--rem"
                    >
                      <td>Удалено</td>
                      <td className="mono config-diff__path">{row.path}</td>
                      <td className="cell-value">
                        <pre className="config-diff__val mono">{row.before}</pre>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr
                    key={`c-${row.path}-${idx}`}
                    className="config-diff__row config-diff__row--chg"
                  >
                    <td>Изменено</td>
                    <td className="mono config-diff__path">{row.path}</td>
                    <td className="config-diff__was-then">
                      <div>
                        <span className="config-diff__sub">было</span>
                        <pre className="config-diff__val config-diff__val--was mono">{row.before}</pre>
                      </div>
                      <div>
                        <span className="config-diff__sub">стало</span>
                        <pre className="config-diff__val config-diff__val--new mono">{row.after}</pre>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * Сравнение payload двух выбранных версий: от «было» к «стало».
 */
export function ConfigVersionComparePanel({ versions, isSecret }: Props) {
  const distinct = useMemo(
    () => new Set(versions.map((v) => v.version)).size,
    [versions],
  )
  const resetKey = useMemo(
    () => versions.map((v) => `${v.version}:${v.id ?? ''}`).join('|'),
    [versions],
  )

  if (isSecret) {
    return (
      <section className="config-compare" aria-label="Сравнение версий">
        <h2 className="config-compare__title">Сравнение версий</h2>
        <p className="muted">
          Для секретных конфигураций подробное сравнение payload отключено. Измените значение на странице
          редактирования при необходимости.
        </p>
      </section>
    )
  }

  if (distinct < 2) {
    return (
      <section className="config-compare" aria-label="Сравнение версий">
        <h2 className="config-compare__title">Сравнение версий</h2>
        <p className="muted">Чтобы сравнить, нужны минимум две разные версии в истории.</p>
      </section>
    )
  }

  return <ConfigVersionCompareBody key={resetKey} versions={versions} />
}
