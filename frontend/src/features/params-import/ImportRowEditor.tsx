import { Check, TriangleAlert } from 'lucide-react'
import type { ImportEdit, ImportReviewRow, ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'

function text(value: ImportEdit['value']) {
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return value == null ? '' : String(value)
}

const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring'

export function ImportRowEditor({
  row,
  draft,
  modified,
  params,
  disabled,
  onChange,
  onSuggestion,
}: {
  row: ImportReviewRow
  draft: ImportEdit
  modified: boolean
  params: ProjectParam[]
  disabled: boolean
  onChange: (edit: ImportEdit) => void
  onSuggestion: () => void
}) {
  const param = params.find((p) => p.key === draft.key)
  const error = row.issues.some((i) => i.severity === 'error')
  const id = `import-row-${row.row_id}`
  const options = param?.definition?.enum_values
  const current = text(draft.value)
  const conflict = row.conflict_with_current
  return (
    <article
      aria-label={`Строка ${row.row_id}: ${row.name}`}
      className={cn('space-y-3 border-b border-line py-4 last:border-b-0', draft.excluded && 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-include`}
          className="mt-0.5"
          checked={!draft.excluded}
          disabled={disabled}
          onCheckedChange={(on) => onChange({ ...draft, excluded: on !== true })}
          aria-label={`Включить строку ${row.row_id}`}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-include`} className="cursor-pointer text-sm font-semibold wrap-anywhere">
            {row.name}
          </label>
          {modified && !error && !draft.excluded && (
            <span className="ml-2 text-xs font-medium text-ok">Исправлено</span>
          )}
          <p className="mt-0.5 text-xs text-ink-3">
            {row.location}
            {draft.excluded ? ' · исключена' : ''}
          </p>
        </div>
        {error && !draft.excluded && (
          <TriangleAlert aria-label="Требует исправления" className="mt-0.5 size-4 shrink-0 text-crit" />
        )}
        {!error && !draft.excluded && <Check aria-label="Проверено" className="mt-0.5 size-4 shrink-0 text-ok" />}
      </div>
      <p className="text-xs leading-relaxed wrap-anywhere text-ink-3">
        В файле: «{row.raw_field}» = «{row.raw_value}»{row.raw_unit ? ` · единица: ${row.raw_unit}` : ''}
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_100px]">
        <label className="min-w-0 space-y-1 text-xs text-ink-2">
          <span>Параметр объекта</span>
          <select
            aria-label={`Параметр строки ${row.row_id}`}
            value={draft.key ?? ''}
            className={selectClass}
            disabled={disabled || draft.excluded}
            onChange={(e) =>
              onChange({
                ...draft,
                key: e.target.value || null,
                unit: params.find((p) => p.key === e.target.value)?.unit ?? null,
              })
            }
          >
            <option value="">Выберите параметр</option>
            {params.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 space-y-1 text-xs text-ink-2">
          <span>Значение для импорта</span>
          {options && options.length > 0 ? (
            <select
              aria-label={`Значение строки ${row.row_id}`}
              className={selectClass}
              value={current}
              disabled={disabled || draft.excluded}
              onChange={(e) => onChange({ ...draft, value: e.target.value })}
            >
              {!options.some((o) => o.value === current) && (
                <option value={current}>{current || 'Выберите значение'}</option>
              )}
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              aria-label={`Значение строки ${row.row_id}`}
              className="h-9 text-xs"
              value={current}
              disabled={disabled || draft.excluded}
              onChange={(e) => onChange({ ...draft, value: e.target.value })}
              aria-invalid={error && !draft.excluded}
              aria-describedby={error ? `${id}-issues` : undefined}
            />
          )}
        </label>
        <label className="space-y-1 text-xs text-ink-2">
          <span>Единица</span>
          <Input
            aria-label={`Единица строки ${row.row_id}`}
            className="h-9 text-xs"
            value={draft.unit ?? ''}
            disabled={disabled || draft.excluded}
            onChange={(e) => onChange({ ...draft, unit: e.target.value || null })}
            placeholder="Без единицы"
          />
        </label>
      </div>
      {!draft.excluded && row.issues.length > 0 && (
        <ul id={`${id}-issues`} className="space-y-1 text-xs leading-relaxed">
          {row.issues.map((i) => (
            <li key={i.code} className={i.severity === 'error' ? 'text-crit' : 'text-ink-2'}>
              {i.message}. <span className="text-ink-3">{i.how_to_fix}</span>
            </li>
          ))}
        </ul>
      )}
      {!draft.excluded && conflict && (
        <p className="text-xs text-ink-2">
          Сейчас в проекте: {text(conflict.current_value ?? null)} {row.unit}.{' '}
          {conflict.current_status === 'user'
            ? 'Введено вручную — сохранится, пока не разрешена перезапись.'
            : 'При импорте будет заменено.'}
        </p>
      )}
      {!draft.excluded && row.suggestion && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-2">
            {row.suggestion.message}:{' '}
            <strong>
              {text(row.suggestion.value)} {row.suggestion.unit}
            </strong>
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onSuggestion}
            aria-label={`Исправить строку ${row.row_id}`}
          >
            Исправить
          </Button>
        </div>
      )}
    </article>
  )
}
