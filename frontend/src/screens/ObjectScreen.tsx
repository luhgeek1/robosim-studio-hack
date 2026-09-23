import { useMemo } from 'react'
import { useProject, useProjectParams, useValidation } from '@/api/projects'
import { useObjectType } from '@/api/reference'
import type { ProvenanceStatus } from '@/api/types'
import { ImportModal } from '@/components/object/ImportModal'
import { ParamList } from '@/components/object/ParamList'
import { dataOrigin } from '@/components/object/origin'
import { SourceCard } from '@/components/object/SourceCard'
import { TwinCard } from '@/components/object/TwinCard'
import { useParamsImport } from '@/components/object/useParamsImport'
import { ValidationIssues } from '@/components/object/ValidationIssues'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Dot } from '@/components/ui'
import { PROVENANCE_LABEL, PROVENANCE_TONE } from '@/lib/labels'
import { useProjectId } from '@/lib/story'
import { useStore } from '@/store'

const LEGEND_ORDER: ProvenanceStatus[] = [
  'user',
  'imported',
  'confirmed',
  'derived',
  'default',
  'assumption',
  'vendor_claim',
  'llm_suggested',
  'missing',
]

export function ObjectScreen() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const params = useProjectParams(projectId)
  const validation = useValidation(projectId)
  const objectType = useObjectType(project.object_type)
  const importer = useParamsImport(projectId)
  const setTrustOpen = useStore((s) => s.setTrustOpen)

  const processNames = useMemo(
    () => new Map((objectType.data?.processes ?? []).map((p) => [p.key, p.name])),
    [objectType.data],
  )
  const paramNames = useMemo(() => new Map((params.data?.params ?? []).map((p) => [p.key, p.name])), [params.data])
  const origin = params.data ? dataOrigin(project, params.data.params) : null
  const lead = origin?.fromFile
    ? 'Значения взяты из загруженного файла, а где их нет — из справочника с источником. Любое число можно исправить — расчёты пересчитаются.'
    : project.is_demo
      ? 'Значения взяты из данных организатора, а где их нет — из справочника с источником. Любое число можно исправить — расчёты пересчитаются.'
      : 'Значения по умолчанию взяты из справочника с источником. Заполните пропуски вручную или загрузите файл по шаблону — расчёты пересчитаются.'
  const counts = project.data_quality.counts

  return (
    <Screen
      wide
      title={project.name}
      lead={lead}
      nextLabel="Где уходят деньги"
      nextDisabled={!validation.data?.can_match}
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr]">
        <div className="min-w-0">
          {params.data ? (
            <SourceCard project={project} params={params.data.params} onFile={importer.pick} />
          ) : (
            <div className="card h-[62px] animate-pulse bg-surface-2" />
          )}

          {validation.data && <ValidationIssues report={validation.data} />}

          {(params.isPending || objectType.isPending) && (
            <div className="mt-6">
              <Loading label="Загружаем параметры…" />
            </div>
          )}
          {params.error && (
            <div className="mt-6">
              <ErrorState error={params.error} onRetry={() => params.refetch()} />
            </div>
          )}
          {objectType.error && (
            <div className="mt-6">
              <ErrorState error={objectType.error} onRetry={() => objectType.refetch()} />
            </div>
          )}
          {params.data && objectType.data && (
            <ParamList
              projectId={projectId}
              params={params.data.params}
              groups={objectType.data.parameter_groups}
              processNames={processNames}
            />
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-3">
            {LEGEND_ORDER.filter((s) => counts[s]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <Dot tone={PROVENANCE_TONE[s]} />
                {PROVENANCE_LABEL[s]} <span className="num text-ink">{counts[s]}</span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setTrustOpen(true)}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              Откуда данные
            </button>
          </div>
        </div>

        <TwinCard projectId={projectId} objectType={objectType.data} paramNames={paramNames} />
      </div>

      <ImportModal projectId={projectId} importer={importer} />
    </Screen>
  )
}
