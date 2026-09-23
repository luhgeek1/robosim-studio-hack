import { motion } from 'framer-motion'
import { ArrowLeft, Download, FileSpreadsheet, FileText, Info, ListTree } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { parseApiProblem, problemText } from '@/api/problem'
import { useProject } from '@/api/projects'
import { useCalculation, useComparison, useNarrative } from '@/api/scenarios'
import { useStory } from '@/api/story'
import type { CalculationRun, Narrative } from '@/api/types'
import { fleetFinal, isRobotized, yearsWord, type ComparisonScenario } from '@/components/economics/model'
import { Empty, ErrorState, Loading } from '@/components/States'
import { Button, Check, Disclosure, Hint, Pill } from '@/components/ui'
import { SurveyList } from '@/components/verdict/SurveyList'
import { TrustBadges } from '@/components/verdict/TrustBadges'
import { downloadFile } from '@/lib/download'
import { useMakeReport, type ReportFormat } from '@/api/reports'
import { formatPct, formatRub, formatYears } from '@/lib/format'
import { BAND_LABEL, SCENARIO_KIND_LABEL, VERDICT_LABEL, VERDICT_TONE } from '@/lib/labels'
import { STEPS, stepPath, useProjectId } from '@/lib/story'
import { useStore } from '@/store'

const EASE = [0.22, 1, 0.36, 1] as const

export function VerdictScreen() {
  const projectId = useProjectId()
  const navigate = useNavigate()
  const project = useProject(projectId).data
  const story = useStory(projectId)
  // After the scenario list: both requests lazily create the baseline on a fresh project and would race.
  const comparison = useComparison(projectId, story.isSuccess)
  const table = comparison.data
  const recommendedId = table?.recommendation?.scenario_id ?? null
  const rec =
    table?.scenarios.find((s) => s.scenario_id === (recommendedId ?? story.main?.id)) ??
    table?.scenarios.find(isRobotized)
  const calculation = useCalculation(rec?.calculation_id)
  const narrative = useNarrative(rec?.calculation_id)
  const idx = STEPS.findIndex((s) => s.id === 'verdict')
  const noScenarios = comparison.isError && parseApiProblem(comparison.error).status === 409
  // The recommendation's reasons describe the recommended scenario only, not a fallback.
  const rationale = rec && rec.scenario_id === recommendedId ? (table?.recommendation?.rationale ?? []) : []

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 pt-9 pb-16">
      <div className="meta num mb-2">
        Шаг {idx + 1} из {STEPS.length} · {STEPS[idx].question}
      </div>
      {((comparison.isPending && !story.isError) || (rec && calculation.isPending)) && (
        <Loading label="Формируем заключение…" />
      )}
      {story.isError && <ErrorState error={story.error} onRetry={() => story.refetch()} />}
      {noScenarios && (
        <Empty
          title="Сначала посчитаем экономику"
          action={<Button onClick={() => navigate(stepPath(projectId, 'economics'))}>Перейти к экономике</Button>}
        >
          Заключение строится по сравнению сценариев «как сейчас», покупка, аренда и лизинг.
        </Empty>
      )}
      {comparison.isError && !noScenarios && (
        <ErrorState error={comparison.error} onRetry={() => comparison.refetch()} />
      )}
      {calculation.isError && <ErrorState error={calculation.error} onRetry={() => calculation.refetch()} />}
      {table && !rec && (
        <Empty title="Нет сценария роботизации">Выберите роботов и посчитайте экономику, чтобы получить вывод.</Empty>
      )}
      {project && rec && calculation.data && (
        <Verdict projectName={project.name} scenario={rec} calc={calculation.data} narrative={narrative.data} />
      )}
      {project && rec && calculation.data && (
        <>
          <section className="mt-8">
            <div className="h3 mb-3">Почему этому можно верить</div>
            <TrustBadges calc={calculation.data} scenarioId={rec.scenario_id} project={project} />
          </section>
          <Findings calc={calculation.data} narrative={narrative.data} rationale={rationale} />
          <section className="mt-10">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <div className="h3">Что уточнить при обследовании</div>
              <span className="meta">сильнее всего влияют на результат и пока взяты по умолчанию</span>
            </div>
            <div className="card px-5 py-1">
              <SurveyList scenarioId={rec.scenario_id} />
            </div>
          </section>
          <Actions projectId={projectId} projectName={project.name} calculationId={calculation.data.id} />
        </>
      )}
      <div className="hairline mt-12 pt-6">
        <Button
          variant="ghost"
          icon={<ArrowLeft size={15} />}
          onClick={() => navigate(stepPath(projectId, 'economics'))}
        >
          Экономика
        </Button>
      </div>
    </div>
  )
}

// The executive summary repeats the headline; the lead keeps only what follows it.
function leadText(narrative: Narrative | undefined, calc: CalculationRun): string {
  const { headline, summary } = calc.interpretation
  const text = narrative?.executive_summary ?? summary
  return text.startsWith(headline) ? text.slice(headline.length).replace(/^[.\s—–-]+/, '') || summary : text
}

