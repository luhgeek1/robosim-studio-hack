import { useState } from 'react'
import { ArrowLeft, Download, FileText, Share2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { STEPS, useStore } from '../store'
import { api, fmt } from '../api'
import { useQuery } from '../query'
import { Button, Check, Pill } from '../components/ui'
import { ErrorState, Loading } from '../components/States'

export function VerdictScreen() {
  const project = useStore((s) => s.project)!
  const robotId = useStore((s) => s.robotId)
  const count = useStore((s) => s.robotCount)
  const toast = useStore((s) => s.toast)
  const setStep = useStore((s) => s.setStep)
  const prev = useStore((s) => s.prev)
  const { data: rec, error, loading, reload } = useQuery(`recommendation:${project.id}:${project.version}:${robotId}:${count}`, () => api.recommendation(project.id, robotId, count))
  const [reporting, setReporting] = useState(false)
  const idx = STEPS.findIndex((s) => s.id === 'verdict')

  const report = async () => {
    setReporting(true)
    try {
      await api.report(project.id, robotId, count)
      toast('Отчёт сформирован: executive summary сохранён в проекте')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setReporting(false)
    }
  }
  const tone = rec?.verdict === 'recommended' ? 'ok' : rec?.verdict === 'conditional' ? 'warn' : 'crit'

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 pb-16 pt-9">
      <div className="meta mb-2 num">Шаг {idx + 1} из {STEPS.length} · {STEPS[idx].question}</div>
      {loading && !rec && <Loading label="Формируем заключение…" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {rec && (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-center gap-3">
              <Pill tone={tone} className="!h-7 !px-3 !text-[13px]">Заключение</Pill>
              <span className="meta">
                {project.name} · достоверность данных {project.confidence ?? '—'} %
              </span>
            </div>
            <h1 className="display mt-4 text-[56px] leading-[1.02] tracking-[-0.04em]">{rec.headline}</h1>
            <p className="mt-4 max-w-[760px] text-[17px] leading-relaxed text-ink-2">{rec.executive_summary}</p>
          </motion.div>

          {rec.robot && rec.count !== null && (
            <div className="card mt-8 grid grid-cols-2 divide-x divide-line md:grid-cols-4">
              {[
                [`${rec.count} × ${rec.robot.short_name}`, 'конфигурация', true],
                [`${fmt.mln(rec.capex_mln)} млн ₽`, 'инвестиции', false],
                [fmt.years(rec.payback_years), 'окупаемость', false],
                [`${rec.roi_5y ?? '—'} %`, 'ROI за 5 лет', false],
              ].map(([v, l, small], i) => (
                <motion.div key={String(l)} className="px-6 py-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                  <div className={`display num ${small ? 'text-[22px] leading-tight' : 'text-[32px]'}`}>{v}</div>
                  <div className="meta mt-1">{l}</div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
            <section>
              <div className="h3 mb-3">Ключевая выгода</div>
              <p className="text-[15px] leading-relaxed text-ink-2">{rec.key_benefit || '—'}</p>
              {rec.sla !== null && (
                <ul className="mt-4 space-y-2">
                  <li className="flex items-start gap-2.5 text-[14px]"><Check /> Ожидаемый SLA {fmt.int(rec.sla)} % при требовании 95 %</li>
                  <li className="flex items-start gap-2.5 text-[14px]"><Check /> Мощность {fmt.int(rec.throughput)} паллет в час</li>
                </ul>
              )}
            </section>
            <section>
              <div className="h3 mb-3">Ключевой риск</div>
              <p className="text-[15px] leading-relaxed text-ink-2">{rec.key_risk}</p>
              <ul className="mt-4 space-y-2">
                {rec.next_steps.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[14px]"><Check tone="warn" /> {t}</li>
                ))}
              </ul>
            </section>
          </div>

          {rec.user_choice_note && <div className="mt-8 rounded-[12px] border border-line bg-surface-2 p-5 text-[14px] leading-relaxed">{rec.user_choice_note}</div>}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" icon={<FileText size={16} />} onClick={() => void report()} disabled={reporting}>
              {reporting ? 'Формируем…' : 'Сформировать отчёт'}
            </Button>
            <Button size="lg" icon={<Download size={16} />} onClick={() => toast('Экспорт PDF будет доступен на следующем этапе')}>
              Экспорт PDF
            </Button>
            <Button size="lg" icon={<Share2 size={16} />} onClick={() => toast('Ссылка на проект скопирована')}>
              Поделиться проектом
            </Button>
            <button type="button" className="ml-auto text-[14px] font-medium text-accent hover:underline" onClick={() => setStep('economics')}>
              Открыть детальный анализ
            </button>
          </div>
        </>
      )}
      <div className="mt-12 hairline pt-6">
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={prev}>
          Экономика
        </Button>
      </div>
    </div>
  )
}
