import type { ConfigItem, ConfigListResponse, ServiceListResponse } from './types'
import { mockConfigsForService, mockServiceList } from './mocks'

const DEFAULT_API_BASE = 'http://localhost:8080'

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  DEFAULT_API_BASE
).replace(/\/$/, '')

/** Моки только при `VITE_API_MOCK=true`; иначе — реальный бэкенд. */
const USE_MOCK = import.meta.env.VITE_API_MOCK === 'true'

const CONFIG_ENVIRONMENTS = ['dev', 'stage', 'prod'] as const

function buildUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${p}`
}

class ApiError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError('Некорректный JSON в ответе', res.status)
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

function normalizeConfigRow(raw: Record<string, unknown>): ConfigItem {
  const id = raw.id != null ? String(raw.id) : ''
  const version =
    typeof raw.version === 'number'
      ? raw.version
      : Number.parseInt(String(raw.version ?? '0'), 10) || 0
  return {
    id,
    service: String(raw.service ?? ''),
    env: String(raw.env ?? ''),
    key: String(raw.key ?? ''),
    value: String(raw.value ?? ''),
    version,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  }
}

/**
 * GET /v1/services — список имён сервисов.
 */
export async function fetchServices(): Promise<ServiceListResponse> {
  const path = '/v1/services'
  if (USE_MOCK) {
    await delay(180)
    return structuredClone(mockServiceList)
  }

  const res = await fetch(buildUrl(path), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Ошибка ${res.status}`, res.status, body)
  }
  const names = await parseJson<string[]>(res)
  const items = Array.isArray(names)
    ? names.map((name) => ({ name: String(name) }))
    : []
  return {
    items,
    pagination: { page: 1, pageSize: items.length, total: items.length },
  }
}

/**
 * GET /v1/configs?serviceName=&environment= — для нескольких сред результаты объединяются.
 */
export async function fetchServiceConfigs(
  serviceName: string,
): Promise<ConfigListResponse> {
  if (USE_MOCK) {
    await delay(180)
    return structuredClone(mockConfigsForService(serviceName))
  }

  const results = await Promise.all(
    CONFIG_ENVIRONMENTS.map(async (environment) => {
      const q = new URLSearchParams({
        serviceName,
        environment,
      })
      const res = await fetch(buildUrl(`/v1/configs?${q}`), {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        const body = await res.text()
        throw new ApiError(`Ошибка ${res.status}`, res.status, body)
      }
      const list = await parseJson<unknown[]>(res)
      if (!Array.isArray(list)) return []
      return list.map((row) =>
        normalizeConfigRow(row != null && typeof row === 'object' ? (row as Record<string, unknown>) : {}),
      )
    }),
  )

  const items = results.flat()
  items.sort((a, b) => a.env.localeCompare(b.env) || a.key.localeCompare(b.key))

  return {
    items,
    pagination: { page: 1, pageSize: items.length, total: items.length },
  }
}

export { ApiError }
