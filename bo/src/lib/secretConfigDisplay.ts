/** Текст вместо payload для секретов в списках и истории (значение по-прежнему доступно в редакторе с API). */
export const SECRET_PAYLOAD_PLACEHOLDER = '••••••••'

export function isSecretConfig(flag: boolean | undefined): flag is true {
  return flag === true
}

export function secretPlaceholderOrFormat(
  formattedPayload: string,
  isSecret: boolean | undefined,
): string {
  return isSecretConfig(isSecret) ? SECRET_PAYLOAD_PLACEHOLDER : formattedPayload
}
