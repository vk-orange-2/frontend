import type { ConfigListResponse, ServiceListResponse } from './types'

const S1 = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const S2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const S3 = 'a3bb189e-8bf9-3888-9912-ace7e8693000'

const now = '2026-04-12T10:00:00.000Z'

export const mockServiceList: ServiceListResponse = {
  items: [
    {
      id: S1,
      name: 'checkout-api',
      namespace: 'payments',
      description: 'Платёжный шлюз и корзина',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: S2,
      name: 'notifications',
      namespace: 'platform',
      description: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: S3,
      name: 'search-indexer',
      namespace: 'discovery',
      description: 'Индексация каталога',
      createdAt: now,
      updatedAt: now,
    },
  ],
  pagination: { page: 1, pageSize: 50, total: 3 },
}

const cfg = (
  id: string,
  serviceId: string,
  key: string,
  env: 'dev' | 'stage' | 'prod',
  type: 'config' | 'secret',
  format: 'kv' | 'json' | 'yaml',
  version: number,
): ConfigListResponse['items'][number] => ({
  id,
  serviceId,
  environment: env,
  configKey: key,
  configType: type,
  format,
  status: 'active',
  currentVersion: version,
  createdBy: 'admin@example.com',
  createdAt: now,
  updatedAt: now,
})

export function mockConfigsForService(serviceId: string): ConfigListResponse {
  const byService: Record<string, ConfigListResponse> = {
    [S1]: {
      items: [
        cfg(
          '11111111-1111-4111-8111-111111111111',
          S1,
          'feature_flags',
          'prod',
          'config',
          'json',
          12,
        ),
        cfg(
          '22222222-2222-4222-8222-222222222222',
          S1,
          'stripe_webhook_secret',
          'prod',
          'secret',
          'kv',
          3,
        ),
        cfg(
          '33333333-3333-4333-8333-333333333333',
          S1,
          'timeouts',
          'stage',
          'config',
          'yaml',
          7,
        ),
      ],
      pagination: { page: 1, pageSize: 50, total: 3 },
    },
    [S2]: {
      items: [
        cfg(
          '44444444-4444-4444-8444-444444444444',
          S2,
          'smtp',
          'dev',
          'config',
          'kv',
          1,
        ),
      ],
      pagination: { page: 1, pageSize: 50, total: 1 },
    },
    [S3]: {
      items: [
        cfg(
          '55555555-5555-4555-8555-555555555555',
          S3,
          'indexer_batch',
          'prod',
          'config',
          'json',
          24,
        ),
        cfg(
          '66666666-6666-4666-8666-666666666666',
          S3,
          'opensearch_password',
          'prod',
          'secret',
          'kv',
          2,
        ),
      ],
      pagination: { page: 1, pageSize: 50, total: 2 },
    },
  }

  const found = byService[serviceId]
  if (found) return found

  return {
    items: [],
    pagination: { page: 1, pageSize: 50, total: 0 },
  }
}
