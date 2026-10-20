import { useEffect, useRef, useState } from 'react'
import { animate, motion } from 'framer-motion'
import { ArrowRight, Check, FileCheck2, Layers3, ScanLine } from 'lucide-react'
import { EASE, useLandingMotion } from './use-landing-motion'

const SHEETS = [
  {
    id: 'decision',
    label: 'Решение о роботизации',
    title: ['Решение', 'о роботизации'],
    heading: 'РОБОМЕРА / МАТЕРИАЛЫ ПРОЕКТА',
    caption: 'ОТ ОБЪЕКТА ДО ОБОСНОВАНИЯ',
    items: ['Выбранные решения', 'Экономика сценариев', 'Результаты имитации'],
    footer: ['Предварительная оценка', 'с источниками и допущениями'],
    Icon: FileCheck2,
  },
  {
    id: 'economics',
    label: 'Экономика сценариев',
    title: ['Экономика', 'сценариев'],
    heading: 'РОБОМЕРА / РАСЧЁТЫ И СЦЕНАРИИ',
    caption: 'НЕСКОЛЬКО ПУТЕЙ. ОБЩАЯ ОСНОВА.',
    items: ['Покупка, RaaS и лизинг', 'Затраты и окупаемость', 'Сравнение с текущей работой'],
    footer: ['Варианты внедрения', 'на одних исходных данных'],
    Icon: Layers3,
  },
  {
    id: 'sources',
    label: 'Исходные данные',
    title: ['Исходные', 'данные'],
    heading: 'РОБОМЕРА / ОСНОВА РАСЧЁТА',
    caption: 'У КАЖДОГО РЕШЕНИЯ ЕСТЬ ОСНОВАНИЕ',
    items: ['Параметры объекта', 'Источники и допущения', 'Что нужно уточнить'],
    footer: ['Основа для обследования', 'и разговора с поставщиком'],
    Icon: ScanLine,
  },
] as const

const POSES = [
  'translate(0px, 0px) rotate(-3deg) scale(1)',
  'translate(22px, -20px) rotate(3deg) scale(0.98)',
  'translate(40px, -40px) rotate(8deg) scale(0.96)',
]

export function DossierStack() {
  const [active, setActive] = useState(0)
  const activeIndex = useRef(0)
  const scope = useRef<HTMLDivElement>(null)
  const playback = useRef<ReturnType<typeof animate> | null>(null)
  const { reduced } = useLandingMotion()

  useEffect(() => () => playback.current?.stop(), [])

  const next = () => {
    const root = scope.current
    if (!root) return
    const card = (index: number) => root.querySelector<HTMLElement>(`[data-sheet="${SHEETS[index].id}"]`)
    const current = card(activeIndex.current)
    const following = card((activeIndex.current + 1) % SHEETS.length)
    const last = card((activeIndex.current + 2) % SHEETS.length)
    if (!current || !following || !last) return

    // Every tap advances immediately, including multiple events before React renders.
    playback.current?.stop()
    playback.current = null
    activeIndex.current = (activeIndex.current + 1) % SHEETS.length
    setActive(activeIndex.current)

    if (reduced) {
      SHEETS.forEach((_, index) => {
        const sheet = card(index)
        if (!sheet) return
        const rank = (index - activeIndex.current + SHEETS.length) % SHEETS.length
        sheet.style.transform = POSES[rank]
      })
      return
    }

    // Stopping commits the current pose, so a new flick continues without snapping.
    const distance = Math.min(current.offsetWidth * 0.34, 160)
    playback.current = animate([
      [
        current,
        { transform: `translate(${-distance}px, -48px) rotate(-16deg) scale(1.025)` },
        { duration: 0.22, ease: EASE },
      ],
      [following, { transform: POSES[0] }, { at: 0, duration: 0.42, ease: EASE }],
      [last, { transform: POSES[1] }, { at: 0, duration: 0.42, ease: EASE }],
      [current, { transform: POSES[2] }, { at: 0.22, duration: 0.3, ease: EASE }],
    ])
  }

  return (
    <div className="lp-dossier-interactive" ref={scope} role="group" aria-label="Материалы проекта">
      <motion.div
        className="lp-dossier-surface"
        initial={false}
        animate="rest"
        whileHover={reduced ? undefined : 'hover'}
      >
        <motion.div
          className="lp-dossier-stack"
          variants={{ rest: { y: 0, rotateX: 0, rotateY: 0 }, hover: { y: -6, rotateX: 2, rotateY: -3 } }}
          transition={{ type: 'spring', stiffness: 180, damping: 24 }}
        >
          {SHEETS.map(({ id, title, heading, caption, items, footer, Icon }, index) => {
            const rank = (index - active + SHEETS.length) % SHEETS.length
            // React owns the order; Motion owns poses after the initial render.
            return (
              <div
                className={`lp-dossier lp-dossier--${id}`}
                key={id}
                data-sheet={id}
                data-front={rank === 0}
                aria-hidden={rank !== 0}
                style={{ transform: POSES[index], zIndex: SHEETS.length - rank }}
              >
                <div className="lp-dossier-top">
                  <span>{heading}</span>
                  <Icon size={20} strokeWidth={1.4} aria-hidden="true" />
                </div>
                <p className="lp-dossier-title">
                  {title[0]}
                  <br />
                  {title[1]}
                  <span>.</span>
                </p>
                <div className="lp-dossier-rule">
                  <span>{caption}</span>
                  <i />
                </div>
                {items.map((item, number) => (
                  <div className="lp-dossier-item" key={item}>
                    <span>0{number + 1}</span>
                    <strong>{item}</strong>
                    <Check size={14} aria-hidden="true" />
                  </div>
                ))}
                <div className="lp-dossier-footer">
                  <span>
                    {footer[0]}
                    <br />
                    {footer[1]}
                  </span>
                  <div>
                    <span>PDF</span>
                    <span>XLSX</span>
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>
        <button
          type="button"
          className="lp-dossier-hitbox"
          aria-label={`Перелистнуть документ. Сейчас: ${SHEETS[active].label}`}
          onClick={next}
        />
      </motion.div>
      <div className="lp-dossier-controls">
        <span>
          НАЖМИТЕ НА ЛИСТ,
          <br />
          ЧТОБЫ ПОСМОТРЕТЬ СЛЕДУЮЩИЙ
        </span>
        <button type="button" onClick={next} aria-label="Следующий документ">
          <span>
            0{active + 1}
            <i>/ 03</i>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <span className="sr-only" role="status">
        Лист {active + 1} из {SHEETS.length}: {SHEETS[active].label}
      </span>
    </div>
  )
}
