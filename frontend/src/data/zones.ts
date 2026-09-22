export const zoneNames = ['Приёмка', 'Хранение', 'Комплектация', 'Отгрузка'] as const
export type ZoneStatus = 'normal' | 'high' | 'critical'
export const zoneStatus = (load: number): ZoneStatus => (load >= 0.9 ? 'critical' : load >= 0.75 ? 'high' : 'normal')
export const zoneStatusLabel: Record<ZoneStatus, string> = { normal: 'В норме', high: 'Высокая нагрузка', critical: 'Перегрузка' }
