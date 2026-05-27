import { useCallback, useState } from 'react'

export type BlurValidatedNumberOptions = {
  min?: number
  max?: number
  /** Значение при пустом или невалидном вводе на blur; по умолчанию — min или 0. */
  defaultValue?: number
}

export function normalizeBlurValidatedNumber(
  raw: string,
  { min, max, defaultValue }: BlurValidatedNumberOptions,
): number {
  const fallback = defaultValue ?? min ?? 0
  const trimmed = raw.trim()
  if (trimmed === '') return fallback
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n)) return fallback
  let next = n
  if (min != null) next = Math.max(min, next)
  if (max != null) next = Math.min(max, next)
  return next
}

export function useBlurValidatedNumberInput(
  initial: number,
  options: BlurValidatedNumberOptions,
) {
  const { min, max, defaultValue } = options
  const [text, setText] = useState(String(initial))
  const [value, setValue] = useState(initial)

  const commit = useCallback(() => {
    const next = normalizeBlurValidatedNumber(text, { min, max, defaultValue })
    setValue(next)
    setText(String(next))
    return next
  }, [text, min, max, defaultValue])

  const onChange = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    setText(ev.target.value)
  }, [])

  const onBlur = useCallback(() => {
    commit()
  }, [commit])

  return {
    value,
    inputProps: {
      value: text,
      onChange,
      onBlur,
      type: 'number' as const,
    },
    commit,
  }
}
