import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useProject, useProjectId, useProjectParams, useValidation } from '@/entities/project'
import { useJourney } from '@/entities/project/journey'
import { useObjectType } from '@/entities/reference'
import { ParamsEditor } from '@/features/param-edit'
import { ImportDialog } from '@/features/params-import'
import { problemText } from '@/shared/api/problem'
import { downloadFile } from '@/shared/lib/download'
import { Button } from '@/shared/ui/button'
import { Screen } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { ObjectOverview } from './ObjectOverview'

export function ObjectPage() {
  const projectId = useProjectId()
  const { guided } = useJourney(projectId)
  const [editing, setEditing] = useState(false)
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

  return (
    <Screen
      dense
      title={project.name}
      actions={
        <div className="flex max-w-full flex-wrap items-center gap-2 max-sm:flex-nowrap">
          <Button
            variant="outline"
            onClick={() => void downloadTemplate()}
            disabled={downloading}
            aria-label="Шаблон Excel"
          >
            {downloading ? <Spinner /> : <FileSpreadsheet />}
            <span className="sm:hidden">Шаблон</span>
            <span className="hidden sm:inline">Шаблон Excel</span>
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} aria-label="Загрузить файл">
            <Upload />
            <span className="sm:hidden">Загрузить</span>
            <span className="hidden sm:inline">Загрузить файл</span>
          </Button>
        </div>
      }
      nextLabel={guided ? 'Посмотреть роботов' : 'Начать анализ'}
      nextPrimary
      nextDisabled={validation.data ? !validation.data.can_match : false}
    >
      <ObjectOverview projectId={projectId} objectType={objectType.data} params={params.data?.params} guided={guided} />

      {guided && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-5">
          <p className="max-w-170 text-sm text-ink-3">
            Попробуйте изменить нагрузку или зарплату. Экономика пересчитается на ваших данных; изменение физических
            условий потребует новой проверки имитацией.
          </p>
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? 'Свернуть параметры' : 'Изменить параметры'}
          </Button>
        </div>
      )}
      <details open={!guided || editing} className="mt-10" onToggle={(event) => setEditing(event.currentTarget.open)}>
        <summary className="h2 mb-5 cursor-pointer">Параметры объекта</summary>
        {(params.isPending || objectType.isPending) && <LoadingBlock label="Загружаем параметры…" />}
        {params.error && <ErrorBlock error={params.error} onRetry={() => params.refetch()} />}
        {objectType.error && <ErrorBlock error={objectType.error} onRetry={() => objectType.refetch()} />}
        {params.data && objectType.data && (
          <ParamsEditor projectId={projectId} params={params.data.params} groups={objectType.data.parameter_groups} />
        )}
      </details>

      <ImportDialog projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
    </Screen>
  )
}
