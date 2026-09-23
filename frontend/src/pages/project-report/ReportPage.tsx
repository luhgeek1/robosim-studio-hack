import { Braces, Download, FileSpreadsheet, FileText, ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { useProject, useProjectId } from '@/entities/project'
import { downloadReport, useMakeReport, useProjectVisuals, useReportVisuals, useReports } from '@/entities/report'
import { useComparison } from '@/entities/scenario'
import { parseApiProblem, problemText } from '@/shared/api/problem'
import type { ReportFormat } from '@/shared/api/types'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Callout, Screen, Section } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Pill } from '@/shared/ui/v0'

const DISCLAIMER = 'Предварительная оценка. Результат требует верификации при обследовании объекта.'

const FORMATS: { format: ReportFormat; title: string; text: string; icon: typeof FileText }[] = [
  {
    format: 'pdf',
    title: 'ПредТЭО, PDF',
    text: 'Сводка и вердикт, объект, процессы, подбор, состав и число роботов, экономика с формулами, сравнение сценариев, риски, имитация со схемой, допущения и источники.',
    icon: FileText,
  },
  {
    format: 'xlsx',
    title: 'Расчёт, Excel с формулами',
    text: 'Входы и шаги трассы живыми формулами, денежный поток с NPV и IRR от ставки: поменяйте вход — таблица пересчитается так же, как платформа.',
    icon: FileSpreadsheet,
  },
  {
    format: 'json',
    title: 'Данные отчёта, JSON',
    text: 'Та же модель, из которой собраны PDF и Excel, — для интеграций и проверки чисел.',
    icon: Braces,
  },
]

const FORMAT_LABEL: Record<ReportFormat, string> = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word', json: 'JSON' }
const STATUS_LABEL: Record<string, string> = {
  queued: 'в очереди',
  running: 'собирается',
  done: 'готов',
  failed: 'ошибка',
  cancelled: 'отменён',
}

// ТЗ 3.7.1–3.7.5: итоговое заключение, PDF и таблицы, сохранение визуализации, пометка «предварительная оценка».
export function ReportPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data
  const comparison = useComparison(projectId)
  const reports = useReports(projectId)
  const visuals = useProjectVisuals(projectId)
  const removeVisual = useReportVisuals((s) => s.remove)
  const title = project?.name ?? 'Отчёт'
  const make = useMakeReport(projectId, title)
  const noCalculations = comparison.isError && parseApiProblem(comparison.error).status === 409

  const build = (format: ReportFormat) =>
    make.mutate(
      { format, visual_ids: format === 'pdf' ? visuals.map((v) => v.id) : undefined },
      { onError: (error) => toast.error(problemText(error)) },
    )

  return (
    <Screen
      wide
      title={comparison.data?.verdict.headline ?? 'Отчёт для инвесткомитета'}
      lead="Отчёт собирается из тех же расчётов, что и экраны: устаревшие сценарии пересчитываются при сборке, числа в PDF, Excel и JSON совпадают."
    >
      <div className="space-y-6">
        <Callout tone="info">{DISCLAIMER}</Callout>
        {noCalculations && (
          <Callout>Нет рассчитанных сценариев: отчёт соберётся, когда появится хотя бы один расчёт.</Callout>
        )}
        {comparison.isError && !noCalculations && (
          <ErrorBlock error={comparison.error} onRetry={() => comparison.refetch()} />
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {FORMATS.map(({ format, title: name, text, icon: Icon }) => {
            const pending = make.isPending && make.variables?.format === format
            return (
              <section key={format} className="card flex flex-col p-5">
                <div className="flex items-center gap-2">
                  <Icon className="size-5 text-ink-3" />
                  <h2 className="h3">{name}</h2>
                </div>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-2">{text}</p>
                {format === 'pdf' && visuals.length > 0 && (
                  <p className="meta mt-2">Со снимками имитации: {visuals.length}</p>
                )}
                <Button
                  className="mt-4 self-start"
                  variant={format === 'pdf' ? 'default' : 'outline'}
                  disabled={make.isPending || noCalculations}
                  onClick={() => build(format)}
                >
                  {pending ? <Spinner /> : <Download />} {pending ? 'Собираем…' : 'Сформировать и скачать'}
                </Button>
              </section>
            )
          })}
        </div>

        <Section
          title="Снимки имитации для PDF"
          description="Снимок делается на шаге «Имитация» кнопкой «Снимок в отчёт» — схема или 3D-вид в выбранный момент прогона."
        >
          {visuals.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Снимков пока нет — в PDF попадёт схема последней имитации.</p>
          ) : (
            <ul className="divide-y divide-line">
              {visuals.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <ImageIcon className="size-4 shrink-0 text-ink-3" />
                    <span className="truncate">{v.caption}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="meta">{formatDateTime(v.createdAt)}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Убрать из отчёта"
                      onClick={() => removeVisual(projectId, v.id)}
                    >
                      <X />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Сформированные отчёты">
          {reports.isPending && <LoadingBlock label="Загружаем отчёты…" />}
          {reports.isError && <ErrorBlock error={reports.error} onRetry={() => reports.refetch()} />}
          {reports.data && reports.data.length === 0 && (
            <p className="text-[13.5px] text-ink-3">Отчётов ещё не было.</p>
          )}
          {reports.data && reports.data.length > 0 && (
            <ul className="divide-y divide-line">
              {reports.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                  <span className="flex items-center gap-3">
                    <span className="w-12 font-medium">{FORMAT_LABEL[r.format]}</span>
                    <span className="meta">{formatDateTime(r.finished_at ?? r.created_at)}</span>
                    <Pill tone={r.status === 'done' ? 'ok' : r.status === 'failed' ? 'crit' : 'neutral'}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Pill>
                    {r.error && <span className="text-crit">{r.error.detail}</span>}
                  </span>
                  {r.status === 'done' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadReport(r, title).catch((error) => toast.error(problemText(error)))}
                    >
                      <Download /> Скачать
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Screen>
  )
}
