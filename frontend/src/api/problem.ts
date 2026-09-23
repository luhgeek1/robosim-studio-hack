import { isAxiosError } from 'axios'
import type { Problem } from './types'

export type ApiProblem = {
  status: number | null
  code: Problem['error_code'] | 'NETWORK_ERROR' | 'UNKNOWN'
  title: string
  detail: string
  details: NonNullable<Problem['details']>
}

const FALLBACK_TEXT: Partial<Record<ApiProblem['code'], string>> = {
  NETWORK_ERROR: 'Сервер недоступен. Проверьте, что бэкенд запущен.',
  UNAUTHORIZED: 'Нужно войти в систему',
  TOKEN_EXPIRED: 'Сессия истекла, войдите снова',
  FORBIDDEN: 'Недостаточно прав',
  NOT_FOUND: 'Не найдено',
  RATE_LIMITED: 'Слишком много запросов, попробуйте через минуту',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
}

const isProblem = (value: unknown): value is Problem =>
  typeof value === 'object' && value !== null && 'error_code' in value && 'detail' in value

export function parseApiProblem(error: unknown): ApiProblem {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data
    if (isProblem(data)) {
      return {
        status: data.status,
        code: data.error_code,
        title: data.title,
        detail: data.detail || FALLBACK_TEXT[data.error_code] || data.title,
        details: data.details ?? [],
      }
    }
    if (!error.response) {
      return {
        status: null,
        code: 'NETWORK_ERROR',
        title: 'Нет связи',
        detail: FALLBACK_TEXT.NETWORK_ERROR!,
        details: [],
      }
    }
    return {
      status: error.response.status,
      code: 'UNKNOWN',
      title: error.message,
      detail: `Ошибка ${error.response.status}`,
      details: [],
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { status: null, code: 'UNKNOWN', title: message, detail: message, details: [] }
}

export const problemText = (error: unknown) => parseApiProblem(error).detail
