import { SOURCE_KIND_LABEL } from '@/entities/provenance/labels'
import type { SourceKind } from '@/shared/api/types'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Field } from './fields'
import { today, type SourceDraft } from './sourceDraft'

// Виды источника, которые админ указывает сам; «ввод пользователя», ассистент и имитация появляются только из системы.
const ADMIN_KINDS: SourceKind[] = [
  'open_source',
  'vendor_site',
  'regulation',
  'organizer_dataset',
  'fcbas_scenario',
  'team_assumption',
]

export function SourceFields({ value, onChange }: { value: SourceDraft; onChange: (next: SourceDraft) => void }) {
  return (
    <div className="space-y-2.5">
      <div>
        <span className="text-[13px] font-medium">Источник значения</span>
        <p className="meta">Ссылка и дата получения хранятся рядом со значением (ТЗ 3.3.4).</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Вид">
          <Select value={value.kind} onValueChange={(kind) => onChange({ ...value, kind: kind as SourceKind })}>
            <SelectTrigger className="h-9 w-full rounded-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {SOURCE_KIND_LABEL[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Название">
          <Input
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="Росстат, «Средняя зарплата по профессиям», 2026"
            className="h-9 rounded-[10px]"
          />
        </Field>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_150px]">
        <Field label="Ссылка">
          <Input
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            placeholder="https://…"
            className="h-9 rounded-[10px]"
          />
        </Field>
        <Field label="Дата получения">
          <Input
            type="date"
            value={value.date}
            max={today()}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            className="h-9 rounded-[10px]"
          />
        </Field>
      </div>
    </div>
  )
}