function Verdict({
  projectName,
  scenario,
  calc,
  narrative,
}: {
  projectName: string
  scenario: ComparisonScenario
  calc: CalculationRun
  narrative: Narrative | undefined
}) {
  const { interpretation, metrics } = calc
  const band = BAND_LABEL[interpretation.band]
  const numbers: [string, string, boolean][] = [
    [calc.sizing.length ? fleetFinal(calc.sizing) : `${metrics.robots_total ?? '—'}`, 'конфигурация', true],
    [formatRub(metrics.capex_rub), 'инвестиции · CAPEX', false],
    [formatYears(metrics.payback_years), 'окупаемость', false],
    [
      formatPct(metrics.roi_pct, { digits: 0 }),
      `ROI за ${yearsWord(metrics.horizon_years)} · NPV ${formatRub(metrics.npv_rub)}`,
      false,
    ],
  ]
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone={VERDICT_TONE[interpretation.verdict]} className="!h-7 !px-3 !text-[13px]">
            {VERDICT_LABEL[interpretation.verdict]}
          </Pill>
          <span className="meta">
            {projectName} · {SCENARIO_KIND_LABEL[scenario.kind]}
            {band && ` · ${band}`}
          </span>
        </div>
        <h1 className="display mt-4 text-[44px] leading-[1.04] tracking-[-0.04em] xl:text-[56px]">
          {interpretation.headline}
        </h1>
        <p className="mt-4 max-w-[800px] text-[16px] leading-relaxed text-ink-2">{leadText(narrative, calc)}</p>
      </motion.div>

      <div className="card mt-8 grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        {numbers.map(([value, label, small], i) => (
          <motion.div
            key={label}
            className="px-6 py-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: EASE }}
          >
            <div className={`display num ${small ? 'text-[22px] leading-tight' : 'text-[32px]'}`}>{value}</div>
            <div className="meta mt-1">{label}</div>
          </motion.div>
        ))}
      </div>
      <p className="meta mt-3 flex items-center gap-1.5">
        <Info size={13} className="shrink-0" />
        Предварительная оценка — результат требует верификации при обследовании объекта.
      </p>
    </>
  )
}

function Findings({
  calc,
  narrative,
  rationale,
}: {
  calc: CalculationRun
  narrative: Narrative | undefined
  rationale: string[]
}) {
  const findings = narrative?.key_findings ?? calc.interpretation.key_drivers ?? []
  const benefit = findings[0]
  const benefitChecks = rationale.length ? rationale : findings.slice(1, 3)
  const risks = narrative?.risks_text?.length
    ? narrative.risks_text
    : calc.risks.map((r) => `${r.title}: ${r.description}`)
  const nextSteps = narrative?.next_steps ?? calc.risks.map((r) => r.mitigation).filter(Boolean)
  const caveats = calc.interpretation.caveats ?? []
  const more = [...risks.slice(1), ...caveats]
  return (
    <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
      <section>
        <div className="h3 mb-3">Ключевая выгода</div>
        <p className="text-[15px] leading-relaxed text-ink-2">{benefit ?? calc.interpretation.summary}</p>
        {benefitChecks.length > 0 && (
          <ul className="mt-4 space-y-2">
            {benefitChecks.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px]">
                <Check /> {t}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <div className="h3 mb-3">Ключевой риск</div>
        <p className="text-[15px] leading-relaxed text-ink-2">{risks[0] ?? 'Существенных рисков расчёт не выявил.'}</p>
        {nextSteps.length > 0 && (
          <ul className="mt-4 space-y-2">
            {nextSteps.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px]">
                <Check tone="warn" /> {t}
              </li>
            ))}
          </ul>
        )}
        {more.length > 0 && (
          <div className="mt-4">
            <Disclosure label={`Остальные риски и оговорки · ${more.length}`}>
              <ul className="space-y-2 text-[13px] leading-relaxed text-ink-2">
                {more.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check tone="neutral" /> {t}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        )}
      </section>
    </div>
  )
}

function Actions({
  projectId,
  projectName,
  calculationId,
}: {
  projectId: string
  projectName: string
  calculationId: string
}) {
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const openTrace = useStore((s) => s.openTrace)
  const [exporting, setExporting] = useState(false)
  const report = useMakeReport(projectId, projectName)
  const makeReport = (format: ReportFormat) =>
    report.mutate(format, {
      onSuccess: () => toast(format === 'pdf' ? 'Отчёт PDF скачан' : 'Excel с формулами скачан'),
      onError: (error) => toast(problemText(error), 'error'),
    })
  const exportJson = async () => {
    setExporting(true)
    try {
      await downloadFile(`/projects/${projectId}/export.json`, `${projectName.replace(/[\\/:*?"<>|]+/g, ' ')}.json`)
    } catch (error) {
      toast(problemText(error), 'error')
    } finally {
      setExporting(false)
    }
  }
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3">
      <Button size="lg" icon={<Download size={16} />} onClick={() => void exportJson()} disabled={exporting}>
        {exporting ? 'Готовим файл…' : 'Данные (JSON)'}
      </Button>
      <Button
        variant="primary"
        size="lg"
        icon={<FileText size={16} />}
        onClick={() => makeReport('pdf')}
        disabled={report.isPending}
      >
        {report.isPending && report.variables === 'pdf' ? 'Формируем PDF…' : 'Отчёт PDF'}
      </Button>
      <Hint content="Входы и живые формулы из трассы расчёта: поменяйте вход — пересчитается как на платформе">
        <span tabIndex={0} className="rounded-[10px]">
          <Button
            size="lg"
            icon={<FileSpreadsheet size={16} />}
            onClick={() => makeReport('xlsx')}
            disabled={report.isPending}
          >
            {report.isPending && report.variables === 'xlsx' ? 'Формируем Excel…' : 'Excel с формулами'}
          </Button>
        </span>
      </Hint>
      <Button size="lg" icon={<ListTree size={16} />} onClick={() => openTrace(calculationId)}>
        Как посчитано
      </Button>
      <button
        type="button"
        className="ml-auto text-[14px] font-medium text-accent hover:underline"
        onClick={() => navigate(stepPath(projectId, 'economics'))}
      >
        Открыть детальный анализ
      </button>
    </div>
  )
}
