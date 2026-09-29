---
version: 1
name: РобоМера — motion-editorial
description: Тёплый бумажный холст и чернила, один сигнальный оранжевый акцент, сверхжирные числа-выводы, моноширинные HUD-подписи и пружинное движение. Основа — наша система (прототип v0, D-020); тёплый холст и тёмные «приборные» поверхности — из Claude DESIGN.md (VoltAgent/awesome-design-md); акценты, HUD и темп — из шоурила prime.mp4.

colors:
  canvas: "#f5f2ec"          # бумага: между Claude #faf9f5 и кадром шоурила #f1ebe4
  card: "#fffefb"
  surface-2: "#faf8f3"
  surface-dark: "#0e0e12"    # кадр шоурила; Claude surface-dark #181715
  surface-night: "#0b1030"   # сцены двойника и имитации; кадр шоурила #050a20, осветлён для текста
  ink: "#141413"             # Claude ink
  ink-2: "#3d3d3a"           # Claude body
  ink-3: "#6c6a64"           # Claude muted
  ink-4: "#aaa69d"
  hairline: "#e6dfd8"        # Claude hairline
  input: "#d8d1c7"
  signal: "#f24a24"          # шоурил #f74926: главный акцент — одна вещь на экран
  signal-soft: "#fde4dc"
  sun: "#efb51a"             # шоурил: второй акцент, подсветка «лучшее значение»
  sun-soft: "#fbf0cf"
  info: "#2f55d4"            # ссылки и фокус (как было)
  ok: "#447e4c"
  warn: "#c9820f"
  crit: "#c64545"            # Claude error: темнее сигнального, чтобы ошибку не путать с акцентом

typography:
  family: "Onest Variable (100–900) — всё; JetBrains Mono — формулы и HUD"
  display-xl: { size: 56px, weight: 800, lineHeight: 0.98, letterSpacing: -0.045em }   # заголовок раздела
  display-num: { size: 40–64px, weight: 800, lineHeight: 0.95, letterSpacing: -0.04em } # главное число экрана
  h1: { size: 34px, weight: 700, lineHeight: 1.1, letterSpacing: -0.03em }
  h2: { size: 22px, weight: 650, lineHeight: 1.2, letterSpacing: -0.025em }
  h3: { size: 16px, weight: 600, lineHeight: 1.3, letterSpacing: -0.015em }
  body: { size: 14px, weight: 400, lineHeight: 1.5 }
  meta: { size: 12.5px, weight: 400, color: ink-3 }
  hud: { family: mono, size: 10.5px, weight: 500, case: upper, letterSpacing: 0.08em, color: ink-3 }

radius: { sm: 6px, md: 8px, lg: 10px, card: 14px, pill: 999px }
shadow:
  card: "0 1px 2px rgba(20,20,19,.04), 0 8px 24px -12px rgba(20,20,19,.12)"
  float: "0 2px 4px rgba(20,20,19,.05), 0 24px 48px -16px rgba(20,20,19,.22)"

motion:
  spring-default: { stiffness: 320, damping: 24, mass: 1 }    # Kinetics по умолчанию
  spring-snappy: { stiffness: 520, damping: 42, mass: 0.8 }   # подсветки и индикаторы (уже в коде)
  spring-soft: { stiffness: 160, damping: 26 }                # полосы и графики
  stagger: 22ms на элемент, не дольше 300 мс на список
  reduced-motion: все анимации гаснут до 0,01 мс
---

# DESIGN.md — РобоМера

## Характер

Экспресс-оценка для директора и финансиста: ответ крупно, доказательство рядом. Визуально — редакционный лист
на тёплой бумаге (а не холодный SaaS), где у каждого экрана **одно** сигнальное число и **одна** оранжевая
отметка. Движение «с весом»: пружины вместо линейных переходов, числа перетекают, списки поднимаются лесенкой.

## Правила

1. **Один сигнал на экран.** `signal` — главный вывод: главное число, главный столбец графика, активная точка
   HUD. Всё остальное — чернила и серые. Ошибки — `crit`, не `signal`.
2. **Числа-выводы сверхжирные.** Окупаемость, NPV, N роботов — `display-num` (800). Подписи к ним — `meta`.
3. **HUD-подписи.** Над заголовком шага и в углах сцен — моноширинный верхний регистр: `ШАГ 05 / 09 · ПОДБОР`,
   таймкод имитации, `● РАСЧЁТ`. Красная точка — только для «идёт процесс» (пульсирует).
4. **Графики как в кадре «+242 %»:** столбцы чернилами, главный — `signal`; кольцо с крупным числом в центре;
   сетки нет, подписи прямо у данных, единая шкала от нуля, одна толщина столбцов.
5. **Поверхности.** Светлые карточки `card` с волосяной линией `hairline`. Тёмные `surface-night` — только
   для «сцен» (двойник, имитация, экран входа), как тёмные мокапы в Claude DESIGN.md.
6. **Геометрия Баухауса** (круг `signal`, квадрат `sun`, треугольник `info`) — пустые состояния, загрузка,
   экран входа. Не в таблицах и не рядом с числами.
7. **Интерфейс только на русском**, единицы у полей, работа от 1366×768 (AGENTS.md).

## Движение (Kinetics)

| Эффект Kinetics | Где |
|---|---|
| Stagger Entrance | строки списков, карточки сценариев, KPI |
| Number Counter | KPI и главные числа (уже `KpiNumber`, добавить перелёт) |
| Scramble Reveal | главное число шага при первом показе |
| Pulse Badge | «идёт расчёт», колокольчик приглашений |
| Tab Pill Glide | шаги и вкладки (уже `layoutId`) |
| Switch Spring | переключатели |
| Toast Overshoot | тосты |

Пружина по умолчанию — stiffness 320 / damping 24; индикаторы — 520 / 42.

## Источники

- Наша система: `frontend/src/app/index.css`, `shared/ui/v0.tsx`, D-020.
- Claude DESIGN.md — https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/claude/DESIGN.md
  (холст, чернила, hairline, тёмные поверхности, цвет ошибки).
- Шоурил `prime.mp4` (локально, не в репозитории) — цвета сняты с кадров: `#f74926`, `#efb51a`, `#050a20`,
  `#f1ebe4`, `#0e0e12`; HUD-подписи, сверхжирная типографика, графики.
- Kinetics — https://kinetics.colorion.co (пружины 320/24, эффекты из таблицы).
