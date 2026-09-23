import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { OBJECT_TYPE_LABEL, useProject, useProjectId, useProjectParams } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { ParamsEditor } from '@/features/param-edit'
import { ImportDialog } from '@/features/params-import'
import { problemText } from '@/shared/api/problem'
import { downloadFile } from '@/shared/lib/download'
import { Button } from '@/shared/ui/button'
import { PageHeader } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { TrustPanel } from './TrustPanel'
import { ValidationPanel } from './ValidationPanel'

export function ObjectPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const params = useProjectParams(projectId)
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
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Параметры объекта"
        description={`${OBJECT_TYPE_LABEL[project.object_type]}. У каждого значения есть источник: уточните допущения и пропуски, и расчёт станет точнее.`}
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
      />

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-6">
        <TrustPanel projectId={projectId} />
        <ValidationPanel projectId={projectId} />
      </div>

      {(params.isPending || objectType.isPending) && <LoadingBlock rows={6} />}
      {params.error && <ErrorBlock error={params.error} onRetry={() => params.refetch()} />}
      {objectType.error && <ErrorBlock error={objectType.error} onRetry={() => objectType.refetch()} />}
      {params.data && objectType.data && (
        <ParamsEditor projectId={projectId} params={params.data.params} groups={objectType.data.parameter_groups} />
      )}

      <ImportDialog projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
