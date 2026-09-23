import { FileText } from 'lucide-react'
import { Screen } from '@/shared/ui/page'
import { EmptyState } from '@/shared/ui/states'

export function ReportSoonPage() {
  return (
    <Screen title="Отчёт" lead="Документ для инвесткомитета: предТЭО с дисклеймером, формулами и источниками.">
      <EmptyState
        icon={<FileText className="size-6" />}
        title="Экран в работе"
        description={
          <ul className="mt-1 list-disc space-y-1 pl-5 text-left">
            <li>PDF с executive summary, сравнением сценариев и рисками</li>
            <li>Excel с живыми формулами из трассы расчёта</li>
            <li>Раздел «Допущения и источники» из реестра нормативов</li>
          </ul>
        }
      />
    </Screen>
  )
}
