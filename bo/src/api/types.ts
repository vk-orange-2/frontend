/** Типы по OpenAPI: Distributed Real-Time Configuration Delivery API */

export type EnvironmentCode = 'dev' | 'stage' | 'prod'

export type ConfigType = 'config' | 'secret'

export type ConfigFormat = 'kv' | 'json' | 'yaml'

export type ConfigStatus = 'active' | 'deleted'

export interface Service {
  id: string
  name: string
  namespace: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
}

export interface ServiceListResponse {
  items: Service[]
  pagination: Pagination
}

export interface BaseConfig {
  id: string
  serviceId: string
  environment: EnvironmentCode
  configKey: string
  configType: ConfigType
  format: ConfigFormat
  status: ConfigStatus
  currentVersion: number
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ConfigListResponse {
  items: BaseConfig[]
  pagination: Pagination
}
