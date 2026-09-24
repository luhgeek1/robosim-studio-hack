import { Arm, armLayout } from './models/industrial'
import { Cleaner, Courier, Humanoid, Security, Sweeper } from './models/service'
import { Asrs, Cube, Inventory, asrsLayout, cubeLayout, inventoryLayout } from './models/storage'
import { Agro, Marine, PipeCrawler, Roller } from './models/field'
import { Exo, Neutral, RailRover, RoboCafe, Shuttle, Ugv } from './models/misc'
import { LightPicking, PICKING_ROWS } from './models/picking'
import { Drone, Truck, droneLayout } from './models/vehicles'
import {
  AmrLift,
  G2P,
  SorterConveyor,
  SorterTilt,
  Stacker,
  Tug,
  amrLoad,
  stackerLayout,
  tugLayout,
} from './models/warehouse'
import type { Product } from '@/shared/api/types'
import { mm, type Kind } from './types'

const isCube = (p: Product) => /SmartCube/i.test(p.name)
const isStreetCleaner = (p: Product) => /БРО|Пиксель|Веном|Депеша|Surfex|^МАРК$/.test(p.name.trim())

// Specs come from research/catalog_specs/warehouse_specs.yaml (the same values the catalog shows); keys listed in
// `assumed` are drawing assumptions where neither the catalog nor research has a number.

export const GROUPS = [
  'Склад: перемещение',
  'Склад: хранение и учёт',
  'Производство',
  'Уборка',
  'Сервис и охрана',
  'Транспорт и БАС',
  'Отрасли и инфраструктура',
  'Новые классы',
]

