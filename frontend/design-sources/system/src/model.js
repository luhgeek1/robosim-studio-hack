/** Visual paths explain circulation only; they do not run the production DES solver. */
export const ROUTES = [
  [
    [-9.6, 5],
    [8.7, 5],
    [8.7, -5.5],
    [-9.6, -5.5],
    [-9.6, 5],
  ],
  [
    [-9.6, 0.1],
    [8.7, 0.1],
    [8.7, 5],
    [-9.6, 5],
    [-9.6, 0.1],
  ],
  [
    [-9.6, -5.5],
    [8.7, -5.5],
    [8.7, 0.1],
    [-9.6, 0.1],
    [-9.6, -5.5],
  ],
]
export function pathLength(points) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0)
}
export function pointOnPath(points, distance) {
  const length = pathLength(points)
  let remaining = ((distance % length) + length) % length
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      segment = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (remaining <= segment)
      return {
        x: a[0] + ((b[0] - a[0]) * remaining) / segment,
        z: a[1] + ((b[1] - a[1]) * remaining) / segment,
        angle: Math.atan2(b[0] - a[0], b[1] - a[1]),
      }
    remaining -= segment
  }
  return { x: points[0][0], z: points[0][1], angle: 0 }
}
export const INSPECTIONS = {
  routes: {
    label: 'Маршруты',
    note: 'Приёмка → хранение → отгрузка',
    title: 'Парк работает как система',
    text: 'Общие проходы и станции ограничивают поток. Проверка уточняет парк и его экономику.',
  },
  queues: {
    label: 'Очереди',
    note: 'Общие зоны загрузки и пересечения',
    title: 'Больше роботов не всегда лучше',
    text: 'На узких участках роботы ждут друг друга. В имитации видны очереди, которые скрывает средняя производительность.',
  },
  charging: {
    label: 'Зарядка',
    note: 'Возврат на станцию и доступность парка',
    title: 'Зарядка тоже занимает ресурсы',
    text: 'Пока часть роботов заряжается, задачи продолжают поступать. Парк проверяется вместе со станциями и резервом.',
  },
}
export const FINANCE = {
  current: {
    label: 'В текущем процессе',
    title: 'Сначала зафиксируйте точку отсчёта.',
    copy: 'Число сотрудников, сменность, техника и текущие расходы задают базу сравнения. Без неё эффект роботизации нельзя оценить.',
  },
  purchase: {
    label: 'В сценарии покупки',
    title: 'Цена оборудования только начало.',
    copy: 'В расчёт входят парк с резервом, интеграция, инфраструктура и эксплуатация. Эффект сравнивается с текущими затратами.',
  },
  raas: {
    label: 'В сценарии RaaS',
    title: 'Проверьте, что входит в платёж.',
    copy: 'Регулярная плата сопоставляется с текущими расходами. Состав сервиса, интеграция и обязательства сторон требуют уточнения у поставщика.',
  },
  leasing: {
    label: 'В сценарии лизинга',
    title: 'Важен весь график платежей.',
    copy: 'Аванс, срок, платежи и выкуп меняют денежный поток. Эксплуатационные расходы и условия запуска учитываются отдельно.',
  },
}
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
