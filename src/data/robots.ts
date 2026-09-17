export type RobotId = 'ronavi-h1500' | 'dmr-carrier-p' | 'robocv-stacker'
export type RobotCount = 2 | 3 | 4
export type LoadMode = 'normal' | 'peak'

export type SimPoint = {
  throughput: number // паллет / час (пропускная способность)
  queue: number // паллет в очереди
  utilization: number // % загрузки роботов
  sla: number // %
  zones: [number, number, number, number] // receiving, storage, picking, shipping, 0..1
}

export type ConfigEcon = {
  capex: number // млн ₽
  opex: number // млн ₽ / год после внедрения
  payback: number | null // лет
  roi5y: number | null // %
  net5y: number // млн ₽ чистая выгода за 5 лет
}

export type RobotConfig = {
  normal: SimPoint
  peak: SimPoint
  econ: ConfigEcon
}

export type Robot = {
  id: RobotId
  name: string
  vendor: string
  type: string
  price: number // млн ₽ за единицу
  payload: number // кг
  perRobot: number // паллет / час
  compatibility: number // %
  fits: string[]
  risks: string[]
  dataQuality: { label: string; level: 'high' | 'medium' | 'low' }
  leadTime: string
  navigation: string
  battery: string
  recommendedCount: RobotCount
  meetsSla: boolean
  configs: Record<RobotCount, RobotConfig>
  summary: string
}

const cfg = (
  normal: [number, number, number, number, [number, number, number, number]],
  peak: [number, number, number, number, [number, number, number, number]],
  econ: [number, number, number | null, number | null, number],
): RobotConfig => ({
  normal: { throughput: normal[0], queue: normal[1], utilization: normal[2], sla: normal[3], zones: normal[4] },
  peak: { throughput: peak[0], queue: peak[1], utilization: peak[2], sla: peak[3], zones: peak[4] },
  econ: { capex: econ[0], opex: econ[1], payback: econ[2], roi5y: econ[3], net5y: econ[4] },
})

export const robots: Robot[] = [
  {
    id: 'ronavi-h1500',
    name: 'Ronavi H1500',
    vendor: 'Ronavi Robotics',
    type: 'AMR-перевозчик паллет',
    price: 3.1,
    payload: 1500,
    perRobot: 43,
    compatibility: 92,
    summary: 'Лучший баланс цены, производительности и совместимости с текущей планировкой.',
    fits: [
      'Проходит по проходам 2,8 м — роботу достаточно 2,4 м',
      'Грузоподъёмность 1 500 кг покрывает 100 % паллет склада',
      '3 робота дают 128 паллет / ч — выше пиковых 123',
      'Конфигурация 11,1 млн ₽ укладывается в бюджет 15 млн ₽',
      'Работает без разметки пола: навигация по лидару',
    ],
    risks: ['Требуется подтвердить интеграцию с WMS: версия API не указана в данных'],
    dataQuality: { label: 'Каталог производителя, обновлён в марте 2026', level: 'high' },
    leadTime: '8–10 недель',
    navigation: 'Лидар + SLAM, без разметки пола',
    battery: 'Li-ion, 10 ч работы, зарядка 1,5 ч',
    recommendedCount: 3,
    meetsSla: true,
    configs: {
      2: cfg([94, 31, 96, 79, [0.97, 0.74, 0.88, 0.62]], [94, 52, 99, 64, [1.0, 0.86, 0.95, 0.74]], [8.4, 25.0, 3.1, 165, 13.9]),
      3: cfg([128, 4, 81, 98, [0.71, 0.56, 0.64, 0.48]], [128, 9, 92, 96, [0.84, 0.66, 0.77, 0.58]], [11.1, 23.1, 2.2, 284, 31.5]),
      4: cfg([145, 1, 67, 99.5, [0.52, 0.44, 0.5, 0.38]], [145, 3, 78, 99, [0.63, 0.52, 0.6, 0.46]], [14.8, 23.9, 2.9, 250, 37.0]),
    },
  },
  {
    id: 'dmr-carrier-p',
    name: 'DMR Carrier P',
    vendor: 'DMR Systems',
    type: 'AGV-перевозчик паллет',
    price: 2.6,
    payload: 1200,
    perRobot: 34,
    compatibility: 78,
    summary: 'Дешевле за единицу, но нужен четвёртый робот и разметка пола — итоговая экономика хуже.',
    fits: [
      'Проходит по проходам 2,8 м',
      'Цена за робота на 16 % ниже',
      '4 робота дают 130 паллет / ч — достаточно для пика',
    ],
    risks: [
      'Грузоподъёмность 1 200 кг: около 12 % паллет тяжелее',
      'Нужна QR-разметка пола: +0,9 млн ₽ и 3 дня простоя зоны',
      'Для SLA нужны 4 робота, а не 3 — CAPEX сопоставим с Ronavi',
    ],
    dataQuality: { label: 'Данные партнёра, 2025 год', level: 'medium' },
    leadTime: '6–8 недель',
    navigation: 'QR-сетка на полу',
    battery: 'LiFePO4, 8 ч работы, зарядка 2 ч',
    recommendedCount: 4,
    meetsSla: true,
    configs: {
      2: cfg([70, 40, 99, 70, [1.0, 0.8, 0.9, 0.7]], [70, 60, 99, 55, [1.0, 0.9, 0.97, 0.8]], [6.4, 26.0, 3.6, 120, 7.7]),
      3: cfg([102, 22, 94, 84, [0.9, 0.66, 0.8, 0.58]], [102, 44, 99, 68, [1.0, 0.78, 0.9, 0.7]], [9.1, 24.3, 2.8, 190, 17.3]),
      4: cfg([130, 3, 78, 98.4, [0.66, 0.5, 0.6, 0.44]], [130, 8, 90, 96.2, [0.8, 0.6, 0.72, 0.54]], [11.7, 23.6, 2.4, 240, 28.1]),
    },
  },
  {
    id: 'robocv-stacker',
    name: 'RoboCV Stacker',
    vendor: 'RoboCV',
    type: 'Автономный штабелёр',
    price: 4.4,
    payload: 1400,
    perRobot: 29,
    compatibility: 71,
    summary: 'Умеет ставить паллеты на ярусы, но не проходит по части проходов и не укладывается в бюджет.',
    fits: [
      'Ставит паллеты на ярусы до 4,5 м — заменяет ричтраки',
      'Грузоподъёмность 1 400 кг покрывает 97 % паллет',
    ],
    risks: [
      'Нужны проходы от 3,2 м: 40 % проходов склада уже',
      'Производительность 29 паллет / ч: для пика нужно 5 роботов',
      '5 роботов — 22,8 млн ₽, выше бюджета 15 млн ₽',
    ],
    dataQuality: { label: 'Предварительная спецификация, требует уточнения', level: 'low' },
    leadTime: '12–14 недель',
    navigation: 'Лидар + магнитные метки в проходах',
    battery: 'Li-ion, 9 ч работы, зарядка 1,5 ч',
    recommendedCount: 4,
    meetsSla: false,
    configs: {
      2: cfg([58, 48, 99, 62, [1.0, 0.85, 0.94, 0.76]], [58, 66, 99, 48, [1.0, 0.94, 0.99, 0.86]], [9.6, 26.8, 4.4, 80, 4.2]),
      3: cfg([86, 30, 98, 76, [0.98, 0.72, 0.86, 0.66]], [86, 50, 99, 60, [1.0, 0.84, 0.94, 0.76]], [14.0, 25.2, 4.1, 110, 10.1]),
      4: cfg([112, 18, 93, 86, [0.9, 0.62, 0.78, 0.58]], [112, 38, 99, 72, [1.0, 0.74, 0.9, 0.68]], [18.4, 24.6, 3.8, 130, 14.6]),
    },
  },
]

