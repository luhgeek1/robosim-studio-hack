import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useGenerateLayout } from '@/entities/layout'
import type { Layout, LayoutGenerateRequest, LayoutTemplate } from '@/shared/api/types'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ErrorBlock, Spinner } from '@/shared/ui/states'
import { ZONE_COLOR } from '@/widgets/layout-map'
import { TEMPLATE_HINT, TEMPLATE_LABEL } from './labels'

type OverrideKey = 'aspect_ratio' | 'docks_in' | 'docks_out' | 'pick_stations' | 'chargers' | 'cross_aisles'

const OVERRIDES: { key: OverrideKey; label: string; unit: string; min: number; step: number; integer: boolean }[] = [
  { key: 'aspect_ratio', label: 'Длина здания к глубине', unit: 'раз', min: 0.2, step: 0.1, integer: false },
  { key: 'docks_in', label: 'Ворот приёмки', unit: 'шт', min: 1, step: 1, integer: true },
  { key: 'docks_out', label: 'Ворот отгрузки', unit: 'шт', min: 1, step: 1, integer: true },
  { key: 'pick_stations', label: 'Станций отбора', unit: 'шт', min: 0, step: 1, integer: true },
  { key: 'chargers', label: 'Зарядных мест', unit: 'шт', min: 1, step: 1, integer: true },
  { key: 'cross_aisles', label: 'Поперечных проездов', unit: 'шт', min: 0, step: 1, integer: true },
]

const isWarehouse = (template: string) => template.startsWith('warehouse_')

function overridesFor(template: string) {
  return isWarehouse(template) ? OVERRIDES : OVERRIDES.filter(({ key }) => key === 'chargers')
}

function currentValue(layout: Layout | undefined, key: OverrideKey): number | undefined {
  if (!layout) return undefined
  const override = layout.generator?.overrides?.[key]
  if (override !== undefined) return override
  if (key === 'aspect_ratio') return layout.generator?.params?.layout_building_aspect_ratio
  if (key === 'chargers') return layout.stats.chargers
  return layout.derivation.find((step) => step.key === key)?.value
}

