/** Типы под REST config-server: GET /v1/services, GET /v1/configs */

export interface Pagination {
  page: number
  pageSize: number
  total: number
}

/** GET /v1/services — список имён сервисов. */
export interface Service {
  name: string
}

export interface ServiceListResponse {
  items: Service[]
  pagination: Pagination
}

/** Элемент из GET /v1/configs (JSON с бэкенда). */
export interface ConfigItem {
  id: string
  service: string
  env: string
  key: string
  value: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface ConfigListResponse {
  items: ConfigItem[]
  pagination: Pagination
}
