import { useState } from 'react'
import type { DemoSnapshot } from '@/entities/demo/api'
import { ReportDownloads } from '@/entities/report'
import { apiPublic } from '@/shared/api/client'
import { problemText } from '@/shared/api/problem'
import { formatDateTime } from '@/shared/lib/format'
import { HeadingWithHint } from '@/shared/ui/heading-with-hint'
import { FullAccess } from './ProjectCTA'
import { GuestScreen } from './GuestScreen'

export function Report({ demo, changed }: { demo: DemoSnapshot; changed: boolean }) {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const download = async (format: 'pdf' | 'xlsx') => {
    setBusy(format)
    setError(null)
    try {
      const response = await apiPublic.get<Blob>(`/demo/projects/${demo.demo.key}/report/${format}`, {
        responseType: 'blob',
        params: { revision: demo.revision },
      })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `Робомера_${demo.demo.key}.${format}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <GuestScreen
      className="lg:max-w-250"
      title={
        <HeadingWithHint text="Результаты оценки и отчёт" title="Предварительная оценка">
          Перед внедрением проверьте исходные данные и допущения при обследовании объекта.
        </HeadingWithHint>
      }
      lead="Скачайте расчёт демонстрационного объекта или продолжите работу в личном проекте."
    >
      <div className="space-y-6">
        <ReportDownloads
          onPdf={() => void download('pdf')}
          onExcel={() => void download('xlsx')}
          busyFormat={busy}
          note={
            <>
              Файлы относятся к исходному примеру после проверки имитацией
              {changed ? ', без ваших пробных изменений' : ''}. Расчёт от {formatDateTime(demo.prepared_at)}.
            </>
          }
        />
        {error && (
          <p className="text-[13px] text-crit" role="alert">
            {error}
          </p>
        )}
        <FullAccess demo={demo} />
      </div>
    </GuestScreen>
  )
}
