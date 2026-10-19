import { ArrowRight, FileCheck2, FileUp, Info, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApplyImport, useImportFile, useProjectParams } from '@/entities/project'
import { ProvenanceBadge } from '@/entities/provenance'
import type { ImportResult, ProjectParam } from '@/shared/api/types'
import { formatPct, formatValue, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

const SOURCE_KIND_LABEL: Record<ImportResult['source_kind'], string> = {
  xlsx_template: 'Excel по шаблону',
  xlsx_freeform: 'Excel произвольного вида',
  csv: 'CSV',
  json: 'JSON',
  text_llm: 'Текст (ассистент)',
  pdf_llm: 'PDF (ассистент)',
}

const ACCEPT = '.xlsx,.csv,.json'

type Value = ProjectParam['value']

function valueText(value: Value | undefined, unit: string | null | undefined, param?: ProjectParam): string {
  if (typeof value === 'string' && param?.definition?.type === 'enum') {
    const label = param.definition.enum_values?.find((o) => o.value === value)?.label
    if (label) return label
  }
  return formatValue(value ?? null, unit)
}

export function ImportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const parse = useImportFile(projectId)
  const apply = useApplyImport(projectId)
  const params = useProjectParams(projectId)

  const byKey = useMemo(() => new Map((params.data?.params ?? []).map((p) => [p.key, p])), [params.data])

  const resetState = () => {
    setFileName(null)
    setResult(null)
    setChecked(new Set())
    setOverwrite(false)
    parse.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  const close = () => {
    resetState()
    onOpenChange(false)
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    parse.mutate(file, {
      onSuccess: (data) => {
        setResult(data)
        setChecked(new Set(data.mapped.map((m) => m.key)))
      },
    })
  }

  const toggle = (key: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const onApply = () => {
    if (!result || checked.size === 0) return
    const count = checked.size
    apply.mutate(
      { importId: result.import_id, body: { accept_keys: [...checked], overwrite_user_values: overwrite } },
      {
        onSuccess: () => {
          toast.success(`Импорт применён: ${count} ${pluralRu(count, ['параметр', 'параметра', 'параметров'])}`)
          close()
        },
      },
    )
  }

  const mapped = result?.mapped ?? []
  const allChecked = mapped.length > 0 && checked.size === mapped.length

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        className={cn(
          'max-h-[min(90dvh,760px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[20px] p-0 shadow-float',
          mapped.length > 0 ? 'sm:max-w-[896px]' : 'sm:max-w-[520px]',
        )}
      >
        <DialogHeader className="gap-1.5 px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
          <span className="mb-1 text-[10px] font-medium tracking-[0.12em] text-ink-3 uppercase">Импорт данных</span>
          <DialogTitle className="pr-5 text-xl leading-tight font-semibold tracking-[-0.02em]">
            {result ? 'Проверка параметров' : 'Загрузка параметров'}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {result
              ? 'Проверьте сопоставление полей и выберите значения для импорта.'
              : 'Добавьте Excel, CSV или JSON с данными вашего объекта.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            aria-label={fileName ? 'Выбрать другой файл' : 'Выбрать файл для загрузки'}
            aria-busy={parse.isPending}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              onFile(event.dataTransfer.files?.[0])
            }}
            className={cn(
              'group/upload flex w-full cursor-pointer items-center rounded-2xl border border-dashed border-input bg-surface-2/70 transition-colors hover:border-signal/50 hover:bg-signal/3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
              fileName ? 'gap-3 px-4 py-3.5 text-left' : 'min-h-52 flex-col justify-center px-5 py-6 text-center',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex shrink-0 items-center justify-center rounded-xl bg-signal-soft text-signal',
                fileName ? 'size-10' : 'mb-4 size-12',
              )}
            >
              {parse.isPending ? (
                <Spinner className="size-5" />
              ) : result ? (
                <FileCheck2 className="size-5" />
              ) : (
                <FileUp className="size-6" />
              )}
            </span>
            {fileName ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0 wrap-anywhere lg:truncate text-[13px] font-medium" title={fileName}>
                    {fileName}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">
                    {parse.isPending
                      ? 'Разбираем файл…'
                      : result
                        ? `${SOURCE_KIND_LABEL[result.source_kind]} · сопоставлено ${mapped.length}, не распознано ${result.unmapped.length}`
                        : 'Выберите файл, чтобы повторить загрузку'}
                  </span>
                </span>
                {!parse.isPending && (
                  <span className="shrink-0 text-xs font-medium text-signal max-sm:sr-only">Заменить</span>
                )}
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
                  Выберите файл
                  <ArrowRight className="size-3.5 text-signal transition-transform group-hover/upload:translate-x-0.5" />
                </span>
                <span className="mt-1 text-[12px] text-ink-3">или перетащите его сюда</span>
                <span className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  {['XLSX', 'CSV', 'JSON'].map((format) => (
                    <span
                      key={format}
                      className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-3"
                    >
                      {format}
                    </span>
                  ))}
                  <span className="ml-1 text-[11px] text-ink-3">до 20 МБ</span>
                </span>
              </>
            )}
          </button>

          {!result && (
            <p className="flex items-start gap-2 px-1 text-[12px] leading-relaxed text-ink-3">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-4" aria-hidden />
              После загрузки проверьте значения и нажмите «Применить».
            </p>
          )}

          {result && result.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-l-2 border-l-warn bg-raised p-3 text-xs">
              {result.warnings.map((warning, i) => (
                <li key={i} className="flex gap-1.5">
                  <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" />
                  {warning}
                </li>
              ))}
            </ul>
          )}

          {result && mapped.length === 0 && (
            <div className="rounded-md border bg-raised/40 p-4 text-muted-foreground">
              В файле не нашлось значений, которые можно сопоставить с параметрами объекта. Заполните колонку значений в
              шаблоне Excel или проверьте названия полей.
            </div>
          )}

          {mapped.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allChecked ? true : checked.size > 0 ? 'indeterminate' : false}
                      onCheckedChange={(on) => setChecked(on ? new Set(mapped.map((m) => m.key)) : new Set())}
                      aria-label="Выбрать все"
                    />
                  </TableHead>
                  <TableHead>Параметр</TableHead>
                  <TableHead>В файле</TableHead>
                  <TableHead className="text-right">Новое значение</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Уверенность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapped.map((item) => {
                  const param = byKey.get(item.key)
                  const conflict = item.conflict_with_current
                  const userValue = conflict?.current_status === 'user'
                  return (
                    <TableRow key={item.key} className={cn(!checked.has(item.key) && 'opacity-55')}>
                      <TableCell>
                        <Checkbox
                          checked={checked.has(item.key)}
                          onCheckedChange={(on) => toggle(item.key, on === true)}
                          aria-label={`Применить «${item.name}»`}
                        />
                      </TableCell>
                      <TableCell className="max-w-72 min-w-44 whitespace-normal">
                        <div className="font-medium">{item.name}</div>
                        {item.raw_field && item.raw_field !== item.name && (
                          <div className="text-xs text-muted-foreground">поле «{item.raw_field}»</div>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-48 min-w-0 wrap-anywhere lg:truncate text-muted-foreground"
                        title={item.raw_value ?? ''}
                      >
                        {item.raw_value ?? '—'}
                      </TableCell>
                      <TableCell className="num text-right">
                        <div className="font-medium">{valueText(item.value, item.unit, param)}</div>
                        {conflict && (
                          <div className={cn('text-xs', userValue ? 'text-warn' : 'text-muted-foreground')}>
                            сейчас: {valueText(conflict.current_value, item.unit, param)}
                            {userValue && ' (введено вручную)'}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ProvenanceBadge status={item.status} />
                      </TableCell>
                      <TableCell
                        className={cn('num text-right', item.confidence < 0.7 && 'text-warn')}
                        title="Насколько уверенно поле файла сопоставлено с параметром"
                      >
                        {formatPct(item.confidence, { share: true, digits: 0 })}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {result && result.unmapped.length > 0 && (
            <div className="space-y-2">
              <div className="font-medium">
                Не распознано <span className="num text-muted-foreground">({result.unmapped.length})</span>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {result.unmapped.map((item, i) => {
                  const suggestion = item.suggestion_key ? byKey.get(item.suggestion_key) : undefined
                  return (
                    <li key={i} className="min-w-0 wrap-anywhere lg:truncate">
                      <span className="text-foreground">{item.raw_field ?? '—'}</span>
                      {item.raw_value && <span className="text-muted-foreground">: {item.raw_value}</span>}
                      {item.suggestion_key && (
                        <span className="text-muted-foreground">
                          {' '}
                          · возможно, «{suggestion?.name ?? item.suggestion_key}»
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Эти поля не будут применены. Их можно ввести вручную на странице объекта.
              </p>
            </div>
          )}
        </div>

        <DialogFooter
          className={cn(
            'mx-0 mb-0 flex-col gap-4 rounded-none bg-surface-2 px-5 py-4 sm:items-center sm:px-6',
            mapped.length > 0 ? 'sm:justify-between' : 'sm:justify-end',
          )}
        >
          {mapped.length > 0 && (
            <div className="flex min-w-0 items-start gap-2">
              <Checkbox
                id="import-overwrite"
                checked={overwrite}
                onCheckedChange={(on) => setOverwrite(on === true)}
                className="mt-0.5"
              />
              <Label htmlFor="import-overwrite" className="text-[12px] leading-relaxed font-normal text-ink-2">
                Перезаписать значения, введённые вручную
              </Label>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2 [&>button]:max-sm:flex-1">
            <Button variant="outline" className="h-9 px-4" onClick={close}>
              Отмена
            </Button>
            <Button className="h-9 px-4" onClick={onApply} disabled={!result || checked.size === 0 || apply.isPending}>
              {apply.isPending && <Spinner />}
              Применить{checked.size > 0 && ` (${checked.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
