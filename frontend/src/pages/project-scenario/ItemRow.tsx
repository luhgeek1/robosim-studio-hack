import { Link2, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Candidate } from '@/shared/api/types'
import { formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { RobotPreview3D } from '@/widgets/robot-3d'
import type { ItemDraft } from './draft'
import { NumberField } from './NumberField'

export function ItemRow({
  item,
  error,
  candidate,
  processName,
  onChange,
  onRemove,
}: {
  item: ItemDraft
  error?: string
  candidate?: Candidate
  processName: string
  onChange: (patch: Partial<ItemDraft>) => void
  onRemove: () => void
}) {
  const [showOverrides, setShowOverrides] = useState(
    item.price_override_rub != null || item.throughput_override_per_hour != null,
  )
  const manualMissing =
    item.count_mode === 'manual' &&
    !(item.count_manual && Number.isInteger(item.count_manual) && item.count_manual >= 1)
  const sizingIssue =
    item.count_mode !== 'manual' && item.throughput_override_per_hour == null ? candidate?.estimate?.sizing_issue : null
  const message = error || (manualMissing ? 'Укажите количество в поле «Штук»: целое число не меньше 1.' : sizingIssue)
  return (
    <div
      id={`scenario-item-${item.process_key}`}
      tabIndex={-1}
      className={cn('scroll-mt-48 rounded-xl border bg-raised/40 p-4', message && 'border-warn')}
    >
      {message && (
        <p role="alert" className="mb-3 text-sm text-warn">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {item.product_id && (
          <div
            className="relative h-28 w-36 shrink-0 overflow-hidden rounded-lg bg-surface-2"
            aria-label={`3D-модель: ${item.product_name}`}
          >
            <RobotPreview3D productId={item.product_id} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{processName}</div>
          <Link
            to={`/catalog/${item.product_id}`}
            className="inline-flex items-center gap-1 font-medium hover:text-primary"
          >
            {item.product_name} <Link2 className="size-3" />
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>цена за единицу {formatRub(item.price_override_rub ?? item.price_rub)}</span>
            {item.price_override_rub != null && <WarnMark>своя цена</WarnMark>}
            {item.candidate_status === 'check' && <WarnMark>требует проверки ТТХ</WarnMark>}
            {item.count_result && (
              <span>
                в последнем расчёте: {item.count_result.final} шт. ({item.count_result.analytic} по циклу + резерв{' '}
                {item.count_result.reserve})
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Количество">
            <Select
              value={item.count_mode ?? 'auto'}
              onValueChange={(v) => onChange({ count_mode: v as ItemDraft['count_mode'] })}
            >
              <SelectTrigger
                className="w-40"
                aria-label={`Количество: ${item.product_name}`}
                aria-invalid={Boolean(message) || undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">по расчёту</SelectItem>
                <SelectItem value="manual">задать вручную</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {item.count_mode === 'manual' && (
            <Field label="Штук">
              <NumberField
                value={item.count_manual}
                onChange={(v) => onChange({ count_manual: v })}
                integer
                min={1}
                className="w-24"
                ariaLabel={`Штук: ${item.product_name}`}
                required
                invalid={manualMissing}
              />
            </Field>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowOverrides((s) => !s)}>
            {showOverrides ? 'Скрыть свои значения' : 'Своя цена / производительность'}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Убрать из сценария" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {showOverrides && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-[180px_200px_1fr]">
          <Field label="Своя цена за единицу">
            <NumberField
              value={item.price_override_rub}
              onChange={(v) => onChange({ price_override_rub: v })}
              placeholder="каталог"
              suffix="₽"
              min={0}
            />
          </Field>
          <Field label="Своя производительность">
            <NumberField
              value={item.throughput_override_per_hour}
              onChange={(v) => onChange({ throughput_override_per_hour: v })}
              placeholder="из цикла"
              ariaLabel={`Производительность: ${item.product_name}`}
              suffix="ед/ч"
              min={0}
            />
          </Field>
          <Field label="Причина (обязательна)" className="sm:col-span-2 lg:col-span-1">
            <Input
              value={item.override_reason ?? ''}
              onChange={(e) => onChange({ override_reason: e.target.value || null })}
              aria-label={`Причина: ${item.product_name}`}
              aria-invalid={
                ((item.price_override_rub != null || item.throughput_override_per_hour != null) &&
                  !item.override_reason?.trim()) ||
                undefined
              }
              placeholder="Например: КП вендора от 20.09, скидка 12 %"
            />
          </Field>
        </div>
      )}
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function WarnMark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-warn">
      <span className="size-1.5 rounded-full bg-warn" />
      {children}
    </span>
  )
}
