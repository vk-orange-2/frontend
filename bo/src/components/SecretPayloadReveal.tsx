import { useState } from 'react'
import {
  SECRET_PAYLOAD_PLACEHOLDER,
  isSecretConfig,
} from '../lib/secretConfigDisplay'

function truncatePreview(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

type TableCellProps = {
  isSecret?: boolean
  /** Уже отформатированное значение для показа */
  fullText: string
  previewMax?: number
}

/** Ячейка таблицы: для секретов по нажатию показывает или снова скрывает значение. */
export function SecretPayloadTableCell({
  isSecret,
  fullText,
  previewMax = 72,
}: TableCellProps) {
  const [revealed, setRevealed] = useState(false)

  if (!isSecretConfig(isSecret)) {
    return <>{truncatePreview(fullText, previewMax)}</>
  }

  const visible = revealed ? fullText : SECRET_PAYLOAD_PLACEHOLDER

  return (
    <button
      type="button"
      className={`secret-value-reveal${revealed ? ' secret-value-reveal--shown' : ''}`}
      onClick={() => setRevealed((v) => !v)}
      title={
        revealed
          ? 'Нажмите, чтобы скрыть значение'
          : 'Нажмите, чтобы показать значение'
      }
    >
      {truncatePreview(visible, previewMax)}
    </button>
  )
}

type PreProps = {
  isSecret?: boolean
  /** Текст для отображения внутри &lt;pre&gt; при раскрытии */
  fullText: string
  preClassName?: string
}

/** Блок payload в карточке версии: секрет по умолчанию скрыт, по нажатию раскрывается. */
export function SecretPayloadPre({
  isSecret,
  fullText,
  preClassName = 'version-card__pre mono',
}: PreProps) {
  const [revealed, setRevealed] = useState(false)

  if (!isSecretConfig(isSecret)) {
    return <pre className={preClassName}>{fullText}</pre>
  }

  if (!revealed) {
    return (
      <button
        type="button"
        className={`${preClassName} secret-value-reveal secret-value-reveal--block`}
        onClick={() => setRevealed(true)}
        title="Нажмите, чтобы показать значение"
      >
        {SECRET_PAYLOAD_PLACEHOLDER}
      </button>
    )
  }

  return (
    <div className="secret-value-reveal-wrap">
      <pre
        className={`${preClassName} secret-value-reveal-target`}
        title="Нажмите ниже «Скрыть», чтобы скрыть значение"
      >
        {fullText}
      </pre>
      <button
        type="button"
        className="btn btn--ghost btn--small secret-value-reveal-hide"
        onClick={() => setRevealed(false)}
      >
        Скрыть
      </button>
    </div>
  )
}
