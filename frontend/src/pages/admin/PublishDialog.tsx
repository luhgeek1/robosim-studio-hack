import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { usePublishNormSet } from '@/entities/admin'
import type { Norm } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Spinner } from '@/shared/ui/states'
import { Textarea } from '@/shared/ui/textarea'
import type { Draft } from './NormsTab'

export function PublishDialog({
  open,
  onOpenChange,
  changes,
  draft,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  changes: Norm[]
  draft: Draft
  onPublished: () => void
}) {
  const publish = usePublishNormSet()
  const [notes, setNotes] = useState('')
  const [rationale, setRationale] = useState<Record<string, string>>({})
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')

  const submit = () => {
    const source = sourceTitle.trim()
      ? {
          kind: sourceUrl.trim() ? ('open_source' as const) : ('team_assumption' as const),
          title: sourceTitle.trim(),
          url: sourceUrl.trim() || null,
          retrieved_at: new Date().toISOString().slice(0, 10),
        }
      : undefined
    publish.mutate(
      {
        notes: notes.trim(),
        changes: changes.map((norm) => ({
          key: norm.key,
          value: draft[norm.key],
          unit: norm.unit,
          ...(source ? { source } : {}),
          ...(rationale[norm.key]?.trim() ? { rationale: rationale[norm.key].trim() } : {}),
        })),
      },
      {
        onSuccess: (set) => {
          toast.success(`Опубликована версия ${set.version}`, {
            description: 'Сохранённые расчёты помечены устаревшими и пересчитаются на новых нормативах.',
          })
          setNotes('')
          setRationale({})
          setSourceTitle('')
          setSourceUrl('')
          onPublished()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px]">Новая версия нормативов</DialogTitle>
          <DialogDescription>
            Текущая версия останется в архиве: расчёты на ней воспроизводятся как были. Новые расчёты возьмут новую.
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-thin max-h-[52vh] space-y-5 overflow-y-auto px-6 pb-5">
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {changes.map((norm) => (
              <li key={norm.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13.5px] font-medium">{norm.name}</span>
                  <span className="num flex shrink-0 items-center gap-1.5 text-[13px]">
                    <span className="text-ink-3 line-through">{formatValue(norm.value, norm.unit)}</span>
                    <ArrowRight size={12} className="text-ink-4" />
                    <span className="font-semibold">{formatValue(draft[norm.key], norm.unit)}</span>
                  </span>
                </div>
                <Input
                  value={rationale[norm.key] ?? ''}
                  onChange={(e) => setRationale((prev) => ({ ...prev, [norm.key]: e.target.value }))}
                  placeholder="Обоснование: почему такое значение"
                  className="mt-2 h-8 rounded-[9px] text-[13px]"
                />
              </li>
            ))}
          </ul>

          <label className="block">
            <span className="text-[13px] font-medium">Что изменилось</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: ставка дисконтирования по ключевой ставке ЦБ 17 %"
              className="mt-1.5 min-h-20 rounded-[10px]"
            />
          </label>

          <div>
            <span className="text-[13px] font-medium">Источник новых значений</span>
            <p className="meta">Без источника у значений останется прежний — лучше указать, откуда число (ТЗ 3.5.1).</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="Название: «Банк России, ключевая ставка»"
                className="h-9 rounded-[10px]"
              />
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="Ссылка https://…"
                className="h-9 rounded-[10px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 rounded-none border-line bg-surface-2 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!notes.trim() || publish.isPending}>
            {publish.isPending && <Spinner />} Опубликовать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
