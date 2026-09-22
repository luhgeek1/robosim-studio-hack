import { FileText, PlayCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/shared/ui/page'
import { EmptyState } from '@/shared/ui/states'

function Soon({
  title,
  description,
  icon,
  items,
}: {
  title: string
  description: string
  icon: ReactNode
  items: string[]
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title="Экран появится вместе с эндпоинтами бэкенда"
        description={
          <ul className="mt-2 list-disc space-y-1 pl-5 text-left">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        }
      />
    </div>
  )
}

export function SimulationSoonPage() {
  return (
    <Soon
      title="Имитация"
      description="Дискретно-событийная имитация на графе планировки проверяет и уточняет число роботов: итоговое N в экономике берётся из неё."
      icon={<PlayCircle className="size-6" />}
      items={[
        '2D-плеер по журналу событий: роботы, задачи, заторы в проходах, зарядки, отказы',
        'Режимы: обычный и пиковый день, отказ робота, +20 % объёма',
        'KPI в реальном времени и блок «расчёт против имитации»',
        'Перебор флота N → SLA и окупаемость, диагностика узкого места',
      ]}
    />
  )
}

export function ReportSoonPage() {
  return (
    <Soon
      title="Отчёт"
      description="Документ для инвесткомитета: предТЭО с дисклеймером, формулами и источниками."
      icon={<FileText className="size-6" />}
      items={[
        'PDF с executive summary, сравнением сценариев и рисками',
        'Excel с живыми формулами из трассы расчёта',
        'Раздел «Допущения и источники» из реестра нормативов',
      ]}
    />
  )
}
