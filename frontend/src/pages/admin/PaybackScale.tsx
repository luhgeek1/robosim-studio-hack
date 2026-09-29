import { motion } from 'framer-motion'
import { formatYears, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import type { Slice } from './charts'

// Интервалы вердикта ТЗ 3.5.7: до 3 лет — выгодно, 3–5 — приемлемо, 5–7 — на грани, дольше — долго.
const ZONES = [
  { to: 3, word: 'выгодно', band: 'bg-ok-soft', text: 'text-ok' },
  { to: 5, word: 'приемлемо', band: 'bg-black/6', text: 'text-ink' },
  { to: 7, word: 'на грани', band: 'bg-warn-soft', text: 'text-warn' },
  { to: Infinity, word: 'долго', band: 'bg-crit-soft', text: 'text-crit' },
]
const MIN_SCALE_YEARS = 9

const zoneOf = (years: number) => ZONES.find((z) => years <= z.to) ?? ZONES[ZONES.length - 1]

/* Окупаемость на шкале вердикта: крупное число и слово вердикта, под ними полоса лет с зонами и маркер
   на значении. Читается и при одном типе объекта, и при нескольких — у всех одна шкала. */
export function PaybackScale({ data }: { data: Slice[] }) {
  const scale = Math.max(MIN_SCALE_YEARS, ...data.map((s) => Math.ceil(s.value) + 1))
  const at = (years: number) => `${(Math.min(years, scale) / scale) * 100}%`
  return (
    <div className="space-y-5">
      {data.map((slice, i) => {
        const zone = zoneOf(slice.value)
        return (
          <div key={slice.key}>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] text-ink-2">{slice.name}</div>
                <div className={cn('display num text-[30px] leading-none', zone.text)}>{formatYears(slice.value)}</div>
              </div>
              <span className={cn('hud mb-0.5 shrink-0', zone.text)}>{zone.word}</span>
            </div>
            <div className="relative mt-3 h-2.5">
              <div className="flex h-full overflow-hidden rounded-full">
                {ZONES.map((z, zi) => {
                  const from = zi ? ZONES[zi - 1].to : 0
                  const to = Math.min(z.to, scale)
                  return (
                    <div
                      key={z.word}
                      className={cn('h-full', z.band, zi && 'border-l-2 border-card')}
                      style={{ width: `${((to - from) / scale) * 100}%` }}
                    />
                  )
                })}
              </div>
              <motion.div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={{ left: '0%' }}
                animate={{ left: at(slice.value) }}
                transition={{ type: 'spring', stiffness: 160, damping: 22, delay: i * 0.08 }}
              >
                <span className="block h-5 w-1 rounded-full bg-ink ring-2 ring-card" />
              </motion.div>
            </div>
          </div>
        )
      })}
      <div className="relative h-4 text-[11px] text-ink-4">
        {[0, 3, 5, 7].map((mark) => (
          <span key={mark} className={cn('num absolute', mark ? '-translate-x-1/2' : '')} style={{ left: at(mark) }}>
            {mark}
          </span>
        ))}
        <span className="num absolute right-0">
          {scale}+ {pluralRu(scale, ['год', 'года', 'лет'])}
        </span>
      </div>
    </div>
  )
}
