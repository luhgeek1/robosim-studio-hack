import { FileUp, TriangleAlert } from 'lucide-react'
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
      <DialogContent className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Загрузка параметров из файла</DialogTitle>
          <DialogDescription>
            Excel по шаблону, произвольный Excel/CSV или JSON. Ничего не меняется, пока вы не нажмёте «Применить»:
            сначала проверьте, как поля файла сопоставились с параметрами.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
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
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-input px-4 py-4 text-left hover:bg-raised/60"
          >
            {parse.isPending ? <Spinner /> : <FileUp className="size-5 text-muted-foreground" />}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{fileName ?? 'Выберите файл или перетащите его сюда'}</span>
              <span className="text-xs text-muted-foreground">
                {parse.isPending
                  ? 'Разбираем файл…'
                  : result
                    ? `${SOURCE_KIND_LABEL[result.source_kind]} · сопоставлено ${mapped.length}, не распознано ${result.unmapped.length}`
                    : 'Форматы: .xlsx, .csv, .json, до 20 МБ'}
              </span>
            </span>
            {fileName && !parse.isPending && <span className="text-xs text-primary">Выбрать другой</span>}
          </button>

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
                      <TableCell className="max-w-48 truncate text-muted-foreground" title={item.raw_value ?? ''}>
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
                    <li key={i} className="min-w-0 truncate">
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

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 max-sm:order-last">
            {mapped.length > 0 && (
              <>
                <Checkbox
                  id="import-overwrite"
                  checked={overwrite}
                  onCheckedChange={(on) => setOverwrite(on === true)}
                />
                <Label htmlFor="import-overwrite" className="font-normal">
                  Перезаписать значения, введённые вручную
                </Label>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 [&>button]:max-sm:flex-1">
            <Button variant="outline" onClick={close}>
              Отмена
            </Button>
            <Button onClick={onApply} disabled={!result || checked.size === 0 || apply.isPending}>
              {apply.isPending && <Spinner />}
              Применить{checked.size > 0 && ` (${checked.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
