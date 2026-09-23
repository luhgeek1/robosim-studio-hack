import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { OBJECT_TYPE_LABEL, useProject, useProjectId, useProjectParams, useValidation } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { ParamsEditor } from '@/features/param-edit'
import { ImportDialog } from '@/features/params-import'
import { problemText } from '@/shared/api/problem'
import type { ProjectParam } from '@/shared/api/types'
import { downloadFile } from '@/shared/lib/download'
import { formatNumber, formatValue } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Screen } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Twin } from '@/widgets/twin'
import { TrustPanel } from './TrustPanel'
import { ValidationPanel } from './ValidationPanel'

const numberOf = (params: ProjectParam[] | undefined, key: string) => {
  const value = params?.find((p) => p.key === key)?.value
  return typeof value === 'number' ? value : null
}

export function ObjectPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const params = useProjectParams(projectId)
  const validation = useValidation(projectId)
  const objectType = useObjectType(project.object_type)
  const [importOpen, setImportOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      await downloadFile(`/object-types/${project.object_type}/template.xlsx`, `шаблон-${project.object_type}.xlsx`)
    } catch (error) {
      toast.error(problemText(error))
    } finally {
      setDownloading(false)
    }
  }

  const list = params.data?.params
  const area = numberOf(list, 'robotized_area_m2') ?? numberOf(list, 'area_m2')
  const slots = numberOf(list, 'pallet_positions')
  const moves = (numberOf(list, 'pallets_in_per_day') ?? 0) + (numberOf(list, 'pallets_out_per_day') ?? 0)
  const errors = validation.data?.issues.filter((i) => i.severity === 'error').length ?? 0
  const isWarehouse = project.object_type === 'warehouse'

  return (
    <Screen
      wide
      title={project.name}
      lead="Данные объекта приведены к единой модели. Подтверждённые значения взяты из файла, допущения помечены. Любое число можно исправить — расчёты пересчитаются."
      actions={
        <>
          <Button variant="outline" onClick={() => void downloadTemplate()} disabled={downloading}>
            {downloading ? <Spinner /> : <FileSpreadsheet />} Шаблон Excel
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Upload /> Загрузить файл
          </Button>
        </>
      }
      nextLabel="Начать анализ"
      nextDisabled={errors > 0}
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr]">
        <div className="space-y-6">
          <TrustPanel projectId={projectId} />
          <ValidationPanel projectId={projectId} />
        </div>

        <div className="card relative h-160 overflow-hidden lg:sticky lg:top-36">
          {isWarehouse ? (
            <>
              <Twin mode="overview" />
              <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2">
                <span className="rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12.5px] font-medium">
                  Цифровой двойник
                </span>
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">
                  типовая планировка по параметрам
                </span>
              </div>
              {list && (
                <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-10 flex flex-wrap items-end justify-between gap-3">
                  <div className="grid grid-cols-3 gap-6 rounded-[12px] border border-line bg-white/90 px-4 py-3 backdrop-blur">
                    {[
                      [formatValue(area, 'м²'), 'зона роботизации'],
                      [formatNumber(slots), 'паллето-мест'],
                      [formatNumber(moves), 'перемещений в сутки'],
                    ].map(([v, l]) => (
                      <div key={l}>
                        <div className="display num text-[18px]">{v}</div>
                        <div className="meta">{l}</div>
                      </div>
                    ))}
                  </div>
                  <span className="text-[12px] text-ink-4">Вращайте сцену мышью</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="h2">{OBJECT_TYPE_LABEL[project.object_type]}</div>
              <p className="mt-2 max-w-105 text-[14px] leading-relaxed text-ink-3">
                Для этого типа объекта работают параметры, подбор и аналитическая экономика. Планировка и имитация
                подключаются следующим этапом.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-10">
        {(params.isPending || objectType.isPending) && <LoadingBlock label="Загружаем параметры…" />}
        {params.error && <ErrorBlock error={params.error} onRetry={() => params.refetch()} />}
        {objectType.error && <ErrorBlock error={objectType.error} onRetry={() => objectType.refetch()} />}
        {params.data && objectType.data && (
          <ParamsEditor projectId={projectId} params={params.data.params} groups={objectType.data.parameter_groups} />
        )}
      </div>

      <ImportDialog projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
    </Screen>
  )
}
