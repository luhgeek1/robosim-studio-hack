export const project = {
  id: 'wh-msk-01',
  name: 'Warehouse Moscow #01',
  address: 'Московская область, Домодедово, Логистический парк «Южные ворота»',
  source: 'warehouse_moscow_01.xlsx',
  importedAt: '12 сентября 2026, 14:32',
  recognized: 47,
  total: 51,
  confidence: 91,
}

export type ParamGroup = {
  title: string
  items: { label: string; value: string; note?: string; status?: 'ok' | 'assumed' | 'missing' }[]
}

export const paramGroups: ParamGroup[] = [
  {
    title: 'Помещение',
    items: [
      { label: 'Площадь склада', value: '20 000 м²', status: 'ok' },
      { label: 'Роботизируемая зона', value: '10 000 м²', status: 'ok' },
      { label: 'Высота потолков', value: '12 м', status: 'ok' },
      { label: 'Ширина проходов', value: '2,8 м', status: 'ok' },
      { label: 'Ровность пола', value: 'класс FM2', status: 'assumed', note: 'оценка по году постройки' },
    ],
  },
  {
    title: 'Поток',
    items: [
      { label: 'Приёмка', value: '1 000 паллет / сутки', status: 'ok' },
      { label: 'Отгрузка', value: '1 000 паллет / сутки', status: 'ok' },
      { label: 'Пиковая нагрузка', value: '×1,35 к среднему', status: 'assumed', note: '14:00–18:00' },
      { label: 'Средний вес паллеты', value: '—', status: 'missing' },
    ],
  },
  {
    title: 'Хранение и системы',
    items: [
      { label: 'Стеллажи', value: 'паллетные, 5 ярусов, 4 200 мест', status: 'ok' },
      { label: 'Рабочие зоны', value: 'приёмка, хранение, комплектация, отгрузка', status: 'ok' },
      { label: 'WMS', value: 'есть, версия API не указана', status: 'assumed' },
    ],
  },
  {
    title: 'Люди и деньги',
    items: [
      { label: 'Персонал в зоне', value: '28 человек, 2 смены', status: 'ok' },
      { label: 'Расходы на персонал', value: '27,6 млн ₽ / год', status: 'ok' },
      { label: 'Бюджет на роботизацию', value: 'до 15 млн ₽', status: 'ok' },
      { label: 'Требование к SLA', value: '≥ 95 % отгрузок в срок', status: 'ok' },
    ],
  },
]

export type ConfidenceItem = { label: string; detail?: string }

export const confidence = {
  confirmed: [
    { label: 'Площадь склада и роботизируемой зоны', detail: 'из плана БТИ' },
    { label: 'Поток паллет: приёмка и отгрузка', detail: 'выгрузка WMS за 90 дней' },
    { label: 'Ширина проходов 2,8 м', detail: 'из плана стеллажей' },
    { label: 'Тип и ёмкость стеллажей', detail: '4 200 паллето-мест' },
    { label: 'Штат и расходы на персонал', detail: '28 человек, 82 000 ₽ / мес' },
    { label: 'Бюджет и требования к SLA', detail: 'до 15 млн ₽, SLA ≥ 95 %' },
    { label: 'График работы', detail: '2 смены по 11 часов' },
  ] as ConfidenceItem[],
  assumptions: [
    { label: 'Стоимость технического обслуживания роботов', detail: '6 % от CAPEX в год — отраслевая оценка' },
    { label: 'Средняя загрузка в пик', detail: 'коэффициент 1,35 — по похожим объектам' },
    { label: 'Ровность пола', detail: 'класс FM2 — не подтверждено замером' },
    { label: 'Индексация зарплат', detail: '8 % в год' },
    { label: 'Доля паллет тяжелее 1 200 кг', detail: '12 % — по структуре номенклатуры' },
    { label: 'Тариф на электроэнергию', detail: '7,4 ₽ / кВт·ч' },
  ] as ConfidenceItem[],
  missing: [
    { label: 'Средний вес паллеты', detail: 'влияет на выбор грузоподъёмности' },
    { label: 'Версия API WMS', detail: 'влияет на стоимость интеграции' },
    { label: 'Карта покрытия Wi-Fi', detail: 'нужна для навигации роботов' },
    { label: 'Температурный режим в зоне', detail: 'ограничивает выбор батарей' },
  ] as ConfidenceItem[],
}

/** Hourly pallet moves (in + out) across the day, sums to ~2000. */
export const hourlyLoad: { hour: number; value: number }[] = [
  { hour: 0, value: 48 }, { hour: 1, value: 42 }, { hour: 2, value: 36 }, { hour: 3, value: 30 },
  { hour: 4, value: 34 }, { hour: 5, value: 52 }, { hour: 6, value: 74 }, { hour: 7, value: 88 },
  { hour: 8, value: 96 }, { hour: 9, value: 102 }, { hour: 10, value: 104 }, { hour: 11, value: 98 },
  { hour: 12, value: 92 }, { hour: 13, value: 108 }, { hour: 14, value: 118 }, { hour: 15, value: 123 },
  { hour: 16, value: 121 }, { hour: 17, value: 116 }, { hour: 18, value: 104 }, { hour: 19, value: 96 },
  { hour: 20, value: 90 }, { hour: 21, value: 84 }, { hour: 22, value: 76 }, { hour: 23, value: 62 },
]

export const demand = {
  averagePerHour: 91,
  peakPerHour: 123,
  manualCapacityPerHour: 96,
  requiredPerHour: 120,
  slaTarget: 95,
  currentPeakSla: 86,
  currentOpex: 30.2, // млн ₽ / год
  budget: 15,
}
