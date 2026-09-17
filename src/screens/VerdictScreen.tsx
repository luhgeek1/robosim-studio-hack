import { ArrowLeft, Download, FileText, Share2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { STEPS, useRobot, useStore } from '../store'
import { recommendedRobot } from '../data/robots'
import { Button, Check, Pill } from '../components/ui'

export function VerdictScreen() {
  const chosen = useRobot()
  const count = useStore((s) => s.robotCount)
  const toast = useStore((s) => s.toast)
  const setStep = useStore((s) => s.setStep)
  const prev = useStore((s) => s.prev)
  const rec = recommendedRobot
  const cfg = rec.configs[rec.recommendedCount]
  const e = cfg.econ
  const differs = chosen.id !== rec.id || count !== rec.recommendedCount
  const chosenCfg = chosen.configs[count]
  const idx = STEPS.findIndex((s) => s.id === 'verdict')

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 pb-16 pt-9">
      <div className="meta mb-2 num">Шаг {idx + 1} из {STEPS.length} · {STEPS[idx].question}</div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <div className="flex items-center gap-3">
          <Pill tone="ok" className="!h-7 !px-3 !text-[13px]">Заключение</Pill>
          <span className="meta">Warehouse Moscow #01 · достоверность данных 91 %</span>
        </div>
        <h1 className="display mt-4 text-[56px] leading-[1.02] tracking-[-0.04em]">Роботизация рекомендована</h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-ink-2">
          {rec.recommendedCount} × {rec.name} — минимальная конфигурация, которая стабильно справляется с пиковой нагрузкой склада, укладывается в бюджет и
          окупается за {e.payback?.toFixed(1).replace('.', ',')} года.
        </p>
      </motion.div>

      <div className="card mt-8 grid grid-cols-2 divide-x divide-line md:grid-cols-4">
        {[
          [`${e.capex.toFixed(1).replace('.', ',')} млн ₽`, 'инвестиции'],
          [`${e.payback?.toFixed(1).replace('.', ',')} года`, 'окупаемость'],
          [`${e.roi5y} %`, 'ROI за 5 лет'],
          [`${cfg.normal.sla} %`, 'отгрузок в срок'],
        ].map(([v, l], i) => (
          <motion.div
            key={l}
            className="px-6 py-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="display num text-[32px]">{v}</div>
            <div className="meta mt-1">{l}</div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <section>
          <div className="h3 mb-3">Ключевая выгода</div>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Снижение операционных затрат на 7,1 млн ₽ в год при достаточной производительности даже в пиковый период: 128 паллет в час против пиковых 123.
            Штат зоны сокращается с 28 до 18 человек без потери SLA.
          </p>
          <ul className="mt-4 space-y-2">
            {['Выгода за 5 лет: 31,5 млн ₽', 'SLA 98 % в норме, 96 % в пик', 'Запас мощности 29 % для роста объёмов'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px]"><Check /> {t}</li>
            ))}
          </ul>
        </section>
        <section>
          <div className="h3 mb-3">Ключевой риск</div>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Необходимо подтвердить интеграцию с текущей WMS: версия API не указана в исходных данных. Это влияет на срок внедрения и стоимость интеграции, но не
            на выбор робота.
          </p>
          <ul className="mt-4 space-y-2">
            {['Запросить у поставщика WMS спецификацию API', 'Замерить ровность пола в зоне хранения', 'Пилот на 2 роботах в одном проходе — 6 недель'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px]"><Check tone="warn" /> {t}</li>
            ))}
          </ul>
        </section>
      </div>

      {differs && (
        <div className="mt-8 rounded-[12px] border border-line bg-surface-2 p-5 text-[14px] leading-relaxed">
          <span className="font-medium">Вы рассматривали {count} × {chosen.name}.</span>{' '}
          {chosenCfg.normal.sla >= 95
            ? `Эта конфигурация выполняет SLA (${chosenCfg.normal.sla} %), но ROI за 5 лет ${chosenCfg.econ.roi5y} % и окупаемость ${chosenCfg.econ.payback?.toFixed(1).replace('.', ',')} года хуже, чем у рекомендации.`
            : `Эта конфигурация не выполняет SLA (${chosenCfg.normal.sla} % при требовании 95 %).`}{' '}
          Система оставляет рекомендацию: {rec.recommendedCount} × {rec.name}.
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" icon={<FileText size={16} />} onClick={() => toast('Отчёт формируется — придёт на почту через минуту')}>
          Сформировать отчёт
        </Button>
        <Button size="lg" icon={<Download size={16} />} onClick={() => toast('PDF сохранён: RoboScope_Warehouse_Moscow_01.pdf')}>
          Экспорт PDF
        </Button>
        <Button size="lg" icon={<Share2 size={16} />} onClick={() => toast('Ссылка на проект скопирована')}>
          Поделиться проектом
        </Button>
        <button type="button" className="ml-auto text-[14px] font-medium text-accent hover:underline" onClick={() => setStep('economics')}>
          Открыть детальный анализ
        </button>
      </div>

      <div className="mt-12 hairline pt-6">
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={prev}>
          Экономика
        </Button>
      </div>
    </div>
  )
}
