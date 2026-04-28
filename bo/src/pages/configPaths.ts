export function configsListPath(serviceName: string): string {
  return `/services/${encodeURIComponent(serviceName)}/configs`
}

export function editConfigPath(
  serviceName: string,
  environment: string,
  configKey: string,
): string {
  return `${configsListPath(serviceName)}/${encodeURIComponent(environment)}/edit/${encodeURIComponent(configKey)}`
}

export function versionHistoryPath(
  serviceName: string,
  environment: string,
  configKey: string,
): string {
  return `${configsListPath(serviceName)}/${encodeURIComponent(environment)}/history/${encodeURIComponent(configKey)}`
}
