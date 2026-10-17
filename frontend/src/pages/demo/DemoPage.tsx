import { useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { Info } from 'lucide-react'
import { useDemo, useDemoWhatIf, type DemoChanges, type DemoSnapshot } from '@/entities/demo/api'
import { demoStep } from '@/entities/demo/navigation'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { GuestScreen } from './GuestScreen'
import { ObjectStep } from './ObjectStep'
import { Decision } from './Decision'
import { Simulation } from './Simulation'
import { Report } from './Report'
import { INITIAL } from './defaults'

export function DemoPage() {
  const { demoKey } = useParams()
  const snapshot = useDemo(demoKey ?? 'warehouse_demo_01')
  useEffect(() => {
    const previous = document.title
    document.title = 'Демо-проект — РобоМера'
    return () => {
      document.title = previous
    }
  }, [])
  if (!demoKey) return <Navigate to="/demo/warehouse_demo_01?step=object" replace />
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pt-5 sm:px-6">
      {snapshot.isError ? (
        <GuestScreen title="Демонстрационный проект">
          <ErrorBlock error={snapshot.error} onRetry={() => snapshot.refetch()} />
        </GuestScreen>
      ) : !snapshot.data || 'status' in snapshot.data ? (
        <GuestScreen title="Демонстрационный проект">
          <div className="card p-6">
            <LoadingBlock
              label={
                snapshot.data && 'status' in snapshot.data && snapshot.data.status === 'failed'
                  ? 'Пример пока не готов'
                  : 'Готовим объект, подбор и расчёт…'
              }
            />
            <p className="mt-3 text-[13px] text-ink-3">После подготовки пример откроется автоматически.</p>
            <Button variant="outline" className="mt-4" onClick={() => void snapshot.refetch()}>
              Проверить готовность
            </Button>
          </div>
        </GuestScreen>
      ) : (
        <Journey key={`${demoKey}:${snapshot.data.revision}`} demo={snapshot.data} />
      )}
    </div>
  )
}

function Journey({ demo }: { demo: DemoSnapshot }) {
  const [search] = useSearchParams()
  const step = demoStep(search.get('step'))
  const [changes, setChanges] = useState<DemoChanges>(INITIAL)
  const [applied, setApplied] = useState<DemoChanges>(INITIAL)
  useEffect(() => {
    const timer = setTimeout(() => setApplied(changes), 350)
    return () => clearTimeout(timer)
  }, [changes])
  const changed = JSON.stringify(applied) !== JSON.stringify(INITIAL)
  const result = useDemoWhatIf(demo, applied, changed)
  const base = demo.calculations.find((c) => c.scenario_id === demo.primary_scenario_id)!
  const preview = changed && !result.isError ? result.data : undefined
  const pending = JSON.stringify(changes) !== JSON.stringify(applied) || (changed && result.isFetching)
  return (
    <>
      {step !== 'simulation' && (
        <aside
          aria-label="Ознакомительный режим"
          className="mx-auto mb-6 flex w-full max-w-300 items-start gap-2.5 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-3"
        >
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-medium text-ink-2">Демо-проект · 4 основных шага.</strong> В своём проекте появятся
            все 9 шагов, собственные параметры, планировка и сохранение результатов.
          </p>
        </aside>
      )}
      {step === 'object' && <ObjectStep demo={demo} value={changes} onChange={setChanges} />}
      {step === 'decision' && (
        <Decision
          demo={demo}
          current={preview?.calculation ?? base}
          result={preview}
          pending={pending}
          failed={changed && result.isError ? problemText(result.error) : null}
          value={changes}
          onChange={setChanges}
          onRetry={() => void result.refetch()}
        />
      )}
      {step === 'simulation' && <Simulation demo={demo} changedVolume={(changes.volume_multiplier ?? 1) !== 1} />}
      {step === 'report' && <Report demo={demo} changed={JSON.stringify(changes) !== JSON.stringify(INITIAL)} />}
    </>
  )
}