export const robotById = (id: RobotId) => robots.find((r) => r.id === id)!

export const recommendedRobot = robots[0]

export const COUNTS: RobotCount[] = [2, 3, 4]

export const zoneNames = ['Приёмка', 'Хранение', 'Комплектация', 'Отгрузка'] as const
export const zoneKeys = ['receiving', 'storage', 'picking', 'shipping'] as const
export type ZoneKey = (typeof zoneKeys)[number]

export type ZoneStatus = 'normal' | 'high' | 'critical'
export const zoneStatus = (load: number): ZoneStatus => (load >= 0.9 ? 'critical' : load >= 0.75 ? 'high' : 'normal')
export const zoneStatusLabel: Record<ZoneStatus, string> = {
  normal: 'В норме',
  high: 'Высокая нагрузка',
  critical: 'Перегрузка',
}

/** Why-panel copy for the recommended robot */
export const explain = {
  why: {
    title: 'Почему 3',
    body: '3 робота — минимальная конфигурация, которая стабильно справляется с пиковой нагрузкой склада. Пропускная способность 128 паллет в час выше пиковых 123, очередь на приёмке не растёт, роботы загружены на 81 % — есть запас на рост объёмов без простоя.',
    points: ['Выполняет SLA 98 % в норме и 96 % в пик', 'Окупаемость 2,2 года — лучшая среди конфигураций', 'Запас мощности 4 % в пик и 29 % в среднем'],
  },
  notTwo: {
    title: 'Почему не 2',
    body: '2 робота дешевле на 2,7 млн ₽, но не обеспечивают требуемую производительность в пиковые часы. Мощность 94 паллеты в час ниже пиковых 123: на приёмке накапливается очередь, роботы работают почти без остановок, SLA падает до 79 %.',
    points: ['Дешевле на 2,7 млн ₽', 'SLA 79 % при требовании 95 %', 'Загрузка 96 % — нет запаса, любая пауза даёт сбой'],
  },
  notFour: {
    title: 'Почему не 4',
    body: '4 робота увеличивают пропускную способность до 145 паллет в час, но треть времени машины простаивают. Инвестиции выше на 3,7 млн ₽, а выгода почти не растёт: окупаемость удлиняется до 2,9 лет, ROI за 5 лет снижается с 284 % до 250 %.',
    points: ['Дороже на 3,7 млн ₽', 'Загрузка роботов 67 % — простой', 'ROI 5 лет 250 % против 284 %'],
  },
}
