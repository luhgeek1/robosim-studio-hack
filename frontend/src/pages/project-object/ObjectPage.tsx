import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useProject, useProjectId, useProjectParams, useValidation } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { ParamsEditor } from '@/features/param-edit'
import { ImportDialog } from '@/features/params-import'
import { problemText } from '@/shared/api/problem'
import type { ProjectParam } from '@/shared/api/types'
import { downloadFile } from '@/shared/lib/download'
import { Button } from '@/shared/ui/button'
import { Screen } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { ObjectTwin } from './ObjectTwin'
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
      nextDisabled={validation.data ? !validation.data.can_match : false}
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr]">
        <div className="space-y-6">
          <TrustPanel projectId={projectId} />
          <ValidationPanel projectId={projectId} />
        </div>

        <div className="card relative h-160 overflow-hidden lg:sticky lg:top-36">
          {objectType.data ? (
            <ObjectTwin projectId={projectId} objectType={objectType.data} area={area} />
          ) : (
            <div className="h-full animate-pulse bg-surface-2" />
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
