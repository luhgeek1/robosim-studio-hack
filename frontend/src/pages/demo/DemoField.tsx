import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export function DemoField({
  id,
  label,
  value,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: number
  hint?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          key={value}
          type="number"
          min={50}
          max={200}
          step={5}
          defaultValue={Math.round(value * 100)}
          className="pr-8"
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
      <p className="meta">{hint ?? '100% — как в примере. Можно изменить от 50 до 200%.'}</p>
    </div>
  )
}