export function RegenerateDialog({
  projectId,
  layout,
  templates,
  open,
  onOpenChange,
}: {
  projectId: string
  layout?: Layout
  templates: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const generate = useGenerateLayout(projectId)
  const [template, setTemplate] = useState<string>(layout?.template ?? templates[0] ?? '')
  const [values, setValues] = useState<Partial<Record<OverrideKey, string>>>(() =>
    Object.fromEntries(Object.entries(layout?.generator?.overrides ?? {}).map(([key, value]) => [key, String(value)])),
  )

  const overrides = overridesFor(template)
  const invalid = overrides.filter(({ key, min, integer }) => {
    const raw = values[key]?.trim()
    if (!raw) return false
    const n = Number(raw.replace(',', '.'))
    return !Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))
  })

  const submit = () => {
    const body: LayoutGenerateRequest = { template: (template || null) as LayoutTemplate | null, overrides: {} }
    for (const { key } of overrides) {
      const raw = values[key]?.trim()
      if (raw) body.overrides![key] = Number(raw.replace(',', '.'))
    }
    generate.mutate(body, {
      onSuccess: () => {
        toast.success('Планировка перегенерирована — пересчитайте сценарии')
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-[20px] font-semibold tracking-[-0.02em]">
            {layout ? 'Перегенерировать планировку' : 'Построить планировку'}
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-relaxed text-ink-3">
            Схема строится из параметров объекта и нормативов. Поля ниже необязательны: пустое — значение генератора.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 pt-5 pb-6">
          <div role="radiogroup" aria-label="Шаблон" className="grid grid-cols-2 gap-3">
            {templates.map((key) => (
              <TemplateCard key={key} template={key} active={key === template} onSelect={() => setTemplate(key)} />
            ))}
          </div>

          <div>
            <div className="mb-2.5 text-[13px] text-ink-2">Уточнить генератор</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {overrides.map(({ key, label, unit, min, step, integer }) => {
                const current = currentValue(layout, key)
                const bad = invalid.some((o) => o.key === key)
                return (
                  <Field
                    key={key}
                    label={label}
                    htmlFor={`ov-${key}`}
                    error={bad ? (integer ? `целое число, не меньше ${min}` : `не меньше ${min}`) : null}
                  >
                    <div className="relative">
                      <Input
                        id={`ov-${key}`}
                        type="number"
                        inputMode="decimal"
                        min={min}
                        step={step}
                        value={values[key] ?? ''}
                        aria-invalid={bad || undefined}
                        placeholder={current !== undefined ? `сейчас ${formatNumber(current)}` : 'авто'}
                        onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="num h-10 rounded-lg bg-card pr-16 text-[14px]"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] text-ink-3">
                        {unit}
                      </span>
                    </div>
                  </Field>
                )
              })}
            </div>
          </div>

          {generate.error && <ErrorBlock error={generate.error} />}

          {layout && (
            <p className="flex gap-2.5 rounded-xl bg-warn-soft/70 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
              Маршруты изменятся, и расчёты сценариев станут устаревшими — их нужно будет пересчитать.
            </p>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-xl border-t border-line bg-surface-2 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={generate.isPending || invalid.length > 0 || !template}>
            {generate.isPending ? <Spinner /> : <RefreshCw />}
            {layout ? 'Перегенерировать' : 'Построить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* The template as a tiny plan: where the gates of receiving (green) and shipping (orange) stand and how goods flow. */
function TemplateCard({ template, active, onSelect }: { template: string; active: boolean; onSelect: () => void }) {
  const through = template === 'warehouse_flow_through'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'rounded-xl p-3 text-left ring-1 transition-shadow',
        active ? 'bg-card ring-2 ring-ink' : 'bg-surface-2 ring-line hover:ring-ink-4',
      )}
    >
      <svg viewBox="0 0 160 76" className="w-full" aria-hidden>
        <rect x="6" y="6" width="148" height="64" rx="6" fill="var(--card)" stroke="var(--input)" />
        {template === 'hospital_floor' && <HospitalThumb />}
        {template === 'airport_apron' && <AirportThumb />}
        {isWarehouse(template) &&
          [0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect
              key={i}
              x={38 + i * 12}
              y={through ? 24 : 16}
              width="5"
              height="28"
              rx="1"
              fill="var(--ink-4)"
              opacity="0.5"
            />
          ))}
        {!isWarehouse(template) ? null : through ? (
          <>
            <Gates x={22} y={70} color={ZONE_COLOR.receiving} />
            <Gates x={112} y={6} color={ZONE_COLOR.shipping} />
            <path
              d="M34 60 C 60 60, 100 16, 124 16"
              fill="none"
              stroke="var(--warn)"
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd="url(#tpl-arrow)"
            />
          </>
        ) : (
          <>
            <Gates x={22} y={70} color={ZONE_COLOR.receiving} />
            <Gates x={112} y={70} color={ZONE_COLOR.shipping} />
            <path
              d="M34 60 C 34 44, 60 50, 80 50 S 124 44, 124 58"
              fill="none"
              stroke="var(--warn)"
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd="url(#tpl-arrow)"
            />
          </>
        )}
        <defs>
          <marker id="tpl-arrow" viewBox="0 0 8 8" refX="5" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--warn)" />
          </marker>
        </defs>
      </svg>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium">{TEMPLATE_LABEL[template] ?? template}</span>
        <span
          className={cn(
            'grid size-4 place-items-center rounded-full ring-1 transition-colors',
            active ? 'bg-ink ring-ink' : 'ring-input',
          )}
        >
          {active && <span className="size-1.5 rounded-full bg-white" />}
        </span>
      </div>
      {TEMPLATE_HINT[template] && (
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{TEMPLATE_HINT[template]}</p>
      )}
    </button>
  )
}

function HospitalThumb() {
  return (
    <g>
      <rect x="14" y="14" width="50" height="48" rx="3" fill={ZONE_COLOR.kitchen} opacity="0.35" />
      <rect x="72" y="30" width="16" height="16" rx="2" fill={ZONE_COLOR.elevator} opacity="0.8" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={98 + (i % 2) * 28}
          y={14 + Math.floor(i / 2) * 26}
          width="24"
          height="22"
          rx="2"
          fill={ZONE_COLOR.ward}
          opacity="0.45"
        />
      ))}
    </g>
  )
}

function AirportThumb() {
  return (
    <g>
      <rect x="14" y="14" width="132" height="12" rx="2" fill={ZONE_COLOR.terminal} opacity="0.5" />
      <rect x="14" y="30" width="132" height="34" rx="2" fill={ZONE_COLOR.apron} opacity="0.25" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={22 + i * 25} y={40} width="16" height="14" rx="2" fill={ZONE_COLOR.apron} opacity="0.7" />
      ))}
    </g>
  )
}

function Gates({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x + i * 9} y={y - 2.5} width="7" height="5" rx="1" fill={color} />
      ))}
    </g>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[12.5px] font-normal text-ink-3">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-crit">{error}</p>}
    </div>
  )
}