export const KINDS: Kind[] = [
  {
    id: 'amr-lift',
    classes: ['amr_transport'],
    claims: (p) => p.subtype !== 'Робот-ровер',
    title: 'AMR под паллету',
    group: GROUPS[0],
    accent: '#2f7fd8',
    does: 'Подъезжает под паллету, приподнимает её и везёт по складу',
    shape: 'Габариты корпуса — из ТТХ; высота груза растёт с грузоподъёмностью; скорость дорожки — макс. скорость',
    anim: 'Подъём стола → проезд → разворот на месте под грузом → опускание',
    variants: [
      {
        id: 'h1500',
        name: 'Ronavi H1500',
        spec: { dims_mm: [1044, 654, 380], payload_kg: 1500, speed_mps: 1.5, runtime_h: 10 },
      },
      {
        id: 'h2000',
        name: 'Ronavi H2000',
        spec: { dims_mm: [1540, 990, 250], payload_kg: 2000, speed_mps: 1.0, runtime_h: 10 },
      },
      {
        id: 'amr800',
        name: 'МОРОС AMR 800',
        match: /^AMR 800/,
        spec: { dims_mm: [940, 640, 230], payload_kg: 800, speed_mps: 2.0, runtime_h: 24 },
      },
      {
        id: 'dmr600',
        name: 'ДиКом DMR 600',
        match: /DMR 600/,
        spec: { dims_mm: [960, 650, 250], payload_kg: 600, speed_mps: 2.0, lift_mm: 60, runtime_h: 8 },
      },
    ],
    Model: AmrLift,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [1000, 650, 300])
      const { pw, pd, stack } = amrLoad(L, W, v.spec.payload_kg ?? 1000)
      return { w: pw, d: pd, h: H + 0.25 + stack }
    },
  },
  {
    id: 'g2p',
    classes: ['goods_to_person'],
    claims: (p) => !isCube(p),
    title: 'G2P: подвоз стеллажа',
    group: GROUPS[0],
    accent: '#7a5cd6',
    does: 'Заезжает под мобильный стеллаж и подвозит его к станции отбора',
    shape: 'Корпус — по габаритам Ronavi M; время заезда — от макс. скорости 2,5 м/с',
    anim: 'Заезд под стеллаж → подъём → поворот стеллажа нужной гранью → выезд',
    variants: [
      {
        id: 'm',
        name: 'Ronavi M',
        match: /Ronavi M\b/,
        spec: { dims_mm: [960, 660, 335], payload_kg: 1200, speed_mps: 2.5, runtime_h: 8 },
      },
    ],
    Model: G2P,
    bounds: () => ({ w: 2.8, d: 1.2, h: 2.05 }),
  },
  {
    id: 'sorter-tilt',
    classes: ['sorting_robot'],
    claims: (p) => /\bSD\b/.test(p.name),
    title: 'Сортировщик с откидной крышкой',
    group: GROUPS[0],
    accent: '#f08c2e',
    does: 'Возит посылку до 10 кг и сбрасывает её в люк нужного направления',
    shape: 'Размер посылки — от грузоподъёмности; шаг до люка — от скорости',
    anim: 'Проезд к люку → наклон лотка → посылка падает в люк → новая посылка',
    variants: [
      {
        id: 'sd',
        name: 'Ronavi SD',
        spec: { dims_mm: [420, 400, 200], payload_kg: 10, speed_mps: 2.5, runtime_h: 10 },
      },
    ],
    Model: SorterTilt,
    bounds: () => ({ w: 1.2, d: 1.1, h: 0.5 }),
  },
  {
    id: 'sorter-conveyor',
    classes: ['sorting_robot'],
    title: 'Робот с подъёмным конвейером',
    group: GROUPS[0],
    accent: '#16a3a3',
    does: 'Перекладывает ящики между конвейерами на разной высоте',
    shape: 'Высоты столов — внутри диапазона подъёма 200–1000 мм из ТТХ',
    anim: 'Приём ящика роликами → подъём деки → выгрузка на верхний конвейер',
    variants: [
      {
        id: 'sr',
        name: 'Ronavi SR',
        spec: {
          dims_mm: [590, 810, 870],
          payload_kg: 50,
          speed_mps: 3.0,
          lift_min_mm: 200,
          lift_mm: 1000,
          runtime_h: 16,
        },
      },
    ],
    Model: SorterConveyor,
    bounds: (v) => {
      const [L, W] = mm(v.spec.dims_mm, [590, 810, 870])
      return { w: L + 0.3, d: W + 1.7, h: (v.spec.lift_mm ?? 1000) / 1000 + 0.3 }
    },
  },
  {
    id: 'stacker',
    classes: ['fmr_forklift'],
    title: 'Автономный штабелёр (FMR)',
    group: GROUPS[0],
    accent: '#f2a93b',
    does: 'Берёт паллету вилами и ставит её на ярус стеллажа',
    shape: 'Высота мачты и ярус стеллажа — высота подъёма; груз на вилах — грузоподъёмность; корпус — габариты',
    anim: 'Подъём вил → заезд в ячейку → укладка → через цикл забирает паллету обратно',
    variants: [
      {
        id: 'robocv',
        name: 'RoboCV штабелёр',
        match: /штабел[её]р RoboCV/i,
        spec: { dims_mm: [2100, 1100, 3000], payload_kg: 1400, speed_mps: 2.0, lift_mm: 7000 },
      },
      {
        id: 'carrierp',
        name: 'ДиКом DMR Carrier P',
        match: /Carrier P/,
        spec: { dims_mm: [1750, 900, 2000], payload_kg: 1500, speed_mps: 1.5, lift_mm: 1600, runtime_h: 10 },
        assumed: ['dims_mm'],
      },
      {
        id: 'ak2000',
        name: 'АК-2000-2',
        match: /[АA][КK]-2000/,
        spec: { dims_mm: [1980, 1065, 2285], payload_kg: 2000, speed_mps: 2.6, lift_mm: 175 },
      },
    ],
    Model: Stacker,
    bounds: (v) => {
      const s = stackerLayout(v)
      return { w: s.xmax - s.xmin, d: 1.6, h: Math.max(s.H, s.lift + 0.144 + s.stack + 0.3) }
    },
  },
  {
    id: 'tug',
    classes: ['tow_tractor'],
    title: 'Беспилотный тягач',
    group: GROUPS[0],
    accent: '#e0533d',
    does: 'Буксирует сцепку тележек по маршруту',
    shape: 'Число тележек — буксируемая масса / 1,6 т; корпус и высота стойки датчиков — габариты',
    anim: 'Разгон со сцепкой, покачивание тележек, остановка',
    variants: [
      {
        id: 'robocv-tug',
        name: 'Робот-тягач RoboCV',
        spec: { dims_mm: [1600, 800, 2200], tow_kg: 5000, speed_mps: 2.2 },
      },
      {
        id: 'cognitive',
        name: 'Когнитив Пилот',
        match: /Когнитив/,
        spec: { dims_mm: [2600, 1300, 1500], tow_kg: 3000, speed_mps: 4.2 },
        assumed: ['dims_mm'],
      },
    ],
    Model: Tug,
    bounds: (v) => {
      const s = tugLayout(v)
      return { w: s.total, d: Math.max(s.W, s.cartW) + 0.4, h: Math.max(s.H, 1.7) }
    },
  },
  {
    id: 'asrs',
    classes: ['asrs_storage'],
    title: 'Кран-штабелёр AS/RS',
    group: GROUPS[1],
    accent: '#f2b441',
    does: 'Автоматически ставит и достаёт грузы в высотном стеллаже',
    shape: 'Ярусы по шагу паллетного места, показан срез нижних; полная высота — в ТТХ',
    anim: 'Приём с поста → проезд с подъёмом → выдвижение вил в ячейку → возврат',
    variants: [
      { id: 'p', name: 'ДиКом AS-RS P', match: /AS-RS P/, spec: { payload_kg: 3000, height_m: 24 } },
      { id: 'b', name: 'ДиКом AS-RS B', match: /AS-RS B/, spec: { height_m: 12 } },
    ],
    Model: Asrs,
    bounds: (v) => {
      const s = asrsLayout(v)
      return { w: s.length, d: s.aisle + s.depth * 2, h: s.visH + 0.4 }
    },
  },
  {
    id: 'cube',
    classes: ['goods_to_person'],
    claims: isCube,
    title: 'Кубическое хранение',
    group: GROUPS[1],
    accent: '#2f7fd8',
    does: 'Роботы ездят по решётке сверху и достают ящики из колонн',
    shape: 'Высота куба до 14 м — показан срез верхних 8 ярусов',
    anim: 'Захват опускается в колонну → ящик поднимается в робота → перевоз в соседнюю колонну',
    variants: [{ id: 'smartcube', name: 'SmartCube', spec: { height_m: 14 } }],
    Model: Cube,
    bounds: (v) => {
      const s = cubeLayout(v)
      return { w: s.nx * s.cx, d: s.nz * s.cz, h: s.gridH + 0.6 }
    },
  },
  {
    id: 'inventory',
    classes: ['inventory_robot'],
    title: 'Робот-инвентаризатор',
    group: GROUPS[1],
    accent: '#16a3a3',
    does: 'Объезжает стеллаж, поднимает камеры к каждой ячейке и отмечает посчитанные позиции',
    shape: 'Число рядов — высота сканирования (показана в масштабе); время подъезда — скорость; корпус — габариты',
    anim: 'Подъезд к ячейке → считывание штрихкода → зелёная отметка; табло показывает долю проверенных',
    variants: [
      {
        id: 'yandex',
        name: 'Яндекс Роботикс',
        match: /^Робот инвентаризатор/,
        spec: { height_m: 12.5, speed_mps: 1.0, dims_mm: [900, 700, 420] },
        assumed: ['speed_mps', 'dims_mm'],
      },
      {
        id: 'neurus',
        name: 'AI Stock Counter 12M',
        match: /AI Stock/,
        spec: { height_m: 12, speed_mps: 0.6, runtime_h: 2, dims_mm: [800, 600, 380] },
        assumed: ['dims_mm'],
      },
    ],
    Model: Inventory,
    bounds: (v) => {
      const s = inventoryLayout(v)
      return { w: s.width + 0.4, d: 2.3, h: s.rackH + 0.5 }
    },
  },
  {
    id: 'pick-assist',
    classes: ['pick_assist'],
    title: 'Световой отбор',
    group: GROUPS[1],
    accent: '#f2b441',
    does: 'Система помощи отбору: подсвечивает ячейку, показывает количество и принимает подтверждение сборщика',
    shape: 'Одна сцена на класс (Pick-by-Light, Pick-by-Voice): стеллаж 3 × 3 ячейки',
    anim: 'Ячейка подсвечивается → лоток выдвигается, табло отсчитывает штуки → кнопка загорается зелёным',
    variants: [{ id: 'pbl', name: 'Pick by Light', spec: {} }],
    Model: LightPicking,
    bounds: () => ({ w: 2.3, d: 1.2, h: PICKING_ROWS * 0.56 + 0.45 }),
  },
  {
    id: 'arm',
    classes: ['industrial_arm', 'palletizing_arm', 'piece_picking_arm'],
    title: 'Робот-манипулятор',
    group: GROUPS[2],
    accent: '#f08c2e',
    does: 'Паллетирует: берёт короба с конвейера и укладывает на поддон',
    shape: 'Длины звеньев — вылет, толщина и размер короба — грузоподъёмность (А25-1720 = 25 кг, 1720 мм)',
    anim: 'Захват с конвейера → перенос → укладка 2×2 на поддон',
    variants: [
      { id: 'a6', name: 'Модель А6-2000', spec: { payload_kg: 6, reach_mm: 2000 } },
      { id: 'a12', name: 'Модель А12-1450', spec: { payload_kg: 12, reach_mm: 1450 } },
      { id: 'a25', name: 'Модель А25-1720', spec: { payload_kg: 25, reach_mm: 1720 } },
      { id: 'a220', name: 'Модель А220-2700', spec: { payload_kg: 220, reach_mm: 2700 } },
      {
        id: 'beryl',
        name: 'Берилл',
        match: /Берилл/,
        spec: { payload_kg: 5, reach_mm: 900 },
        assumed: ['payload_kg', 'reach_mm'],
      },
    ],
    Model: Arm,
    bounds: (v) => {
      const s = armLayout(v)
      return { w: s.R * 1.1, d: s.R * 1.35, h: s.hS + s.a * 0.7 }
    },
  },
  {
    id: 'cleaner',
    classes: ['cleaning_robot'],
    claims: (p) => !isStreetCleaner(p),
    title: 'Робот-уборщик помещений',
    group: GROUPS[3],
    accent: '#2bb3a3',
    does: 'Моет и сушит полы по заданному маршруту',
    shape: 'Корпус — габариты из ТТХ; индикатор батареи — автономность в часах',
    anim: 'Проход полосой: щётки крутятся, пятна исчезают, за роботом — влажный след',
    variants: [
      { id: 'cb400', name: 'Клинботикс 400 PRO', spec: { dims_mm: [676, 560, 744], runtime_h: 3 } },
      { id: 'mark2', name: 'MARK 2 SE', spec: { dims_mm: [860, 610, 980], runtime_h: 3 } },
      { id: 'unit', name: 'Unit', spec: { dims_mm: [900, 560, 800], runtime_h: 5 } },
    ],
    Model: Cleaner,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [700, 560, 750])
      return { w: L * 2.2, d: W * 1.4, h: H }
    },
  },
  {
    id: 'sweeper',
    classes: ['cleaning_robot'],
    title: 'Уличный уборщик',
    group: GROUPS[3],
    accent: '#3c9a5f',
    does: 'Подметает тротуары и дворы, собирает листву в бункер',
    shape: 'ТТХ в каталоге нет — габариты и скорость приняты как допущение',
    anim: 'Проезд: боковые щётки сметают листья, мигает маячок',
    variants: [
      {
        id: 'bro',
        name: 'БРО 3.0',
        spec: { dims_mm: [2200, 1100, 1600], speed_mps: 1.4 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: Sweeper,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [2200, 1100, 1600])
      return { w: L * 1.4, d: W * 1.3, h: H }
    },
  },
  {
    id: 'humanoid',
    classes: ['humanoid_robot', 'service_robot'],
    claims: (p) => p.solution_type === 'humanoid_robot' || p.subtype === 'Антропоморфный робот',
    title: 'Антропоморфный сервисный робот',
    group: GROUPS[4],
    accent: '#7a5cd6',
    does: 'Встречает посетителей, отвечает на вопросы, показывает маршрут',
    shape: 'Масштаб фигуры — рост робота',
    anim: 'Смотрит по сторонам, моргает, машет рукой; экран на груди переливается',
    variants: [{ id: 'promobot', name: 'Promobot V.4', spec: { dims_mm: [600, 600, 1550] }, assumed: ['dims_mm'] }],
    Model: Humanoid,
    bounds: (v) => ({ w: 0.8, d: 0.8, h: (v.spec.dims_mm?.[2] ?? 1550) / 1000 }),
  },
  {
    id: 'courier',
    classes: ['last_mile_delivery', 'amr_transport'],
    claims: (p) => p.solution_type !== 'amr_transport' || p.subtype === 'Робот-ровер',
    title: 'Робот-курьер',
    group: GROUPS[4],
    accent: '#f2b441',
    does: 'Доставляет посылку последней мили по тротуару или территории',
    shape: 'Корпус и посылка — габариты; скорость дорожки — макс. скорость',
    anim: 'Проезд → остановка → крышка открывается, посылка приподнимается',
    variants: [
      {
        id: 'rover',
        name: 'Яндекс-ровер R 4.0',
        spec: { dims_mm: [800, 600, 750], payload_kg: 20, speed_mps: 1.5 },
        assumed: ['dims_mm', 'payload_kg', 'speed_mps'],
      },
      {
        id: 'cargo',
        name: 'Cargo UNIT',
        spec: { dims_mm: [1200, 800, 500], payload_kg: 150, speed_mps: 8.3, runtime_h: 6 },
      },
    ],
    Model: Courier,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [800, 600, 750])
      return { w: L * 1.8, d: W * 1.4, h: H + 0.8 }
    },
  },
  {
    id: 'security',
    classes: ['service_robot'],
    title: 'Охранный робот',
    group: GROUPS[4],
    accent: '#2d4a8a',
    does: 'Патрулирует территорию, ведёт видеонаблюдение и подаёт сигнал',
    shape: 'ТТХ в каталоге нет — габариты приняты как допущение',
    anim: 'Патруль → остановка → поворотная камера осматривает сектор, мигают огни',
    variants: [
      {
        id: 'gorodovoy',
        name: 'Робот Городовой',
        spec: { dims_mm: [900, 700, 1650], speed_mps: 1.5 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: Security,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [900, 700, 1650])
      return { w: L * 2.4, d: W * 1.4, h: H }
    },
  },
  {
    id: 'truck',
    classes: ['autonomous_truck', 'road_offroad_vehicle'],
    title: 'Беспилотный грузовик',
    group: GROUPS[5],
    accent: '#3c9a5f',
    does: 'Перевозит паллеты между складами по закрытой территории',
    shape: 'Число паллет — грузоподъёмность / 333 кг (2 т = 6 европаллет); габариты из ТТХ',
    anim: 'Разгон и торможение с покачиванием кузова, лидары вращаются, мигают поворотники',
    variants: [
      { id: 'evocargo', name: 'EVOCARGO N1', spec: { dims_mm: [5000, 1800, 2200], payload_kg: 2000, speed_mps: 6.9 } },
    ],
    Model: Truck,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [5000, 1800, 2200])
      return { w: L, d: W, h: H }
    },
  },
  {
    id: 'drone',
    classes: ['uav'],
    title: 'БАС мультироторного типа',
    group: GROUPS[5],
    accent: '#e0533d',
    does: 'Доставляет грузы на лебёдке или осматривает здания камерой',
    shape: 'Размах лучей и размер груза на лебёдке — грузоподъёмность',
    anim: 'Зависание, винты вращаются, посылка спускается на тросе и поднимается обратно',
    variants: [
      { id: 'courier30', name: 'Курьер-30', spec: { payload_kg: 30 }, assumed: ['payload_kg'] },
      { id: 'defect', name: 'Дефектоскоп', spec: { payload_kg: 2 }, assumed: ['payload_kg'] },
    ],
    Model: Drone,
    bounds: (v) => {
      const s = droneLayout(v)
      return { w: s.armL * 2.4, d: s.armL * 2.4, h: s.hover + 0.3 }
    },
  },
  {
    id: 'marine',
    classes: ['marine_robot'],
    title: 'Морской робот',
    group: GROUPS[6],
    accent: '#2f7fd8',
    does: 'Безэкипажный катер: мониторинг акватории, работы на воде, доставка грузов',
    shape: 'Длина и ширина корпусов, высота мачты — габариты; скорость кильватерного следа — макс. скорость',
    anim: 'Идёт по воде с покачиванием, за корпусами пена, вращается антенна радара',
    variants: [
      {
        id: 'sargan',
        name: 'Сарган',
        spec: { dims_mm: [3000, 1400, 1100], speed_mps: 2.5 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: Marine,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [3000, 1400, 1100])
      return { w: L * 1.3, d: W * 1.5, h: H + 0.2 }
    },
  },
  {
    id: 'agro',
    classes: ['agro_robot'],
    title: 'Сельскохозяйственный робот',
    group: GROUPS[6],
    accent: '#3c9a5f',
    does: 'Беспилотный трактор без кабины: обработка почвы, уход за посевами, сбор урожая',
    shape: 'Корпус, колёса и ширина культиватора — габариты; скорость — макс. скорость',
    anim: 'Едет над рядами растений, культиватор рыхлит междурядья',
    variants: [
      {
        id: 'agrobot',
        name: 'Агробот',
        spec: { dims_mm: [2600, 1500, 1700], speed_mps: 1.6 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: Agro,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [2600, 1500, 1700])
      return { w: L * 1.35, d: W * 1.3, h: H + 0.1 }
    },
  },
  {
    id: 'roller',
    classes: ['construction_robot'],
    title: 'Строительная и дорожная техника',
    group: GROUPS[6],
    accent: '#f2a93b',
    does: 'Беспилотный каток: уплотняет асфальт по заданной полосе',
    shape: 'Диаметр вальцов и корпус — габариты; ход за проход — скорость',
    anim: 'Проходит полосу вперёд и назад, вальцы катятся, мигает маячок',
    variants: [
      {
        id: 'katok',
        name: 'Беспилотный каток',
        spec: { dims_mm: [3800, 1700, 2600], speed_mps: 1.2 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: Roller,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [3800, 1700, 2600])
      return { w: L * 1.1, d: W * 1.2, h: H + 0.1 }
    },
  },
  {
    id: 'pipe',
    classes: ['inspection_robot'],
    title: 'Инспекционный робот',
    group: GROUPS[6],
    accent: '#e0533d',
    does: 'Внутритрубная диагностика: проезжает трубу, осматривает стенки и сварные швы',
    shape: 'Диаметр трубы и длина модуля — габариты; ход — скорость',
    anim: 'Едет внутри трубы в разрезе, прижимные колёса катятся, кольцо сканера бежит по стенке',
    variants: [
      {
        id: 'martin',
        name: 'MARTin',
        spec: { dims_mm: [600, 250, 250], speed_mps: 0.25 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: PipeCrawler,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [600, 250, 250])
      const R = Math.max(W, H) * 0.95
      return { w: L * 2.6, d: R * 2.2, h: R * 2 }
    },
  },
  {
    id: 'rail',
    classes: ['railway_robot'],
    title: 'Робот для железной дороги',
    group: GROUPS[6],
    accent: '#f2b441',
    does: 'Работает у состава: расцепляет вагоны, растормаживает, обслуживает инфраструктуру',
    shape: 'Корпус ровера — габариты; путь и вагоны — сцена',
    anim: 'Подъезжает к сцепке, манипулятор поднимает рычаг расцепа и уезжает',
    variants: [{ id: 'rascep', name: 'Робот-расцепщик', spec: { dims_mm: [1400, 900, 900] }, assumed: ['dims_mm'] }],
    Model: RailRover,
    bounds: () => ({ w: 7.5, d: 4.4, h: 3.1 }),
  },
  {
    id: 'exo',
    classes: ['medical_robot'],
    title: 'Медицинский робототехнический комплекс',
    group: GROUPS[6],
    accent: '#7a5cd6',
    does: 'Экзоскелет-ортез для реабилитации: приводы тазобедренного и коленного суставов',
    shape: 'Масштаб — рост пациента по габаритам',
    anim: 'Шаговый цикл на беговой дорожке: приводы ведут бедро и голень',
    variants: [{ id: 'ortez', name: 'Ортез-1', spec: { dims_mm: [500, 500, 1750] }, assumed: ['dims_mm'] }],
    Model: Exo,
    bounds: (v) => {
      const k = (v.spec.dims_mm?.[2] ?? 1750) / 1750
      return { w: 1.5 * k, d: 0.9 * k, h: 1.85 * k }
    },
  },
  {
    id: 'ugv',
    classes: ['special_purpose_robot'],
    title: 'Специальный робот',
    group: GROUPS[4],
    accent: '#e0533d',
    does: 'Гусеничная платформа с манипулятором: спасение, разведка, работа в опасной зоне',
    shape: 'Гусеницы, корпус и длина манипулятора — габариты',
    anim: 'Манипулятор опускается, захватывает предмет и поднимает его; камера осматривает сектор',
    variants: [{ id: 'gumich', name: 'Гумич спасатель', spec: { dims_mm: [1200, 700, 900] }, assumed: ['dims_mm'] }],
    Model: Ugv,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [1200, 700, 900])
      return { w: L * 1.7, d: W * 1.2, h: H + 0.2 }
    },
  },
  {
    id: 'cafe',
    classes: ['retail_automation'],
    title: 'Роботизированная торговля и общепит',
    group: GROUPS[4],
    accent: '#7a5cd6',
    does: 'Робо-кафе и вендинг: манипулятор готовит и выдаёт заказ без персонала',
    shape: 'Размер киоска — габариты; рука и стойка масштабируются вместе с ним',
    anim: 'Рука берёт стакан, ставит под раздачу, наливает напиток и выдаёт в окно',
    variants: [{ id: 'rcafe', name: 'R-Cafe 1.3', spec: { dims_mm: [2000, 1400, 2300] }, assumed: ['dims_mm'] }],
    Model: RoboCafe,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [2000, 1400, 2300])
      return { w: L, d: W, h: H }
    },
  },
  {
    id: 'shuttle',
    classes: ['passenger_transport'],
    title: 'Беспилотный пассажирский транспорт',
    group: GROUPS[5],
    accent: '#f2b441',
    does: 'Возит пассажиров без водителя: такси, трамвай, поезд',
    shape: 'Длина, ширина и высота кузова — габариты; скорость дорожки — макс. скорость',
    anim: 'Едет по полосе, лидар на крыше вращается, горят фары',
    variants: [
      {
        id: 'taxi',
        name: 'Беспилотное такси Яндекс',
        spec: { dims_mm: [4600, 1900, 1600], speed_mps: 8 },
        assumed: ['dims_mm', 'speed_mps'],
      },
    ],
    Model: Shuttle,
    bounds: (v) => {
      const [L, W, H] = mm(v.spec.dims_mm, [4600, 1900, 1600])
      return { w: L * 1.1, d: W * 1.2, h: H + 0.15 }
    },
  },
]

/** Drawn for a product whose class has no model yet — a neutral robot, never an empty card. */
export const FALLBACK_KIND: Kind = {
  id: 'neutral',
  classes: [],
  title: 'Робот нового класса',
  group: GROUPS[7],
  accent: '#8a94a0',
  does: 'Нейтральная модель для класса, которого ещё нет в галерее: появляется у нового продукта автоматически',
  shape: 'Корпус — габариты продукта, если они есть в ТТХ',
  anim: 'Парит и дрейфует; голова поворачивается и моргает, руки-плавники покачиваются',
  variants: [{ id: 'neutral', name: 'Новый класс', spec: { dims_mm: [700, 700, 1300] }, assumed: ['dims_mm'] }],
  Model: Neutral,
  bounds: (v) => {
    const [L, W, H] = mm(v.spec.dims_mm, [700, 700, 1300])
    return { w: L * 2, d: W * 1.4, h: H * 1.05 }
  },
}
