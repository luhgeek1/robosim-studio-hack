import { ChevronDown, Map as MapIcon, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useLayout } from '@/entities/layout'
import { OBJECT_TYPE_LABEL, useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { parseApiProblem } from '@/shared/api/problem'
import type { Layout } from '@/shared/api/types'
import { formatDateTime, formatNumber, formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Button } from '@/shared/ui/button'
import { Callout, PageHeader, Section, Stat, StatStrip } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { ToneBadge } from '@/shared/ui/tone'
import { LayoutMap } from '@/widgets/layout-map'
import { DerivationList } from './DerivationList'
import { TEMPLATE_LABEL } from './labels'
import { RegenerateDialog } from './RegenerateDialog'

export function LayoutPage() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  const objectType = useObjectType(project.data?.object_type)
  const layout = useLayout(projectId)
  const [dialogOpen, setDialogOpen] = useState(false)

  const templates = objectType.data?.layout_templates ?? []
  const unsupported = objectType.data !== undefined && templates.length === 0
  const notGenerated = layout.isError && parseApiProblem(layout.error).status === 404
  const openDialog = () => setDialogOpen(true)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Планировка"
        description="Схема из параметров и нормативов, не CAD. Средние маршруты по графу проходов идут в цикл робота и в имитацию."
        actions={
          layout.data &&
          !unsupported && (
            <Button variant="outline" onClick={openDialog}>
              <RefreshCw /> Перегенерировать
            </Button>
          )
        }
      />

      {layout.isPending && <LoadingBlock rows={4} />}

      {layout.isError &&
        (unsupported ? (
          <EmptyState
            icon={<MapIcon className="size-6" />}
            title={`Для типа «${project.data ? OBJECT_TYPE_LABEL[project.data.object_type] : 'объект'}» схема пока не строится`}
            description={
              <>
                Генератор планировки есть только для складов. Для этого объекта длины маршрутов в расчёте берутся из
                параметров объекта (ваш замер) или из нормативов — источник каждого значения виден в трассе расчёта
                сценария.
              </>
            }
            action={
              <Button asChild variant="outline">
                <Link to={`/projects/${projectId}/object`}>Уточнить параметры объекта</Link>
              </Button>
            }
          />
        ) : notGenerated ? (
          <EmptyState
            icon={<MapIcon className="size-6" />}
            title="Планировка ещё не сгенерирована"
            description="Схема строится из площади, высоты потолков, ширины проходов, потоков паллет и строк отбора. Маршруты по ней уточнят число роботов."
            action={
              <Button onClick={openDialog} disabled={objectType.isPending}>
                <MapIcon /> Сгенерировать
              </Button>
            }
          />
        ) : (
          <ErrorBlock error={layout.error} onRetry={() => layout.refetch()} />
        ))}

      {layout.data && <LayoutView layout={layout.data} onRegenerate={openDialog} canRegenerate={!unsupported} />}

      {dialogOpen && (
        <RegenerateDialog
          projectId={projectId}
          layout={layout.data}
          templates={templates.length ? templates : layout.data?.template ? [layout.data.template] : []}
          open
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  )
}

function LayoutView({
  layout,
  onRegenerate,
  canRegenerate,
}: {
  layout: Layout
  onRegenerate: () => void
  canRegenerate: boolean
}) {
  const { stats } = layout
  const routes = stats.routes ?? []

  return (
    <>
      {layout.params_changed && (
        <Callout
          action={
            canRegenerate && (
              <Button size="sm" variant="outline" onClick={onRegenerate}>
                <RefreshCw /> Перегенерировать
              </Button>
            )
          }
        >
          Параметры объекта менялись после генерации — перегенерируйте планировку, чтобы маршруты соответствовали
          объекту.
        </Callout>
      )}
      {layout.warnings.length > 0 && (
        <Callout>
          <ul className="space-y-0.5">
            {layout.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Section
        title="Схема"
        actions={
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {layout.template && <ToneBadge tone="info">{TEMPLATE_LABEL[layout.template] ?? layout.template}</ToneBadge>}
            {!layout.generated && <ToneBadge tone="warn">изменена вручную</ToneBadge>}
            {layout.updated_at && <span>обновлена {formatDateTime(layout.updated_at)}</span>}
          </span>
        }
        bodyClassName="p-3"
      >
        <LayoutMap layout={layout} className="h-[540px]" />
      </Section>

      <div className="grid grid-cols-[1fr_1.15fr] gap-6">
        <Section
          title="Что вытекает из геометрии"
          description="Эти значения идут в расчёт цикла и в имитацию"
          bodyClassName="p-0"
        >
          <StatStrip columns={2} className="rounded-none border-0 md:divide-x-0">
            <Stat label="Паллетомест в стеллажах" value={formatValue(stats.rack_slots_total, 'шт')} />
            <Stat label="Самый узкий проезд" value={formatValue(stats.min_aisle_width_m, 'м')} />
            <Stat
              label="Ворота приёмки / отгрузки"
              value={`${formatNumber(stats.docks_in)} / ${formatNumber(stats.docks_out)}`}
            />
            <Stat label="Станций отбора" value={formatValue(stats.pick_stations, 'шт')} />
            <Stat label="Мобильных стеллажей G2P" value={formatValue(stats.pods, 'шт')} />
            <Stat label="Зарядных мест" value={formatValue(stats.chargers, 'шт')} />
          </StatStrip>
        </Section>

        <Section title="Средние маршруты" description="Кратчайшие пути по графу, взвешенные по паллетоместам">
          {routes.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Маршрут</TableHead>
                  <TableHead className="text-right">Длина, м</TableHead>
                  <TableHead className="text-right">Пар усреднено</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow key={route.key}>
                    <TableCell className="whitespace-normal">{route.name}</TableCell>
                    <TableCell className="num text-right font-medium">{formatNumber(route.value_m)}</TableCell>
                    <TableCell className="num text-right text-muted-foreground">{formatNumber(route.pairs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">Маршруты не рассчитаны.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            По этим длинам считается время цикла робота. Приоритет источников: замер пользователя, планировка, норматив.
          </p>
        </Section>
      </div>

      {layout.derivation.length > 0 && <Derivation layout={layout} />}
    </>
  )
}

function Derivation({ layout }: { layout: Layout }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-surface">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 text-left">
        <div>
          <div className="text-[15px] font-semibold">Как получена геометрия</div>
          <div className="text-xs text-muted-foreground">
            {layout.derivation.length} шагов: каждый размер — формула из параметров объекта и нормативов
          </div>
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-5 pb-3">
        <DerivationList steps={layout.derivation} />
      </CollapsibleContent>
    </Collapsible>
  )
}
