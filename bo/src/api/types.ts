/** Типы под REST config-server: GET /v1/services, GET /v1/configs */

/** Элемент списка из GET /v1/services (ServiceResponse.java). */
export interface ServiceResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

/** Вложенный объект в ConfigResponse.java. */
export interface ConfigLatestVersion {
  payload: unknown;
}

/** Элемент массива configs в GET /v1/configs (ConfigResponse.java). */
export interface ConfigResponse {
  id?: string;
  configKey: string;
  service?: string;
  environment?: string;
  isSecret?: boolean;
  status?: string;
  currentVersion: number;
  latestVersion: ConfigLatestVersion;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

/** Тело ответа GET /v1/configs (ConfigListResponse.java). */
export interface ConfigListResponse {
  configs: ConfigResponse[];
}

/**
 * Одна строка UI после объединения ответов GET /v1/configs
 * для нескольких значений query-параметра environment.
 */
export interface ServiceConfigRow extends ConfigResponse {
  environment: string;
}

/** Тело POST /v1/services (CreateServiceRequest.java). */
export interface CreateServiceRequest {
  name: string;
  description?: string;
}

/** Тело POST /v1/configs (CreateConfigRequest.java). */
export interface CreateConfigRequest {
  service: string;
  env: string;
  key: string;
  value: unknown;
  /** При обновлении существующего конфига обязателен (иначе VERSION_CONFLICT). */
  expectedVersion?: number;
  isSecret?: boolean;
}

/** Тело DELETE /v1/configs/{id} (DeleteConfigRequest.java). */
export interface DeleteConfigRequest {
  /** Текущая версия конфигурации для оптимистичной блокировки. */
  expectedVersion: number;
}

/** Тело POST /v1/rollouts/config/{configId}/rollback (RollbackRequest.java). */
export interface RollbackRequest {
  targetVersion: number;
  /** Текущая версия конфигурации для оптимистичной блокировки. */
  expectedVersion: number;
  comment?: string;
}

/**
 * Элемент GET /v1/configs/{id}/versions (VersionResponse.java),
 * варианты changeType: create, update, delete, rollback.
 */
export interface ConfigVersionEntry {
  id?: string;
  configId?: string;
  version: number;
  payload: unknown;
  changeType: string;
  author: string;
  comment: string | null;
  createdAt: string;
}

/** Ответ GET /v1/configs/{id}/versions (VersionHistoryResponse.java). */
export interface VersionHistoryResponse {
  versions: ConfigVersionEntry[];
}

/** Элемент GET /v1/audit (AuditLogResponse.java). */
export interface AuditLogEntry {
  id: string;
  configId: string;
  serviceName: string;
  environment: string;
  configKey: string;
  operation: string;
  actor: string;
  sourceIp: string | null;
  versionBefore: number | null;
  versionAfter: number | null;
  diff: unknown;
  createdAt: string;
}

/** Ответ GET /v1/audit (AuditSearchResponse.java). */
export interface AuditSearchResult {
  entries: AuditLogEntry[];
  totalCount: number;
}

/** Тело POST /v1/rollouts (CreateRolloutRequest.java). */
export interface CreateRolloutRequest {
  configId: string;
  type: "instant" | "gradual" | "canary";
  totalDeployments?: number;
  deploymentIntervalSeconds?: number;
  /** Только для type=canary, 1–99. */
  canaryPercentage?: number;
}

/** Ответ rollout-эндпоинтов (RolloutResponse.java). */
export interface RolloutResponse {
  id: string;
  configId: string;
  type: string;
  status: string;
  baselineVersion: number;
  targetVersion: number;
  totalDeployments: number;
  currentDeployment: number;
  deploymentIntervalSeconds: number;
  canaryPercentage?: number | null;
  nextDeploymentAt?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  stoppedAt?: string | null;
  rolledBackAt?: string | null;
}
