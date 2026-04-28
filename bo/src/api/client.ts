import type {
  ConfigListResponse,
  ConfigResponse,
  CreateConfigRequest,
  ConfigVersionEntry,
  ServiceConfigRow,
  ServiceResponse,
  VersionHistoryResponse,
} from './types'

/** Совпадает с `server.port` в backend config-server application.yml */
const DEFAULT_API_BASE = 'http://localhost:8081'

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  DEFAULT_API_BASE
).replace(/\/$/, '')

/** Окружения из ConfigService (dev, stage, prod). */
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

function parseServiceResponse(row: unknown): ServiceResponse {
  if (row == null || typeof row !== 'object') {
    return { id: '', name: '', description: null, createdAt: '' }
  }
  const r = row as Record<string, unknown>
  return {
    id: r.id != null ? String(r.id) : '',
    name: String(r.name ?? ''),
    description: r.description == null ? null : String(r.description),
    createdAt: String(r.createdAt ?? ''),
  }
}

function parseOptionalString(v: unknown): string | undefined {
  if (v == null) return undefined
  return String(v)
}

function parseConfigResponse(row: unknown): ConfigResponse {
  if (row == null || typeof row !== 'object') {
    return {
      configKey: '',
      currentVersion: 0,
      latestVersion: { payload: null },
    }
  }
  const r = row as Record<string, unknown>
  const lv = r.latestVersion
  let payload: unknown = null
  if (lv != null && typeof lv === 'object' && 'payload' in lv) {
    payload = (lv as Record<string, unknown>).payload
  }
  const ver =
    typeof r.currentVersion === 'number'
      ? r.currentVersion
      : Number.parseInt(String(r.currentVersion ?? '0'), 10) || 0

  let deletedAt: string | null | undefined
  if (r.deletedAt === undefined) deletedAt = undefined
  else if (r.deletedAt === null) deletedAt = null
  else deletedAt = String(r.deletedAt)

  return {
    id: r.id != null ? String(r.id) : undefined,
    configKey: String(r.configKey ?? ''),
    service: parseOptionalString(r.service),
    environment: parseOptionalString(r.environment),
    isSecret: typeof r.isSecret === 'boolean' ? r.isSecret : undefined,
    status: parseOptionalString(r.status),
    currentVersion: ver,
    latestVersion: { payload },
    createdAt: parseOptionalString(r.createdAt),
    updatedAt: parseOptionalString(r.updatedAt),
    deletedAt,
  }
}

function apiErrorMessage(status: number, parsed: unknown): string {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const inner = (parsed as { error?: { message?: unknown } }).error
    if (inner && typeof inner.message === 'string' && inner.message.length > 0) {
      return inner.message
    }
  }
  return `Ошибка ${status}`
}

function parseConfigListBody(raw: unknown): ConfigResponse[] {
  if (raw == null || typeof raw !== 'object') return []
  const configs = (raw as ConfigListResponse).configs
  if (!Array.isArray(configs)) return []
  return configs.map(parseConfigResponse)
}

/**
 * GET /v1/services — список сервисов (как List ServiceResponse на бэкенде).
 */
export async function fetchServices(): Promise<ServiceResponse[]> {
  const path = '/v1/services'
  const res = await fetch(buildUrl(path), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Ошибка ${res.status}`, res.status, body)
  }
  const raw = await parseJson<unknown>(res)
  const list = Array.isArray(raw) ? raw : []
  return list.map(parseServiceResponse)
}

/**
 * GET /v1/configs?serviceName=&environment= — для нескольких сред результаты объединяются.
 * Каждый ответ: { configs: ConfigResponse[] } (ConfigListResponse.java).
 */
export async function fetchServiceConfigs(
  serviceName: string,
): Promise<ServiceConfigRow[]> {
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
      const raw = await parseJson<unknown>(res)
      const configs = parseConfigListBody(raw)
      return configs.map(
        (c): ServiceConfigRow => ({
          ...c,
          environment: c.environment ?? environment,
        }),
      )
    }),
  )

  const items = results.flat()
  items.sort(
    (a, b) =>
      a.environment.localeCompare(b.environment) ||
      a.configKey.localeCompare(b.configKey),
  )

  return items
}

/**
 * GET /v1/configs?serviceName=&environment= — одна среда.
 */
export async function fetchConfigsForEnvironment(
  serviceName: string,
  environment: string,
): Promise<ServiceConfigRow[]> {
  const q = new URLSearchParams({ serviceName, environment })
  const res = await fetch(buildUrl(`/v1/configs?${q}`), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Ошибка ${res.status}`, res.status, body)
  }
  const raw = await parseJson<unknown>(res)
  const configs = parseConfigListBody(raw)
  return configs.map(
    (c): ServiceConfigRow => ({
      ...c,
      environment: c.environment ?? environment,
    }),
  )
}

/**
 * POST /v1/configs — создать или обновить (CreateConfigRequest.java).
 */
export async function createOrUpdateConfig(
  body: CreateConfigRequest,
): Promise<ConfigResponse> {
  const res = await fetch(buildUrl('/v1/configs'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const bodyText = await res.text()
    let parsed: unknown
    try {
      parsed = bodyText ? JSON.parse(bodyText) : undefined
    } catch {
      parsed = bodyText
    }
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  return parseConfigResponse(raw)
}

function parseConfigVersionEntry(row: unknown): ConfigVersionEntry {
  if (row == null || typeof row !== 'object') {
    return {
      version: 0,
      payload: null,
      changeType: '',
      author: '',
      comment: null,
      createdAt: '',
    }
  }
  const r = row as Record<string, unknown>
  const ver = r.version
  return {
    id: r.id != null ? String(r.id) : undefined,
    configId: r.configId != null ? String(r.configId) : undefined,
    version: typeof ver === 'number' ? ver : Number.parseInt(String(ver ?? '0'), 10) || 0,
    payload: r.payload,
    changeType: String(r.changeType ?? ''),
    author: String(r.author ?? ''),
    comment: r.comment == null ? null : String(r.comment),
    createdAt: r.createdAt != null ? String(r.createdAt) : '',
  }
}

/**
 * GET /v1/configs/{configId}/versions — история версий (сортировка: от новой к старой).
 */
export async function fetchConfigVersionHistory(
  configId: string,
): Promise<ConfigVersionEntry[]> {
  const res = await fetch(
    buildUrl(`/v1/configs/${encodeURIComponent(configId)}/versions`),
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Ошибка ${res.status}`, res.status, body)
  }
  const raw = await parseJson<VersionHistoryResponse | unknown>(res)
  if (raw == null || typeof raw !== 'object' || !('versions' in raw)) {
    return []
  }
  const list = (raw as VersionHistoryResponse).versions
  if (!Array.isArray(list)) return []
  return list.map(parseConfigVersionEntry)
}

export { ApiError }
