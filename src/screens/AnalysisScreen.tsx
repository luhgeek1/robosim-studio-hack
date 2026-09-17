import { Screen } from '../components/Screen'
import { HourlyLoadChart } from '../components/HourlyLoadChart'
import { demand } from '../data/project'
import { Check, Pill } from '../components/ui'

const flow = [
  { name: 'Приёмка', value: '1 000', unit: 'паллет / сутки', note: 'узкое место в пик', tone: 'warn' as const },
  { name: 'Хранение', value: '4 200', unit: 'мест · заполнено 87 %', note: 'ёмкости достаточно', tone: 'ok' as const },
  { name: 'Комплектация', value: '640', unit: 'заказов / сутки', note: 'зависит от приёмки', tone: 'neutral' as const },
  { name: 'Отгрузка', value: '1 000', unit: 'паллет / сутки', note: 'SLA 86 % в пик', tone: 'warn' as const },
]

export function AnalysisScreen() {
  return (
    <Screen
      title="Склад справляется в среднем, но не в пиковые часы"
      lead={
        <>
          Средний поток {demand.averagePerHour} паллет в час, пиковый — {demand.peakPerHour}. Ручная мощность зоны {demand.manualCapacityPerHour} паллет
          в час: в дневные часы на приёмке растёт очередь, а доля отгрузок в срок падает до {demand.currentPeakSla} % при требовании {demand.slaTarget} %.
        </>
      }
      nextLabel="Подобрать роботов"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr]">
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="h3">Нагрузка по часам суток</div>
            <span className="meta">паллет в час, приёмка + отгрузка</span>
          </div>
          <HourlyLoadChart />
        </div>

        <div className="flex flex-col gap-6">
          <section>
            <div className="h3 mb-3">Что это значит</div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-[14px] leading-snug">
                <Check tone="warn" />
                <span>
                  <span className="font-medium">9 часов в сутки</span> поток выше ручной мощности. Это и есть причина срывов SLA — не персонал, а предел
                  скорости ручного перемещения.
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-[14px] leading-snug">
                <Check tone="warn" />
                <span>
                  <span className="font-medium">30,2 млн ₽ в год</span> стоит текущий процесс: 28 человек и парк техники. Зарплаты растут на 8 % в год.
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-[14px] leading-snug">
                <Check />
                <span>
                  <span className="font-medium">Зона пригодна для роботов:</span> ровный пол, проходы 2,8 м, стандартные паллеты, WMS уже ведёт задания.
                </span>
              </li>
            </ul>
          </section>

          <section className="rounded-[12px] bg-surface-2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="h3">Требования к решению</span>
              <Pill tone="ok">Объект пригоден</Pill>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['≥ 120', 'паллет в час в пик'],
                ['≥ 95 %', 'отгрузок в срок'],
                ['≤ 15 млн ₽', 'бюджет'],
                ['2,8 м', 'ширина проходов'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="display num text-[20px]">{v}</dt>
                  <dd className="meta">{l}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      <section className="mt-10">
        <div className="h3 mb-3">Как проходит поток сегодня</div>
        <div className="card grid grid-cols-1 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {flow.map((f, i) => (
            <div key={f.name} className="relative p-5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink-3">{f.name}</span>
                {i < flow.length - 1 && <span className="hidden text-ink-4 sm:inline">›</span>}
              </div>
              <div className="display num mt-2 text-[26px]">{f.value}</div>
              <div className="meta">{f.unit}</div>
              <div className="mt-3">
                <Pill tone={f.tone}>{f.note}</Pill>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Screen>
  )
}
