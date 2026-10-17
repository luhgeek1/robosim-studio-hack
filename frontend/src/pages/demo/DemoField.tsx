import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export function DemoField({
  id,
  label,
  value,
  hint,
  onChange,
  compact = false,
}: {
  id: string
  label: string
  value: number
  hint?: string
  onChange: (value: number) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-2'}>
      <Label htmlFor={id} className={compact ? 'text-[12px] font-normal text-ink-3' : undefined}>
        {label}
      </Label>
      <div className={compact ? 'relative w-20' : 'relative'}>
        <Input
          id={id}
          key={value}
          type="number"
          min={50}
          max={200}
          step={5}
          defaultValue={Math.round(value * 100)}
          title={hint ?? '100% — как в примере. Допустимо от 50 до 200%.'}
          className={
            compact
              ? 'num pr-6 text-[13px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
              : 'pr-8'
          }
          onBlur={(e) => {
            const raw = Number(e.currentTarget.value)
            const next = e.currentTarget.value && Number.isFinite(raw) ? Math.min(200, Math.max(50, raw)) : value * 100
            e.currentTarget.value = String(Math.round(next))
            onChange(next / 100)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-ink-3">
          %
        </span>
      </div>
      {!compact && <p className="meta">{hint ?? '100% — как в примере. Можно изменить от 50 до 200%.'}</p>}
    </div>
  )
}
