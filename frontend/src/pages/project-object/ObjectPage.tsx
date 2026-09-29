import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useProject, useProjectId, useProjectParams, useValidation } from '@/entities/project'
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
        <>
          <Button variant="outline" onClick={() => void downloadTemplate()} disabled={downloading}>
            {downloading ? <Spinner /> : <FileSpreadsheet />} Шаблон Excel
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload /> Загрузить файл
          </Button>
        </>
      }
      nextLabel="Начать анализ"
      nextPrimary
      nextDisabled={validation.data ? !validation.data.can_match : false}
    >
      <ObjectOverview projectId={projectId} objectType={objectType.data} params={params.data?.params} />

      <div className="mt-14">
        <h2 className="h2 mb-5">Параметры объекта</h2>
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
