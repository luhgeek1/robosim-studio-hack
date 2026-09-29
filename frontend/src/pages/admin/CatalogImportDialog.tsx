import { motion } from 'framer-motion'
import { ArrowRight, FileUp, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApplyCatalogImport, usePreviewCatalogImport, useSolutionTypes } from '@/entities/admin'
import type { CatalogImportItem, CatalogImportResult } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Spinner } from '@/shared/ui/states'
import { Textarea } from '@/shared/ui/textarea'
import { KpiNumber } from '@/shared/ui/v0'
import { stagger } from './motion'

const ACCEPT = '.csv,text/csv'
const SHOWN_ITEMS = 60

const value = (v: string | number | null | undefined) => (typeof v === 'number' ? formatNumber(v) : (v ?? '—'))

export function CatalogImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const preview = usePreviewCatalogImport()
  const apply = useApplyCatalogImport()
  const result = preview.data

  const close = () => {
    setFile(null)
    setNotes('')
    preview.reset()
    onOpenChange(false)
  }
  const onFile = (next?: File) => {
    if (!next) return
    setFile(next)
    preview.mutate({ file: next })
  }
  const onApply = () => {
    if (!file) return
    apply.mutate(
      { file, notes: notes.trim() || undefined },
      {
        onSuccess: (done) => {
          toast.success(`Каталог обновлён — версия ${done.catalog_version}`, {
            description: `Новых ${done.created}, изменено ${done.updated}. Сохранённые расчёты помечены устаревшими.`,
          })
          close()
        },
      },
    )
  }
  const changes = result ? result.created + result.updated : 0

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px]">Обновить каталог из файла</DialogTitle>
          <DialogDescription>
            Таблица решений организатора в формате catalog_export_v4.csv. Сначала покажем, что изменится; карточки,
            которые вы правили или скрыли, файл не перезапишет.
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-thin min-h-0 space-y-4 overflow-y-auto px-6 pb-5">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              onFile(event.dataTransfer.files?.[0])
            }}
            className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-line-2 px-4 py-4 text-left transition-colors hover:bg-surface-2"
          >
            {preview.isPending ? <Spinner /> : <FileUp className="size-5 text-ink-3" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">
                {file?.name ?? 'Выберите файл или перетащите его сюда'}
              </span>
              <span className="text-[12px] text-ink-3">
                {preview.isPending
                  ? 'Сравниваем с каталогом…'
                  : 'CSV с разделителем «;», UTF-8 или Windows-1251, до 20 МБ'}
              </span>
            </span>
            {file && !preview.isPending && <span className="text-[12px] text-info">Выбрать другой</span>}
          </button>

          {result && <Preview result={result} />}

          {result && changes > 0 && (
            <label className="block">
              <span className="text-[13px] font-medium">Комментарий к обновлению</span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: выгрузка организатора от 28.09"
                className="mt-1.5 min-h-16 rounded-[10px]"
              />
            </label>
          )}
        </div>

        <DialogFooter className="m-0 items-center rounded-none border-t border-line bg-surface-2 px-6 py-4">
          {result && changes === 0 && (
            <span className="meta mr-auto">Применять нечего: каталог уже совпадает с файлом.</span>
          )}
          <Button variant="ghost" onClick={close}>
            Отмена
          </Button>
          <Button onClick={onApply} disabled={!result || changes === 0 || apply.isPending}>
            {apply.isPending && <Spinner />} Применить {changes > 0 && `(${formatNumber(changes)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Preview({ result }: { result: CatalogImportResult }) {
  const types = useSolutionTypes()
  const typeName = (key?: string | null) => types.data?.find((t) => t.key === key)?.name ?? key ?? '—'
  const counts = [
    { label: 'новых', value: result.created, main: true },
    { label: 'изменится', value: result.updated, main: true },
    { label: 'без изменений', value: result.unchanged },
    { label: pluralRu(result.conflicts, ['конфликт', 'конфликта', 'конфликтов']), value: result.conflicts },
  ]
  return (
    <div className="space-y-3">
      <div className="card grid grid-cols-4 divide-x divide-line">
        {counts.map((count, i) => (
          <motion.div
            key={count.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(i)}
            className="px-4 py-3"
          >
            <KpiNumber
              value={count.value}
              className={cn(
                'display text-[30px] leading-none',
                count.main && count.value > 0 ? 'text-ink' : 'text-ink-3',
              )}
            />
            <span className="meta mt-1 block">{count.label}</span>
          </motion.div>
        ))}
      </div>
      <p className="meta">
        Новых предложений (строк цен) — {formatNumber(result.offers_created)}. Строк без id пропущено —{' '}
        {formatNumber(result.skipped)}. В каталоге, но не в файле — {formatNumber(result.not_in_file)} (не скрываются).
      </p>
      {result.errors.length > 0 && (
        <ul className="space-y-1 rounded-[10px] border border-l-2 border-line border-l-warn bg-surface-2 p-3 text-[12.5px]">
          {result.errors.map((error) => (
            <li key={`${error.row}-${error.message}`} className="flex gap-1.5">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" />
              <span>
                <span className="num text-ink-3">стр. {error.row}:</span> {error.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.items.length > 0 && (
        <ul className="divide-y divide-line rounded-[12px] border border-line">
          {result.items.slice(0, SHOWN_ITEMS).map((item, i) => (
            <ItemRow key={item.product_id} item={item} index={i} typeName={typeName} />
          ))}
          {result.items.length > SHOWN_ITEMS && (
            <li className="meta px-4 py-2.5">и ещё {formatNumber(result.items.length - SHOWN_ITEMS)}</li>
          )}
        </ul>
      )}
    </div>
  )
}

const ACTION_LABEL: Record<CatalogImportItem['action'], string> = {
  created: 'новый',
  updated: 'изменится',
  unchanged: 'без изменений',
  conflict: 'не тронем',
}

function ItemRow({
  item,
  index,
  typeName,
}: {
  item: CatalogImportItem
  index: number
  typeName: (key?: string | null) => string
}) {
  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={stagger(index)}
      className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-4 py-2.5"
    >
      <span
        className={cn(
          'text-[12px] font-medium',
          item.action === 'conflict' ? 'text-warn' : item.action === 'created' ? 'text-ok' : 'text-ink-2',
        )}
      >
        {ACTION_LABEL[item.action]}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{item.name}</span>
        {item.action === 'conflict' && <span className="text-[12px] text-ink-3">{item.reason}</span>}
        {item.action === 'created' && (
          <span className="text-[12px] text-ink-3">
            {typeName(item.solution_type)} · процессы и типы объектов назначьте в карточке
          </span>
        )}
        {item.changes.map((change) => (
          <span key={change.field} className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            {change.label}
            {(change.before != null || change.after != null) && (
              <span className="num inline-flex items-center gap-1 text-ink-2">
                {value(change.before)} <ArrowRight size={11} className="text-ink-4" /> {value(change.after)}
              </span>
            )}
          </span>
        ))}
      </span>
    </motion.li>
  )
}
