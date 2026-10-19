import { KeepProject } from './KeepProject'
import { ChevronDown, Download, History, ImageIcon, X } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useProject, useProjectId } from '@/entities/project'
import {
  ReportDownloads,
  downloadReport,
  useMakeReport,
  useProjectVisuals,
  useReportVisuals,
  useReports,
} from '@/entities/report'
import { useComparison } from '@/entities/scenario'
import { parseApiProblem, problemText } from '@/shared/api/problem'
import type { ReportFormat } from '@/shared/api/types'
import { formatDateTime, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { HeadingWithHint } from '@/shared/ui/heading-with-hint'
import { Callout, Screen } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Pill } from '@/shared/ui/v0'

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
  const headline = comparison.data?.verdict.headline ?? 'Отчёт для инвесткомитета'

  const build = (format: ReportFormat) =>
    make.mutate(
      { format, visual_ids: format === 'pdf' ? visuals.map((v) => v.id) : undefined },
      { onError: (error) => toast.error(problemText(error)) },
    )

  return (
    <Screen
      className="lg:max-w-250"
      title={
        <HeadingWithHint text={headline} title="Предварительная оценка">
          Перед внедрением проверьте исходные данные и допущения при обследовании объекта.
        </HeadingWithHint>
      }
    >
      <div className="space-y-6">
        {noCalculations && (
          <Callout>Нет рассчитанных сценариев: отчёт соберётся, когда появится хотя бы один расчёт.</Callout>
        )}
        {comparison.isError && !noCalculations && (
          <ErrorBlock error={comparison.error} onRetry={() => comparison.refetch()} />
        )}

        <ReportDownloads
          onPdf={() => build('pdf')}
          onExcel={() => build('xlsx')}
          onJson={() => build('json')}
          busyFormat={make.isPending ? make.variables?.format : null}
          disabled={comparison.isPending || noCalculations}
        />

        <KeepProject />

        <div className="divide-y divide-line/60 rounded-xl bg-surface/60 px-4 sm:px-5">
          <details className="group">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <ImageIcon className="size-5 shrink-0 text-ink-3" strokeWidth={1.6} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">Иллюстрации в PDF</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">
                  {visuals.length > 0
                    ? `${visuals.length} ${pluralRu(visuals.length, ['снимок', 'снимка', 'снимков'])} для отчёта`
                    : 'Схема последней имитации добавится автоматически'}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="pb-4 sm:pl-8">
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">
                Свои кадры можно добавить кнопкой «Снимок в отчёт» на шаге{' '}
                <Link to="../simulation" className="text-info hover:underline">
                  «Имитация»
                </Link>
                .
              </p>
              {visuals.length > 0 && (
                <ul className="divide-y divide-line/60">
                  {visuals.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="block wrap-anywhere">{v.caption}</span>
                        <span className="meta">{formatDateTime(v.createdAt)}</span>
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Убрать из отчёта"
                        onClick={() => removeVisual(projectId, v.id)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details className="group">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <History className="size-5 shrink-0 text-ink-3" strokeWidth={1.6} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">История отчётов</span>
                <span className="mt-0.5 block text-[12px] text-ink-3">
                  {reports.isPending
                    ? 'Загружаем…'
                    : reports.isError
                      ? 'История недоступна'
                      : reports.data.length > 0
                        ? `${reports.data.length} ${pluralRu(reports.data.length, ['отчёт', 'отчёта', 'отчётов'])}`
                        : 'Сохранённых файлов пока нет'}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="pb-4 sm:pl-8">
              {reports.isPending && <LoadingBlock label="Загружаем отчёты…" />}
              {reports.isError && <ErrorBlock error={reports.error} onRetry={() => reports.refetch()} />}
              {reports.data && reports.data.length === 0 && (
                <p className="text-[13px] text-ink-3">Ранее сформированные отчёты будут доступны здесь.</p>
              )}
              {reports.data && reports.data.length > 0 && (
                <ul className="divide-y divide-line/60">
                  {reports.data.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{FORMAT_LABEL[r.format]}</span>
                        <Pill tone={r.status === 'done' ? 'ok' : r.status === 'failed' ? 'crit' : 'neutral'}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Pill>
                        <span className="meta basis-full">{formatDateTime(r.finished_at ?? r.created_at)}</span>
                        {r.error && <span className="wrap-anywhere text-crit">{r.error.detail}</span>}
                      </span>
                      {r.status === 'done' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Скачать ${FORMAT_LABEL[r.format]} из истории`}
                          onClick={() => downloadReport(r, title).catch((error) => toast.error(problemText(error)))}
                        >
                          <Download /> Скачать
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </div>
      </div>
    </Screen>
  )
}
