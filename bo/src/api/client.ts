import type {
  AuditLogEntry,
  AuditSearchResult,
  ConfigListResponse,
  ConfigResponse,
  CreateConfigRequest,
  CreateRolloutRequest,
  CreateServiceRequest,
  ConfigVersionEntry,
  RollbackRequest,
  RolloutResponse,
  ServiceConfigRow,
  ServiceResponse,
  VersionHistoryResponse,
} from './types'

/** Совпадает с `server.port` в backend config-server application.yml */
const DEFAULT_API_BASE = 'http://90.156.215.104:8081'

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
    const inner = (parsed as { error?: { message?: unknown; code?: unknown } }).error
    if (inner && typeof inner === 'object') {
      const msg =
        typeof inner.message === 'string' && inner.message.length > 0
          ? inner.message
          : ''
      const code =
        typeof inner.code === 'string' && inner.code.length > 0 ? inner.code : ''
      if (msg) return msg
      if (code) return code
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
 * POST /v1/services — создать сервис (CreateServiceRequest.java).
 */
export async function createService(
  body: CreateServiceRequest,
): Promise<ServiceResponse> {
  const payload: CreateServiceRequest = {
    name: body.name,
    ...(body.description != null && body.description !== ''
      ? { description: body.description }
      : {}),
  }
  const res = await fetch(buildUrl('/v1/services'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
  return parseServiceResponse(raw)
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

/**
 * POST /v1/rollouts/config/{configId}/rollback — откат к версии и instant rollout.
 */
export async function rollbackConfig(
  configId: string,
  body: RollbackRequest,
  options?: { author?: string },
): Promise<RolloutResponse> {
  const res = await fetch(
    buildUrl(`/v1/rollouts/config/${encodeURIComponent(configId)}/rollback`),
    {
      method: 'POST',
      headers: rolloutPostHeaders(options?.author),
      body: JSON.stringify({
        targetVersion: body.targetVersion,
        expectedVersion: body.expectedVersion,
        ...(body.comment != null && body.comment !== ''
          ? { comment: body.comment }
          : {}),
      }),
    },
  )
  if (!res.ok) {
    const parsed = await parseJsonError(res)
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  return parseRolloutResponse(raw)
}

function parseAuditLogEntry(row: unknown): AuditLogEntry {
  if (row == null || typeof row !== 'object') {
    return {
      id: '',
      configId: '',
      serviceName: '',
      environment: '',
      configKey: '',
      operation: '',
      actor: '',
      sourceIp: null,
      versionBefore: null,
      versionAfter: null,
      diff: null,
      createdAt: '',
    }
  }
  const r = row as Record<string, unknown>
  const vb = r.versionBefore
  const va = r.versionAfter
  const longOrNull = (v: unknown): number | null => {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const n = Number.parseInt(String(v), 10)
    return Number.isNaN(n) ? null : n
  }
  return {
    id: r.id != null ? String(r.id) : '',
    configId: r.configId != null ? String(r.configId) : '',
    serviceName: String(r.serviceName ?? ''),
    environment: String(r.environment ?? ''),
    configKey: String(r.configKey ?? ''),
    operation: String(r.operation ?? ''),
    actor: String(r.actor ?? ''),
    sourceIp: r.sourceIp == null ? null : String(r.sourceIp),
    versionBefore: longOrNull(vb),
    versionAfter: longOrNull(va),
    diff: r.diff,
    createdAt: r.createdAt != null ? String(r.createdAt) : '',
  }
}

export interface FetchAuditParams {
  serviceName?: string
  actor?: string
  from?: string
  to?: string
  operation?: string
  page?: number
  size?: number
}

const DEFAULT_AUDIT_PAGE_SIZE = 50

/**
 * GET /v1/audit — журнал изменений с фильтрами (см. AuditController).
 */
export async function fetchAuditSearch(
  params: FetchAuditParams,
): Promise<AuditSearchResult> {
  const q = new URLSearchParams()
  if (params.serviceName) q.set('serviceName', params.serviceName)
  if (params.actor) q.set('actor', params.actor)
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  if (params.operation) q.set('operation', params.operation)
  const page = params.page ?? 0
  const size = params.size ?? DEFAULT_AUDIT_PAGE_SIZE
  q.set('page', String(page))
  q.set('size', String(size))

  const res = await fetch(buildUrl(`/v1/audit?${q}`), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Ошибка ${res.status}`, res.status, body)
  }
  const raw = await parseJson<unknown>(res)
  if (raw == null || typeof raw !== 'object') {
    return { entries: [], totalCount: 0 }
  }
  const o = raw as Record<string, unknown>
  const list = o.entries
  const entries = Array.isArray(list) ? list.map(parseAuditLogEntry) : []
  const total = o.totalCount
  const totalCount =
    typeof total === 'number' && Number.isFinite(total) ? total : 0
  return { entries, totalCount }
}

function parseRolloutResponse(row: unknown): RolloutResponse {
  if (row == null || typeof row !== 'object') {
    return {
      id: '',
      configId: '',
      type: '',
      status: '',
      baselineVersion: 0,
      targetVersion: 0,
      totalDeployments: 0,
      currentDeployment: 0,
      deploymentIntervalSeconds: 0,
    }
  }
  const r = row as Record<string, unknown>
  const num = (v: unknown, d = 0): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const n = Number.parseInt(String(v ?? ''), 10)
    return Number.isNaN(n) ? d : n
  }
  const optInstant = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined
    if (v === null) return null
    return String(v)
  }
  return {
    id: r.id != null ? String(r.id) : '',
    configId: r.configId != null ? String(r.configId) : '',
    type: String(r.type ?? ''),
    status: String(r.status ?? ''),
    baselineVersion: num(r.baselineVersion),
    targetVersion: num(r.targetVersion),
    totalDeployments: num(r.totalDeployments),
    currentDeployment: num(r.currentDeployment),
    deploymentIntervalSeconds: num(r.deploymentIntervalSeconds),
    canaryPercentage:
      r.canaryPercentage != null ? num(r.canaryPercentage) : null,
    nextDeploymentAt: optInstant(r.nextDeploymentAt),
    createdAt: optInstant(r.createdAt),
    startedAt: optInstant(r.startedAt),
    completedAt: optInstant(r.completedAt),
    stoppedAt: optInstant(r.stoppedAt),
    rolledBackAt: optInstant(r.rolledBackAt),
  }
}

async function parseJsonError(res: Response): Promise<unknown> {
  const bodyText = await res.text()
  if (!bodyText) return undefined
  try {
    return JSON.parse(bodyText) as unknown
  } catch {
    return bodyText
  }
}

function rolloutPostHeaders(author?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (author != null && author.trim() !== '') {
    h['X-Author'] = author.trim()
  }
  return h
}

async function postRolloutAction(
  path: string,
  author?: string,
): Promise<RolloutResponse> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: rolloutPostHeaders(author),
    body: '{}',
  })
  if (!res.ok) {
    const parsed = await parseJsonError(res)
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  return parseRolloutResponse(raw)
}

/**
 * POST /v1/rollouts — создать и запустить доставку (CreateRolloutRequest.java).
 */
export async function createRollout(
  body: CreateRolloutRequest,
  options?: { author?: string },
): Promise<RolloutResponse> {
  const author = options?.author
  const payload: Record<string, unknown> = {
    configId: body.configId,
    type: body.type,
  }
  if (body.totalDeployments != null) {
    payload.totalDeployments = body.totalDeployments
  }
  if (body.deploymentIntervalSeconds != null) {
    payload.deploymentIntervalSeconds = body.deploymentIntervalSeconds
  }
  if (body.canaryPercentage != null) {
    payload.canaryPercentage = body.canaryPercentage
  }
  const res = await fetch(buildUrl('/v1/rollouts'), {
    method: 'POST',
    headers: rolloutPostHeaders(author),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const parsed = await parseJsonError(res)
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  return parseRolloutResponse(raw)
}

/**
 * GET /v1/rollouts/{id}
 */
export async function fetchRollout(rolloutId: string): Promise<RolloutResponse> {
  const res = await fetch(
    buildUrl(`/v1/rollouts/${encodeURIComponent(rolloutId)}`),
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    const parsed = await parseJsonError(res)
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  return parseRolloutResponse(raw)
}

/**
 * GET /v1/rollouts?configId=
 */
export async function fetchRolloutsForConfig(
  configId: string,
): Promise<RolloutResponse[]> {
  const q = new URLSearchParams({ configId })
  const res = await fetch(buildUrl(`/v1/rollouts?${q}`), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const parsed = await parseJsonError(res)
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  if (!Array.isArray(raw)) return []
  return raw.map(parseRolloutResponse)
}

/**
 * GET /v1/rollouts/active?serviceName=&environment=
 */
export async function fetchActiveRollouts(
  serviceName: string,
  environment: string,
): Promise<RolloutResponse[]> {
  const q = new URLSearchParams({ serviceName, environment })
  const res = await fetch(buildUrl(`/v1/rollouts/active?${q}`), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const parsed = await parseJsonError(res)
    throw new ApiError(apiErrorMessage(res.status, parsed), res.status, parsed)
  }
  const raw = await parseJson<unknown>(res)
  if (!Array.isArray(raw)) return []
  return raw.map(parseRolloutResponse)
}

/**
 * POST /v1/rollouts/{id}/stop
 */
export async function stopRollout(
  rolloutId: string,
  options?: { author?: string },
): Promise<RolloutResponse> {
  return postRolloutAction(
    `/v1/rollouts/${encodeURIComponent(rolloutId)}/stop`,
    options?.author,
  )
}

/**
 * POST /v1/rollouts/{id}/rollback
 */
export async function rollbackRollout(
  rolloutId: string,
  options?: { author?: string },
): Promise<RolloutResponse> {
  return postRolloutAction(
    `/v1/rollouts/${encodeURIComponent(rolloutId)}/rollback`,
    options?.author,
  )
}

/**
 * POST /v1/rollouts/{id}/deploy-next
 */
export async function deployNextRollout(
  rolloutId: string,
  options?: { author?: string },
): Promise<RolloutResponse> {
  return postRolloutAction(
    `/v1/rollouts/${encodeURIComponent(rolloutId)}/deploy-next`,
    options?.author,
  )
}

export { ApiError, DEFAULT_AUDIT_PAGE_SIZE }
