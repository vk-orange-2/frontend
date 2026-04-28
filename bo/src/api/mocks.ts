import type {
  ConfigResponse,
  ServiceConfigRow,
  ServiceResponse,
  VersionHistoryResponse,
} from './types'

const now = '2026-04-12T10:00:00.000Z'

type MockOverrideRow = ServiceConfigRow & { serviceName: string }

let mockConfigOverrides: MockOverrideRow[] = []

/** Для моков POST /v1/configs: подмена строк при следующем GET. */
export function mockUpsertConfigRow(serviceName: string, row: ServiceConfigRow): void {
  mockConfigOverrides = mockConfigOverrides.filter(
    (o) =>
      !(
        o.serviceName === serviceName &&
        o.environment === row.environment &&
        o.configKey === row.configKey
      ),
  )
  const id =
    row.id && row.id.length > 0
      ? row.id
      : mockStableConfigId(serviceName, row.environment, row.configKey)
  mockConfigOverrides.push({ ...row, id, serviceName })
}

export function mockStableConfigId(
  serviceName: string,
  environment: string,
  configKey: string,
): string {
  const s = `${serviceName}\0${environment}\0${configKey}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  const h2 = (h ^ 0x9e3779b9) >>> 0
  const p8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  const a = p8(h)
  const b = p8(h2)
  return `${a}-${a.slice(4, 8)}-4${b.slice(0, 3)}-8${b.slice(3, 6)}-${(a + b).slice(0, 12)}`
}

const cfg = (
  configKey: string,
  currentVersion: number,
  payload: unknown,
  id: string,
): ConfigResponse => ({
  id,
  configKey,
  currentVersion,
  latestVersion: { payload },
})

const row = (
  serviceName: string,
  environment: string,
  configKey: string,
  currentVersion: number,
  payload: unknown,
): ServiceConfigRow => {
  const id = mockStableConfigId(serviceName, environment, configKey)
  return {
    ...cfg(configKey, currentVersion, payload, id),
    environment,
  }
}

export const mockServiceList: ServiceResponse[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'checkout-api',
    description: 'Оформление заказа',
    createdAt: now,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'notifications',
    description: null,
    createdAt: now,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'search-indexer',
    description: 'Индексация поиска',
    createdAt: now,
  },
]

export function mockMergedServiceConfigs(serviceName: string): ServiceConfigRow[] {
  const byService: Record<string, ServiceConfigRow[]> = {
    'checkout-api': [
      row('checkout-api', 'prod', 'feature_flags', 12, { x: true }),
      row('checkout-api', 'prod', 'stripe_webhook_secret', 3, '***'),
      row('checkout-api', 'stage', 'timeouts', 7, 'connect: 5s'),
    ],
    notifications: [row('notifications', 'dev', 'smtp', 1, 'host=localhost')],
    'search-indexer': [
      row('search-indexer', 'prod', 'indexer_batch', 24, { batch: 100 }),
      row('search-indexer', 'prod', 'opensearch_password', 2, '***'),
    ],
  }

  const found = byService[serviceName] ?? []
  const overrideKeys = new Set(
    mockConfigOverrides
      .filter((o) => o.serviceName === serviceName)
      .map((o) => `${o.environment}:${o.configKey}`),
  )
  const base = found.filter((r) => !overrideKeys.has(`${r.environment}:${r.configKey}`))
  const extra = mockConfigOverrides
    .filter((o) => o.serviceName === serviceName)
    .map((o) => {
      const { serviceName, ...r } = o
      void serviceName
      return r
    })
  const merged = [...base, ...extra]
  merged.sort(
    (a, b) =>
      a.environment.localeCompare(b.environment) || a.configKey.localeCompare(b.configKey),
  )
  return merged
}

function findMockRowByConfigId(configId: string): ServiceConfigRow | null {
  for (const svc of mockServiceList) {
    for (const r of mockMergedServiceConfigs(svc.name)) {
      if (r.id === configId) return r
    }
  }
  return null
}

const mockAuthors = ['alex', 'ci-bot', 'maria', 'deployer'] as const

/**
 * Синтетическая лента версий для моков: по currentVersion и текущему payload.
 */
export function mockConfigVersionHistory(configId: string): VersionHistoryResponse {
  const row = findMockRowByConfigId(configId)
  if (!row) {
    return { versions: [] }
  }
  const n = row.currentVersion
  const baseTime = Date.parse('2026-04-12T10:00:00.000Z')
  const versions: VersionHistoryResponse['versions'] = []
  for (let v = n; v >= 1; v--) {
    const changeType = v === 1 ? 'create' : 'update'
    const isLatest = v === n
    const author = mockAuthors[v % mockAuthors.length]
    versions.push({
      id: `${configId}-v${v}`,
      configId,
      version: v,
      payload: isLatest ? row.latestVersion.payload : { _note: 'предыдущий снимок (мок)' },
      changeType,
      author,
      comment: isLatest && n > 1 ? 'Последнее изменение' : null,
      createdAt: new Date(baseTime - (n - v) * 3_600_000).toISOString(),
    })
  }
  return { versions }
}
