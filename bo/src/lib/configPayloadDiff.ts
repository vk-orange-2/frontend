import { diffLines } from 'diff'

export type DiffRow = {
  kind: 'added' | 'removed' | 'changed'
  path: string
  before?: string
  after?: string
}

type LinePart = { text: string; type: 'same' | 'add' | 'rem' }

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isStructured(x: unknown): boolean {
  return isPlainObject(x) || Array.isArray(x)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (Number.isNaN(a) && Number.isNaN(b) && typeof a === 'number' && typeof b === 'number')
    return true
  if (typeof a !== 'object' && typeof b !== 'object') return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    if (keysA.length !== Object.keys(b).length) return false
    for (const k of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}

function unwrapConfigPayload(p: unknown): unknown {
  if (typeof p === 'string') {
    const t = p.trim()
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']'))
    ) {
      try {
        return JSON.parse(t) as unknown
      } catch {
        return p
      }
    }
  }
  return p
}

function formatValue(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'bigint') return `${v}n`
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function escapeKey(k: string): string {
  return k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Сегменты пути в стиле JSON: `a.b[0].x`, `["a.b"]` для нетипичных ключей.
 */
function appendPath(parent: string, part: string | number): string {
  if (typeof part === 'number') {
    if (parent === '') return `[${part}]`
    return `${parent}[${part}]`
  }
  if (parent === '' && typeof part === 'string') {
    if (/^[a-zA-Z_$][\w$]*$/.test(part)) return part
    if (/^\[/.test(part)) return part
    return `["${escapeKey(part)}"]`
  }
  if (/^[a-zA-Z_$][\w$]*$/.test(String(part))) {
    return `${parent}.${String(part)}`
  }
  return `${parent}["${escapeKey(String(part))}"]`
}

function pathLabel(p: string): string {
  return p === '' ? '—' : p
}

function walk(a: unknown, b: unknown, p: string): DiffRow[] {
  if (deepEqual(a, b)) return []

  if (isPlainObject(a) && isPlainObject(b)) {
    const out: DiffRow[] = []
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      const next = appendPath(p, k)
      if (!Object.prototype.hasOwnProperty.call(a, k)) {
        out.push({ kind: 'added', path: pathLabel(next), after: formatValue(b[k]) })
        continue
      }
      if (!Object.prototype.hasOwnProperty.call(b, k)) {
        out.push({ kind: 'removed', path: pathLabel(next), before: formatValue(a[k]) })
        continue
      }
      out.push(...walk(a[k], b[k], next))
    }
    return out
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length)
    const out: DiffRow[] = []
    for (let i = 0; i < n; i += 1) {
      const next = appendPath(p, i)
      if (i >= a.length) {
        out.push({ kind: 'added', path: pathLabel(next), after: formatValue(b[i]) })
        continue
      }
      if (i >= b.length) {
        out.push({ kind: 'removed', path: pathLabel(next), before: formatValue(a[i]) })
        continue
      }
      out.push(...walk(a[i], b[i], next))
    }
    return out
  }

  return [
    {
      kind: 'changed',
      path: pathLabel(p),
      before: formatValue(a),
      after: formatValue(b),
    },
  ]
}

/**
 * Сравнение payload двух версий: от (старое) к to (новое).
 */
export function diffConfigPayloads(from: unknown, to: unknown): DiffRow[] {
  const a = unwrapConfigPayload(from)
  const b = unwrapConfigPayload(to)
  if (deepEqual(a, b)) return []
  if (isStructured(a) && isStructured(b)) {
    return walk(a, b, '')
  }
  return [
    {
      kind: 'changed',
      path: '—',
      before: formatValue(a),
      after: formatValue(b),
    },
  ]
}

/**
 * Когда весь диф — замена текста, показать построчно.
 */
export function shouldUseLineDiff(from: unknown, to: unknown, rows: DiffRow[]): boolean {
  if (rows.length !== 1) return false
  const r = rows[0]
  if (r.kind !== 'changed' || r.path !== '—') return false
  if (typeof from !== 'string' || typeof to !== 'string') return false
  if (!from.includes('\n') && !to.includes('\n') && from.length < 200 && to.length < 200) return false
  return true
}

export function lineDiffText(from: string, to: string): LinePart[] {
  const parts: LinePart[] = []
  for (const chunk of diffLines(from, to, { ignoreWhitespace: false, newlineIsToken: true })) {
    const t = chunk.value
    if (chunk.added) {
      if (t.length) parts.push({ text: t, type: 'add' })
    } else if (chunk.removed) {
      if (t.length) parts.push({ text: t, type: 'rem' })
    } else if (t.length) {
      parts.push({ text: t, type: 'same' })
    }
  }
  return parts
}
