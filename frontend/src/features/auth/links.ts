export function safeReturnPath(value: string | null | undefined): string | null {
  if (
    !value ||
    value.includes('\\') ||
    Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c.charCodeAt(0) === 92)
  )
    return null
  return /^\/(?:projects|catalog|demo|account|invitations|organizations|admin|vendor|app)(?:[/?#]|$)/.test(value)
    ? value
    : null
}

export const PROVIDER_NAMES = { yandex: 'Яндекс ID', google: 'Google', vk: 'VK ID' } as const

export function authErrorText(key: string | null): string | null {
  if (!key) return null
  const messages: Record<string, string> = {
    account_conflict:
      'Аккаунт с такой почтой или связью уже есть. Войдите привычным способом и подключите сервис в настройках аккаунта.',
    action_forbidden:
      'Действие недоступно. Подтвердите почту и выполните новый вход; если аккаунт отключён, обратитесь к администратору.',
    email_required: 'Сервис не передал email. Зарегистрируйтесь по почте, затем подключите сервис в аккаунте.',
    provider_unavailable: 'Сервис входа временно недоступен. Повторите попытку или войдите другим способом.',
    login_failed: 'Вход не подтверждён или сессия входа истекла. Начните вход заново.',
  }
  return messages[key] ?? messages.login_failed
}
