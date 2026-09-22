import { Map as MapIcon, RefreshCw, Route, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLayout } from '@/entities/layout'
import { OBJECT_TYPE_LABEL, useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { parseApiProblem } from '@/shared/api/problem'
import type { Layout } from '@/shared/api/types'
import { formatDateTime, formatNumber, formatValue } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { PageHeader, Section, Stat } from '@/shared/ui/page'
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
        eyebrow="Планировка объекта"
        title="Планировка"
        description="Схема объекта из параметров и нормативов (не CAD). Средние маршруты по графу проходов идут в модель цикла робота и в имитацию."
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
        <Banner
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
        </Banner>
      )}
      {layout.warnings.length > 0 && (
        <Banner>
          <ul className="space-y-0.5">
            {layout.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Banner>
      )}

      <Section
        title="Схема"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {layout.template && <ToneBadge tone="info">{TEMPLATE_LABEL[layout.template] ?? layout.template}</ToneBadge>}
            <ToneBadge tone={layout.generated ? 'muted' : 'warn'}>
              {layout.generated ? 'сгенерирована из параметров' : 'изменена вручную'}
            </ToneBadge>
            <span>версия {layout.version}</span>
            {layout.updated_at && <span>· обновлена {formatDateTime(layout.updated_at)}</span>}
          </span>
        }
      >
        <LayoutMap layout={layout} className="h-[540px]" />
      </Section>

      <div className="grid grid-cols-[1fr_1.15fr] gap-6">
        <Section title="Что вытекает из геометрии" description="Эти значения попадают в расчёт цикла и в имитацию">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Паллетомест в стеллажах" value={formatValue(stats.rack_slots_total, 'шт')} />
            <Stat label="Самый узкий проезд" value={formatValue(stats.min_aisle_width_m, 'м')} />
            <Stat
              label="Ворота приёмки / отгрузки"
              value={`${formatNumber(stats.docks_in)} / ${formatNumber(stats.docks_out)}`}
              hint="шт"
            />
            <Stat label="Станций отбора" value={formatValue(stats.pick_stations, 'шт')} />
            <Stat label="Мобильных стеллажей G2P" value={formatValue(stats.pods, 'шт')} />
            <Stat label="Зарядных мест" value={formatValue(stats.chargers, 'шт')} />
            <Stat
              className="col-span-2"
              label="Граф маршрутов"
              value={`${formatNumber(stats.nodes)} узлов · ${formatNumber(stats.edges)} рёбер`}
              hint="включите «Граф маршрутов» на схеме, чтобы увидеть проходы"
            />
          </div>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-2">
              <Route className="size-4" /> Средние маршруты
            </span>
          }
          description="Средние кратчайшие пути по графу, взвешенные по паллетоместам"
        >
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
            Эти длины — вход «планировка» в трассе расчёта: по ним считается время цикла робота, а значит и число
            роботов. Приоритет источников: замер пользователя → планировка → норматив.
          </p>
        </Section>
      </div>

      {layout.derivation.length > 0 && (
        <Section
          title="Как получена геометрия"
          description="Каждый размер — формула из параметров объекта и нормативов. Нажмите на строку, чтобы раскрыть."
        >
          <DerivationList steps={layout.derivation} />
        </Section>
      )}
    </>
  )
}

function Banner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn-soft p-4 text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
