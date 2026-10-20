import type { ReactNode } from 'react'
import { Braces, Download, FileSpreadsheet, FileText, Info } from 'lucide-react'
import type { ReportFormat } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { InfoHint } from '@/shared/ui/info-hint'
import { Spinner } from '@/shared/ui/states'

export function ReportDownloads({
  onPdf,
  onExcel,
  onJson,
  busyFormat,
  disabled = false,
  note,
}: {
  onPdf: () => void
  onExcel: () => void
  onJson?: () => void
  busyFormat?: ReportFormat | null
  disabled?: boolean
  note?: ReactNode
}) {
  const busy = busyFormat != null

  return (
    <section aria-label="Скачать отчёт" className="rounded-2xl bg-surface px-4 py-5 sm:px-8 sm:py-6">
      <h2 className="h2">Скачать отчёт</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">Выберите формат - файл скачается автоматически.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          disabled={disabled || busy}
          aria-label="Скачать PDF"
          aria-busy={busyFormat === 'pdf'}
          onClick={onPdf}
          className="h-auto min-h-24 w-full justify-between gap-3 rounded-xl border-0 px-4 py-5 text-left whitespace-normal shadow-none sm:px-5"
        >
          <FileText className="size-6" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] leading-snug font-semibold">
              {busyFormat === 'pdf' ? 'Готовим PDF…' : 'Скачать PDF'}
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed font-normal text-ink/75">
              Итоги, экономика и риски
            </span>
          </span>
          {busyFormat === 'pdf' ? <Spinner /> : <Download className="size-5" />}
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          aria-label="Скачать Excel"
          aria-busy={busyFormat === 'xlsx'}
          onClick={onExcel}
          className="h-auto min-h-24 w-full justify-between gap-3 rounded-xl border-0 bg-canvas px-4 py-5 text-left whitespace-normal shadow-none hover:bg-muted sm:px-5"
        >
          <FileSpreadsheet className="size-6 text-ink-3" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] leading-snug font-semibold">
              {busyFormat === 'xlsx' ? 'Готовим Excel…' : 'Скачать Excel'}
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed font-normal text-ink-3">
              Снимок расчёта и денежные потоки
            </span>
          </span>
          {busyFormat === 'xlsx' ? <Spinner /> : <Download className="size-5 text-ink-3" />}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {onJson && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            aria-label="Скачать JSON"
            aria-busy={busyFormat === 'json'}
            onClick={onJson}
            className="-ml-2 min-h-10 gap-1.5 rounded-md px-2 text-[12px] font-normal text-ink-3 sm:min-h-9"
          >
            {busyFormat === 'json' ? <Spinner /> : <Braces />}
            {busyFormat === 'json' ? 'Готовим JSON…' : 'Скачать JSON'}
          </Button>
        )}
        <InfoHint
          title="Что входит в файлы"
          trigger={
            <>
              <Info size={14} aria-hidden="true" /> Состав файлов
            </>
          }
          className="-mr-2 ml-auto gap-1.5 rounded-md px-2 text-[12px]"
        >
          <div className="space-y-3">
            <p>
              <span className="font-medium text-ink">PDF.</span> Итоговое заключение, объект и процессы, подобранные
              роботы, состав парка, экономика, сравнение сценариев, риски, имитация, допущения и источники.
            </p>
            <p>
              <span className="font-medium text-ink">Excel.</span> Исходные параметры, шаги расчёта и денежные потоки на
              дату экспорта. Чтобы изменить условия, пересчитайте сценарий в приложении и скачайте новый файл.
            </p>
            {onJson && (
              <p>
                <span className="font-medium text-ink">JSON.</span> Данные отчёта для интеграций и проверки чисел.
              </p>
            )}
          </div>
        </InfoHint>
      </div>

      {busy && (
        <p role="status" className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Собираем файл. Скачивание начнётся автоматически.
        </p>
      )}
      {note && <p className="mt-2 text-[12px] leading-relaxed wrap-anywhere text-ink-3">{note}</p>}
    </section>
  )
}
