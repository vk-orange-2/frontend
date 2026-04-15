import type { ConfigItem, ConfigListResponse, ServiceListResponse } from './types'

const now = '2026-04-12T10:00:00.000Z'

const row = (
  id: string,
  service: string,
  env: string,
  key: string,
  value: string,
  version: number,
): ConfigItem => ({
  id,
  service,
  env,
  key,
  value,
  version,
  createdAt: now,
  updatedAt: now,
})

export const mockServiceList: ServiceListResponse = {
  items: [
    { name: 'checkout-api' },
    { name: 'notifications' },
    { name: 'search-indexer' },
  ],
  pagination: { page: 1, pageSize: 50, total: 3 },
}

export function mockConfigsForService(serviceName: string): ConfigListResponse {
  const byService: Record<string, ConfigListResponse> = {
    'checkout-api': {
      items: [
        row(
          '11111111-1111-4111-8111-111111111111',
          'checkout-api',
          'prod',
          'feature_flags',
          '{"x":true}',
          12,
        ),
        row(
          '22222222-2222-4222-8222-222222222222',
          'checkout-api',
          'prod',
          'stripe_webhook_secret',
          '***',
          3,
        ),
        row(
          '33333333-3333-4333-8333-333333333333',
          'checkout-api',
          'stage',
          'timeouts',
          'connect: 5s',
          7,
        ),
      ],
      pagination: { page: 1, pageSize: 50, total: 3 },
    },
    notifications: {
      items: [
        row(
          '44444444-4444-4444-8444-444444444444',
          'notifications',
          'dev',
          'smtp',
          'host=localhost',
          1,
        ),
      ],
      pagination: { page: 1, pageSize: 50, total: 1 },
    },
    'search-indexer': {
      items: [
        row(
          '55555555-5555-4555-8555-555555555555',
          'search-indexer',
          'prod',
          'indexer_batch',
          '{"batch":100}',
          24,
        ),
        row(
          '66666666-6666-4666-8666-666666666666',
          'search-indexer',
          'prod',
          'opensearch_password',
          '***',
          2,
        ),
      ],
      pagination: { page: 1, pageSize: 50, total: 2 },
    },
  }

  const found = byService[serviceName]
  if (found) return found

  return {
    items: [],
    pagination: { page: 1, pageSize: 50, total: 0 },
  }
}
