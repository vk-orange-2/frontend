import type { ConfigListResponse, ServiceListResponse } from './types'
import { mockConfigsForService, mockServiceList } from './mocks'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

/** Пока `true` (по умолчанию), ответы подменяются моками; для реального бэкенда: `VITE_API_MOCK=false`. */
const USE_MOCK = import.meta.env.VITE_API_MOCK !== 'false'

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

/**
 * GET /v1/services — список сервисов (OpenAPI: listServices).
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
  return parseJson<ServiceListResponse>(res)
}

/**
 * GET /v1/services/{serviceId}/configs — конфигурации сервиса (OpenAPI: listConfigsByService).
 */
export async function fetchServiceConfigs(
  serviceId: string,
): Promise<ConfigListResponse> {
  const path = `/v1/services/${encodeURIComponent(serviceId)}/configs`
  if (USE_MOCK) {
    await delay(180)
    return structuredClone(mockConfigsForService(serviceId))
  }

  const res = await fetch(buildUrl(path), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Ошибка ${res.status}`, res.status, body)
  }
  return parseJson<ConfigListResponse>(res)
}

export { ApiError }
