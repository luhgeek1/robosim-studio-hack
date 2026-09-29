import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateSource } from '@/entities/admin'
import { SOURCE_KIND_LABEL } from '@/entities/provenance/labels'
import type { RegistrySource, SourceUpdate } from '@/shared/api/types'
import { formatNumber } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Spinner } from '@/shared/ui/states'
import { Textarea } from '@/shared/ui/textarea'
import { Field } from './fields'
import { today } from './sourceDraft'

export function SourceDialog({ target, onClose }: { target: RegistrySource | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        {target && <SourceForm key={target.id} source={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function SourceForm({ source, onDone }: { source: RegistrySource; onDone: () => void }) {
  const update = useUpdateSource()
  const [title, setTitle] = useState(source.title)
  const [url, setUrl] = useState(source.url ?? '')
  const [date, setDate] = useState(source.retrieved_at ?? '')
  const [note, setNote] = useState(source.note ?? '')
  const badUrl = url.trim() !== '' && !/^https?:\/\//.test(url.trim())

  // Отправляем только изменённые поля: правка — событие журнала «было → стало».
  const body: SourceUpdate = {}
  if (title.trim() !== source.title) body.title = title.trim()
  if ((url.trim() || null) !== (source.url ?? null)) body.url = url.trim() || null
  if ((date || null) !== (source.retrieved_at ?? null)) body.retrieved_at = date || null
  if ((note.trim() || null) !== (source.note ?? null)) body.note = note.trim() || null
  const dirty = Object.keys(body).length > 0

  const submit = () =>
    update.mutate(
      { id: source.id, body },
      {
        onSuccess: (saved) => {
          toast.success('Источник исправлен', {
            description:
              saved.freshness === 'stale'
                ? 'Дата получения старше порога — источник остаётся в списке устаревших.'
                : 'Карточки каталога, нормативы и отчёты покажут новое описание. Расчёты не меняются.',
          })
          onDone()
        },
      },
    )

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4">
        <DialogTitle className="text-[18px]">Источник данных</DialogTitle>
        <DialogDescription>
          {SOURCE_KIND_LABEL[source.kind]} · на него ссылаются{' '}
          <span className="num">{formatNumber(source.usage.total)}</span> значений. Описание источника не входит в
          формулы, поэтому правка не меняет версии данных и расчёты.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 px-6 pb-5">
        <Field label="Название" error={title.trim() ? null : 'Название не может быть пустым'}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-[10px]" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
          <Field label="Ссылка" error={badUrl ? 'Ссылка начинается с http:// или https://' : null}>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="h-9 rounded-[10px]"
            />
          </Field>
          <Field label="Дата получения">
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-[10px]"
            />
          </Field>
        </div>
        <Field label="Примечание">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: цена с НДС, без доставки и ПНР"
            className="min-h-16 rounded-[10px]"
          />
        </Field>
      </div>
      <DialogFooter className="m-0 rounded-none border-line bg-surface-2 px-6 py-4">
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
        <Button onClick={submit} disabled={!dirty || !title.trim() || badUrl || update.isPending}>
          {update.isPending && <Spinner />} Сохранить
        </Button>
      </DialogFooter>
    </>
  )
}
