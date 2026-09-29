import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSetDefault } from '@/entities/admin'
import type { AdminParameterDefault, ParameterDefaultWrite } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Spinner } from '@/shared/ui/states'
import { Textarea } from '@/shared/ui/textarea'
import { Segmented } from '@/shared/ui/v0'
import { defaultText } from './defaultText'
import { Field } from './fields'
import { parseNumber } from './parse'
import { SourceFields } from './SourceFields'
import { emptySource, toSourceWrite, type SourceDraft } from './sourceDraft'

type Status = 'default' | 'assumption'
const NUMERIC = new Set(['number', 'integer'])

function initialText(item: AdminParameterDefault): string {
  const value = item.default?.value
  if (value === null || value === undefined) return ''
  return typeof value === 'number' ? String(value).replace('.', ',') : String(value)
}

// Проверка до отправки повторяет серверную: тип, список, диапазон параметра. Сервер всё равно проверит сам.
function parse(item: AdminParameterDefault, text: string): { value?: ParameterDefaultWrite['value']; error?: string } {
  if (item.type === 'boolean') return text === '' ? { error: 'Выберите «да» или «нет»' } : { value: text === 'true' }
  if (!NUMERIC.has(item.type)) return text.trim() ? { value: text.trim() } : { error: 'Введите значение' }
  const number = parseNumber(text)
  if (number === null) return { error: 'Введите число' }
  if (item.type === 'integer' && !Number.isInteger(number)) return { error: 'Нужно целое число' }
  if ((item.min != null && number < item.min) || (item.max != null && number > item.max))
    return {
      error: `Вне допустимого диапазона ${item.min != null ? formatNumber(item.min) : '…'} – ${
        item.max != null ? formatNumber(item.max) : '…'
      }`,
    }
  return { value: number }
}

export function DefaultDialog({ target, onClose }: { target: AdminParameterDefault | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        {target && <DefaultForm key={`${target.object_type}.${target.key}`} item={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function DefaultForm({ item, onDone }: { item: AdminParameterDefault; onDone: () => void }) {
  const save = useSetDefault()
  const current = item.default?.provenance.status
  const [text, setText] = useState(initialText(item))
  const [status, setStatus] = useState<Status>(current === 'default' ? 'default' : 'assumption')
  const [source, setSource] = useState<SourceDraft>(emptySource)
  const [rationale, setRationale] = useState('')
  const parsed = parse(item, text)
  const ready = parsed.value !== undefined && source.title.trim() && rationale.trim()

  const submit = () => {
    if (parsed.value === undefined) return
    save.mutate(
      {
        objectType: item.object_type,
        key: item.key,
        body: {
          value: parsed.value,
          unit: item.unit ?? null,
          status,
          source: toSourceWrite(source),
          rationale: rationale.trim(),
        },
      },
      {
        onSuccess: ({ projects_restamped: n }) => {
          toast.success(`«${item.name}»: новое значение по умолчанию`, {
            description: n
              ? `${formatNumber(n)} ${pluralRu(n, ['проект получил', 'проекта получили', 'проектов получили'])} новую версию — их расчёты устарели и пересчитаются с диффом.`
              : 'Действующие значения в проектах не изменились — расчёты остаются актуальными.',
          })
          onDone()
        },
      },
    )
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4">
        <DialogTitle className="text-[18px]">{item.name}</DialogTitle>
        <DialogDescription>
          Значение по умолчанию подставляется в проекты, где пользователь не ввёл своё.{' '}
          {item.projects_using_default > 0 &&
            `Сейчас на него опираются ${formatNumber(item.projects_using_default)} ${pluralRu(item.projects_using_default, ['проект', 'проекта', 'проектов'])}.`}
        </DialogDescription>
      </DialogHeader>

      <div className="scroll-thin max-h-[56vh] space-y-5 overflow-y-auto px-6 pb-5">
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field
            label={item.unit ? `Новое значение, ${item.unit}` : 'Новое значение'}
            error={text ? parsed.error : null}
          >
            <ValueInput item={item} text={text} onChange={setText} />
          </Field>
          <Field label="Статус">
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'default', label: 'Из источника', hint: 'Значение взято из документа или датасета' },
                { value: 'assumption', label: 'Допущение', hint: 'Допущение с обоснованием' },
              ]}
            />
          </Field>
        </div>
        {item.default && (
          <p className="num flex items-center gap-1.5 text-[13px]">
            <span className="text-ink-3 line-through">{defaultText(item)}</span>
            <ArrowRight size={12} className="text-ink-4" />
            <span className="font-semibold">{parsed.value !== undefined ? defaultText(item, parsed.value) : '…'}</span>
          </p>
        )}
        <Field label="Обоснование" hint="Почему такое значение — видно в карточке параметра и в истории">
          <Textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Например: медиана зарплат водителей погрузчиков в Москве, 2026"
            className="min-h-20 rounded-[10px]"
          />
        </Field>
        <SourceFields value={source} onChange={setSource} />
      </div>

      <DialogFooter className="m-0 rounded-none border-line bg-surface-2 px-6 py-4">
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
        <Button onClick={submit} disabled={!ready || save.isPending}>
          {save.isPending && <Spinner />} Сохранить
        </Button>
      </DialogFooter>
    </>
  )
}

function ValueInput({
  item,
  text,
  onChange,
}: {
  item: AdminParameterDefault
  text: string
  onChange: (text: string) => void
}) {
  if (item.type === 'boolean')
    return (
      <Segmented
        size="sm"
        value={text}
        onChange={onChange}
        options={[
          { value: 'true', label: 'Да' },
          { value: 'false', label: 'Нет' },
        ]}
      />
    )
  if (item.type === 'enum')
    return (
      <Select value={text} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full rounded-[10px]">
          <SelectValue placeholder="Выберите значение" />
        </SelectTrigger>
        <SelectContent>
          {(item.enum_values ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value ?? ''}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  return (
    <Input
      value={text}
      inputMode={NUMERIC.has(item.type) ? 'decimal' : undefined}
      onChange={(e) => onChange(e.target.value)}
      placeholder={item.example ?? undefined}
      className="num h-9 rounded-[10px]"
    />
  )
}
