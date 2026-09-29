import type { OrganizationRole } from '@/shared/api/types'

export const ROLE_LABEL: Record<OrganizationRole, string> = {
  owner: 'Владелец',
  member: 'Участник',
}

// Буква для аватарки рабочей области: первая буква названия без кавычек и ОПФ («ООО «Север»» → «С»).
export function initialOf(name: string | null | undefined): string {
  const cleaned = (name ?? '').replace(/^(ООО|АО|ПАО|ЗАО|ИП|ГБУ|ГУП|ФГУП)\s+/i, '').replace(/[«»"'\s]/g, '')
  return (cleaned[0] ?? '?').toUpperCase()
}

// Название в кавычках для текста; «ООО «Север»» уже закавычено — вторые кавычки не добавляем.
export const quoted = (name: string) => (/[«"]/.test(name) ? name : `«${name}»`)
