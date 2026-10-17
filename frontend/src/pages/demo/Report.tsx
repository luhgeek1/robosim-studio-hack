import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Info } from 'lucide-react'
import type { DemoSnapshot } from '@/entities/demo/api'
import { apiPublic } from '@/shared/api/client'
import { problemText } from '@/shared/api/problem'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Section } from '@/shared/ui/page'
import { Spinner } from '@/shared/ui/states'
import { FullAccess } from './ProjectCTA'
import { GuestScreen } from './GuestScreen'

export function Report({ demo, changed }: { demo: DemoSnapshot; changed: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
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
      title="Результаты оценки и отчёт"
      lead="Скачайте расчёт демонстрационного объекта или продолжите работу в личном проекте."
    >
      <div className="space-y-6">
        <aside className="flex items-start gap-3 border-y border-line py-4" aria-label="Статус оценки">
          <Info size={16} className="mt-0.5 shrink-0 text-[#d6633c]" />
          <div>
            <p className="text-[13.5px] font-semibold">Предварительная оценка</p>
            <p className="mt-1 text-[13px] text-ink-3">Результат требует проверки при обследовании объекта.</p>
          </div>
        </aside>
        <Section title="Скачать отчёт" description="Оба формата доступны без аккаунта.">
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                {
                  format: 'pdf',
                  title: 'ПредТЭО, PDF',
                  text: 'Объект, подобранные роботы, экономика, результаты имитации и основания решения.',
                  Icon: FileText,
                },
                {
                  format: 'xlsx',
                  title: 'Расчёт, Excel',
                  text: 'Исходные параметры, формулы, денежные потоки, допущения и источники.',
                  Icon: FileSpreadsheet,
                },
              ] as const
            ).map(({ format, title, text, Icon }) => (
              <div key={format} className="flex flex-col rounded-xl border border-line bg-surface-2 p-5">
                <Icon size={22} className="text-ink-3" />
                <h3 className="h3 mt-3">{title}</h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-3">{text}</p>
                <Button
                  variant="outline"
                  className="mt-5 self-start"
                  onClick={() => void download(format)}
                  disabled={!!busy}
                >
                  {busy === format ? <Spinner /> : <Download />}Скачать {format === 'pdf' ? 'PDF' : 'Excel'}
                </Button>
              </div>
            ))}
          </div>
          <p className="meta mt-4">
            Файлы относятся к исходному примеру после проверки имитацией{changed ? ', без ваших пробных изменений' : ''}
            . Расчёт от {formatDateTime(demo.prepared_at)}.
          </p>
          {error && (
            <p className="mt-3 text-[13px] text-crit" role="alert">
              {error}
            </p>
          )}
        </Section>
        <FullAccess demo={demo} />
      </div>
    </GuestScreen>
  )
}
