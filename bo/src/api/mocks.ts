import type { ConfigResponse, ServiceConfigRow, ServiceResponse } from './types'

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
  mockConfigOverrides.push({ ...row, serviceName })
}

const cfg = (
  configKey: string,
  currentVersion: number,
  payload: unknown,
): ConfigResponse => ({
  configKey,
  currentVersion,
  latestVersion: { payload },
})

const row = (
  environment: string,
  configKey: string,
  currentVersion: number,
  payload: unknown,
): ServiceConfigRow => ({
  ...cfg(configKey, currentVersion, payload),
  environment,
})

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
      row('prod', 'feature_flags', 12, { x: true }),
      row('prod', 'stripe_webhook_secret', 3, '***'),
      row('stage', 'timeouts', 7, 'connect: 5s'),
    ],
    notifications: [row('dev', 'smtp', 1, 'host=localhost')],
    'search-indexer': [
      row('prod', 'indexer_batch', 24, { batch: 100 }),
      row('prod', 'opensearch_password', 2, '***'),
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
    .map(({ serviceName: _s, ...r }) => r)
  const merged = [...base, ...extra]
  merged.sort(
    (a, b) =>
      a.environment.localeCompare(b.environment) || a.configKey.localeCompare(b.configKey),
  )
  return merged
}
