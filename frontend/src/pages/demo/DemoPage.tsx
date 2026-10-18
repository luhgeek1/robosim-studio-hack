import { useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { useDemo, useDemoWhatIf, type DemoChanges, type DemoSnapshot } from '@/entities/demo/api'
import { demoStep, demoUrl } from '@/entities/demo/navigation'
import { useDemoWorkspace } from '@/entities/demo/workspace'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { GuestScreen } from './GuestScreen'
import { ObjectStep } from './ObjectStep'
import { Decision } from './Decision'
import { Simulation } from './Simulation'
import { Report } from './Report'
import type { FleetCheckState } from './FleetCheck'
import { INITIAL } from './defaults'

export function DemoPage() {
  const { demoKey } = useParams()
  const activeKey = useDemoWorkspace((s) => s.activeKey)
  const activeStep = useDemoWorkspace((s) => s.steps[s.activeKey] ?? 'object')
  const snapshot = useDemo(demoKey ?? activeKey)
  useEffect(() => {
    const previous = document.title
    document.title = 'Демо-проект — РобоМера'
    return () => {
      document.title = previous
    }
  }, [])
  if (!demoKey) return <Navigate to={demoUrl(activeKey, activeStep)} replace />
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
  const formula = useDemoWhatIf(demo, { ...applied, fleet_source: 'formula' }, true)
  const simulation = useDemoWhatIf(demo, applied, applied.fleet_source === 'simulation')
  const result = applied.fleet_source === 'simulation' ? simulation : formula
  const pending = JSON.stringify(changes) !== JSON.stringify(applied) || result.isFetching || formula.isFetching
  const retry = () => {
    void formula.refetch()
    if (applied.fleet_source === 'simulation') void simulation.refetch()
  }
  const update = (next: DemoChanges) =>
    setChanges({ ...next, fleet_source: (next.volume_multiplier ?? 1) !== 1 ? 'formula' : next.fleet_source })
  const fleet: FleetCheckState = {
    formula: formula.data?.calculation,
    current: result.data?.calculation,
    applied:
      changes.fleet_source === 'simulation' &&
      applied.fleet_source === 'simulation' &&
      !!result.data?.simulation_valid &&
      !result.isPlaceholderData &&
      !result.isError,
    busy: pending,
    changedVolume: (changes.volume_multiplier ?? 1) !== 1,
    error: result.isError ? problemText(result.error) : formula.isError ? problemText(formula.error) : null,
    onApply: () => {
      if (result.isError || formula.isError) retry()
      else if (applied.fleet_source === 'simulation') void result.refetch()
      else update({ ...changes, fleet_source: 'simulation' })
    },
    onUseFormula: () => update({ ...changes, fleet_source: 'formula' }),
    onResetVolume: () => update({ ...changes, volume_multiplier: 1, fleet_source: 'formula' }),
  }
  return (
    <>
      {step === 'object' && <ObjectStep demo={demo} value={changes} onChange={update} />}
      {step === 'decision' &&
        (result.data ? (
          <Decision
            demo={demo}
            current={result.data.calculation}
            result={result.data}
            pending={pending}
            failed={fleet.error}
            value={changes}
            onChange={update}
            onRetry={retry}
            fleet={fleet}
          />
        ) : (
          <GuestScreen title="Подбор роботов и расчёт эффекта">
            {result.isError ? (
              <ErrorBlock error={result.error} onRetry={retry} />
            ) : (
              <LoadingBlock label="Считаем исходный парк по формуле…" />
            )}
          </GuestScreen>
        ))}
      {step === 'simulation' && <Simulation demo={demo} fleet={fleet} />}
      {step === 'report' && (
        <Report
          demo={demo}
          changed={JSON.stringify({ ...changes, fleet_source: 'formula' }) !== JSON.stringify(INITIAL)}
        />
      )}
    </>
  )
}
