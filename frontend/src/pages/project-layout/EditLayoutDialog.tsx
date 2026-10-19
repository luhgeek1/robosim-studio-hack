import { useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateLayout } from '@/entities/layout'
import type { Layout, LayoutEdge, LayoutNode } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { ErrorBlock, Spinner } from '@/shared/ui/states'
import { EDGE_KIND_LABEL, LayoutMap, MARKER_LABEL } from '@/widgets/layout-map'

type Selection = { kind: 'node' | 'edge'; id: string }

export function EditLayoutDialog({
  projectId,
  layout,
  onOpenChange,
}: {
  projectId: string
  layout: Layout
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateLayout(projectId)
  const [nodes, setNodes] = useState(layout.nodes)
  const [edges, setEdges] = useState(layout.edges)
  const [closed, setClosed] = useState<string[]>([])
  const [selected, setSelected] = useState<Selection>({
    kind: 'node',
    id: layout.nodes.find((n) => n.kind === 'charger')?.id ?? layout.nodes[0]?.id ?? '',
  })
  const node = selected.kind === 'node' ? nodes.find((n) => n.id === selected.id) : undefined
  const edge = selected.kind === 'edge' ? edges.find((e) => e.id === selected.id) : undefined
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const activeEdges = edges.filter((e) => !closed.includes(e.id))
  const preview = { ...layout, nodes, edges: activeEdges }
  const changed = nodes !== layout.nodes || edges !== layout.edges || closed.length > 0
  const invalid =
    nodes.some(
      (n) =>
        n.x < 0 ||
        n.x > layout.width_m ||
        n.y < 0 ||
        n.y > layout.height_m ||
        (n.capacity != null && (!Number.isInteger(n.capacity) || n.capacity < 1)),
    ) || activeEdges.some((e) => e.width_m <= 0)
  const editNode = (patch: Partial<LayoutNode>) =>
    setNodes((current) => current.map((n) => (n.id === selected.id ? { ...n, ...patch } : n)))
  const editEdge = (patch: Partial<LayoutEdge>) =>
    setEdges((current) => current.map((e) => (e.id === selected.id ? { ...e, ...patch } : e)))
  const nodeLabel = (n: LayoutNode) =>
    n.label || `${MARKER_LABEL[n.kind as keyof typeof MARKER_LABEL] ?? 'Точка'} · ${n.id}`
  const edgeLabel = (e: LayoutEdge) =>
    `${EDGE_KIND_LABEL[e.kind]} · ${byId.get(e.from)?.label || e.from} → ${byId.get(e.to)?.label || e.to}`
  const save = () =>
    update.mutate(
      { nodes, edges: activeEdges },
      {
        onSuccess: () => {
          toast.success('Планировка сохранена. Пересчитайте сценарии и запустите имитацию.')
          onOpenChange(false)
        },
      },
    )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!update.isPending) onOpenChange(open)
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Редактировать планировку</DialogTitle>
          <DialogDescription>
            Выберите точку или проход на схеме. Можно уточнить координаты точек зарядки и станций, число лифтов, ширину
            и направление прохода. Длины маршрутов пересчитаются после сохранения.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={update.isPending} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <LayoutMap
            layout={preview}
            showGraph
            simplified
            legend={false}
            className="h-80 lg:h-[460px]"
            highlight={{ nodes: node ? [node.id] : [], edges: edge ? [edge.id] : [] }}
          >
            {(view) => (
              <g onPointerDown={(event) => event.stopPropagation()}>
                {edges.map((e) => {
                  const a = byId.get(e.from),
                    b = byId.get(e.to)
                  if (!a || !b) return null
                  const isClosed = closed.includes(e.id)
                  return (
                    <line
                      key={e.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={isClosed ? 'var(--crit)' : 'transparent'}
                      strokeWidth={(isClosed ? 3 : 12) / view.k}
                      strokeDasharray={isClosed ? `${5 / view.k} ${4 / view.k}` : undefined}
                      className="cursor-pointer"
                      onClick={() => setSelected({ kind: 'edge', id: e.id })}
                    >
                      <title>
                        {edgeLabel(e)}
                        {isClosed ? ' — закрыт' : ''}
                      </title>
                    </line>
                  )
                })}
                {nodes.map((n) => (
                  <g key={n.id} className="cursor-pointer" onClick={() => setSelected({ kind: 'node', id: n.id })}>
                    <title>{nodeLabel(n)}</title>
                    <circle cx={n.x} cy={n.y} r={6 / view.k} fill="transparent" />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={(selected.id === n.id && selected.kind === 'node' ? 5 : n.label ? 3 : 1.5) / view.k}
                      fill={selected.id === n.id && selected.kind === 'node' ? '#e6a23c' : '#64748b'}
                      fillOpacity={n.label || selected.id === n.id ? 1 : 0.55}
                      stroke="white"
                      strokeWidth={0.5 / view.k}
                      pointerEvents="none"
                    />
                  </g>
                ))}
              </g>
            )}
          </LayoutMap>
          <div className="min-w-0 space-y-4">
            <label className="block space-y-1 text-sm">
              <span>Элемент схемы</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-card px-2"
                value={`${selected.kind}:${selected.id}`}
                onChange={(event) => {
                  const [kind, ...id] = event.target.value.split(':')
                  setSelected({ kind: kind as Selection['kind'], id: id.join(':') })
                }}
              >
                <optgroup label="Точки">
                  {nodes.map((n) => (
                    <option key={n.id} value={`node:${n.id}`}>
                      {nodeLabel(n)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Проходы">
                  {edges.map((e) => (
                    <option key={e.id} value={`edge:${e.id}`}>
                      {edgeLabel(e)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {node && (
              <>
                <label className="block space-y-1 text-sm">
                  <span>Название точки</span>
                  <Input value={node.label ?? ''} onChange={(event) => editNode({ label: event.target.value })} />
                </label>
                <NumberField
                  label="X, м"
                  value={node.x}
                  min={0}
                  max={layout.width_m}
                  onChange={(x) => editNode({ x })}
                />
                <NumberField
                  label="Y, м"
                  value={node.y}
                  min={0}
                  max={layout.height_m}
                  onChange={(y) => editNode({ y })}
                />
                {node.kind === 'elevator' && (
                  <NumberField
                    label="Лифтов в группе"
                    value={node.capacity ?? 1}
                    min={1}
                    step={1}
                    onChange={(capacity) => editNode({ capacity })}
                  />
                )}
                {node.kind === 'charger' && (
                  <p className="text-xs text-ink-3">
                    Парк задаёт общее число зарядных устройств. На схеме можно изменить расположение точек зарядки.
                  </p>
                )}
              </>
            )}
            {edge && (
              <>
                <NumberField
                  label="Ширина прохода, м"
                  value={edge.width_m}
                  min={0.01}
                  onChange={(width_m) => editEdge({ width_m })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={edge.one_way ?? false}
                    onChange={(event) => editEdge({ one_way: event.target.checked })}
                  />
                  Односторонний проход
                </label>
                {edge.one_way && (
                  <Button variant="outline" size="sm" onClick={() => editEdge({ from: edge.to, to: edge.from })}>
                    Развернуть направление
                  </Button>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={closed.includes(edge.id)}
                    onChange={(event) =>
                      setClosed((current) =>
                        event.target.checked ? [...current, edge.id] : current.filter((id) => id !== edge.id),
                      )
                    }
                  />
                  Закрыть проход
                </label>
                <p className="text-xs text-ink-3">
                  Закрытый проход будет удалён из маршрутов при сохранении. Схема должна оставаться связной.
                </p>
              </>
            )}
            {invalid && (
              <p role="alert" className="text-sm text-crit">
                Точки должны быть внутри объекта, ширина — больше нуля, число мест — положительное целое.
              </p>
            )}
          </div>
        </fieldset>
        {update.error && <ErrorBlock error={update.error} />}
        <p className="text-sm text-ink-3">
          Сохранение сделает прежние расчёты и подтверждение парка устаревшими. Имитация проверит проходимость маршрутов
          для выбранных роботов.
        </p>
        <DialogFooter>
          <Button variant="ghost" disabled={update.isPending} onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={!changed || invalid || update.isPending} onClick={save}>
            {update.isPending ? <Spinner /> : <Save />}Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const n = Number(event.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}
