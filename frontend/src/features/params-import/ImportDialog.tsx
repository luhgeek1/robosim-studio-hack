import { Download, FileCheck2, FileUp, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useProjectParams } from '@/entities/project'
import { useSession } from '@/entities/session'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Spinner } from '@/shared/ui/states'
import { ImportRowEditor } from './ImportRowEditor'
import { useImportReview } from './use-import-review'

export function ImportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useSession()
  const maxMb = user?.role === 'guest' ? 5 : 20
  const params = useProjectParams(projectId)
  const inputRef = useRef<HTMLInputElement>(null)
  const state = useImportReview(projectId)
  const [problemsOnly, setProblemsOnly] = useState(false)
  const { result, drafts, busy } = state
  const selected = drafts.filter((row) => !row.excluded)
  const includedIds = new Set(selected.map((row) => row.row_id))
  const errors =
    result?.rows.filter((row) => includedIds.has(row.row_id) && row.issues.some((i) => i.severity === 'error'))
      .length ?? 0
  const relations = result?.validation.issues.filter((i) => i.code.startsWith('CHECK_')) ?? []
  const relationErrors = relations.some((i) => i.severity === 'error')
  const criticalRelations = relations.filter((i) => i.severity === 'error')
  const relationNotes = relations.filter((i) => i.severity !== 'error')
  const missing = result?.validation.issues.filter((i) => i.code === 'REQUIRED_MISSING').length ?? 0
  const suggestions = result?.rows.filter((row) => includedIds.has(row.row_id) && row.suggestion).length ?? 0
  const visibleRows =
    result?.rows.filter(
      (row) =>
        !problemsOnly ||
        state.editedIds.has(row.row_id) ||
        row.issues.some((i) => i.severity !== 'info') ||
        row.conflict_with_current,
    ) ?? []
  const error = state.parse.error || state.review.error || state.apply.error
  const canApply = !!result && selected.length > 0 && errors === 0 && !relationErrors && !state.dirty && !busy
  const close = () => {
    if (busy) return
    state.reset()
    setProblemsOnly(false)
    onOpenChange(false)
  }
  const onApply = () => {
    if (!result || !canApply) return
    state.apply.mutate(
      {
        importId: result.import_id,
        body: { row_ids: selected.map((r) => r.row_id), overwrite_user_values: state.overwrite },
      },
      {
        onSuccess: () => {
          toast.success('Импорт применён. Выбранные параметры проверены и сохранены.')
          state.reset()
          setProblemsOnly(false)
          onOpenChange(false)
        },
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[20px] p-0 shadow-float sm:max-w-[920px]">
        <DialogHeader className="px-5 pt-5 pb-4 sm:px-6">
          <DialogTitle className="pr-6 text-xl tracking-[-0.02em]">
            {result ? 'Проверка параметров' : 'Загрузка параметров'}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {result
              ? 'Исправьте найденные проблемы или исключите строки. Проект изменится после нажатия «Применить».'
              : `Excel, CSV или JSON с параметрами объекта, до ${maxMb} МБ. Можно загрузить JSON, ранее экспортированный из проекта.`}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-4 sm:px-6">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,.json"
            className="hidden"
            onChange={(event) => {
              state.onFile(event.target.files?.[0], maxMb)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy}
            aria-label={state.fileName ? 'Выбрать другой файл' : 'Выбрать файл для загрузки'}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              state.onFile(e.dataTransfer.files?.[0], maxMb)
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-input bg-surface-2 px-4 py-5 text-left transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait"
          >
            {state.parse.isPending ? (
              <Spinner />
            ) : result ? (
              <FileCheck2 className="size-5 shrink-0 text-ok" />
            ) : (
              <FileUp className="size-5 shrink-0 text-ink-2" />
            )}
            <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
              {state.fileName ?? 'Выберите файл или перетащите его сюда'}
              <span className="mt-1 block text-xs font-normal text-ink-3">
                {state.parse.isPending
                  ? 'Проверяем структуру, значения и единицы…'
                  : state.fileName
                    ? 'Нажмите, чтобы выбрать другой файл'
                    : 'XLSX · CSV · JSON'}
              </span>
            </span>
          </button>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-crit/30 bg-crit-soft/40 p-3 text-sm leading-relaxed text-crit"
            >
              {problemText(error)}
            </div>
          )}
          {!result && !state.parse.isPending && (
            <div className="space-y-2 text-xs leading-relaxed text-ink-2">
              <p>Попробуйте учебные файлы с намеренными ошибками:</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <a
                  className="underline underline-offset-4 hover:text-signal"
                  href="/import-examples/warehouse-repairs.json"
                  download
                >
                  Склад: исправления
                </a>
                <a
                  className="underline underline-offset-4 hover:text-signal"
                  href="/import-examples/warehouse-duplicates.json"
                  download
                >
                  Склад: повторы и ошибки
                </a>
                <a
                  className="underline underline-offset-4 hover:text-signal"
                  href="/import-examples/hospital-repairs.json"
                  download
                >
                  Больница: исправления
                </a>
              </div>
              <p className="text-ink-3">Открывайте файл в проекте соответствующего типа. Данные учебные.</p>
            </div>
          )}
          {result && (
            <>
              <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span>
                  Строк: <strong>{result.rows.length}</strong>
                </span>
                <span className={errors ? 'text-crit' : 'text-ok'}>
                  С ошибками: <strong>{errors}</strong>
                </span>
                <span className="text-ink-3">Исключено: {drafts.length - selected.length}</span>
                {state.dirty && <span className="text-ink-2">Есть непроверенные изменения</span>}
              </div>
              {result.warnings.length > 0 && (
                <details
                  open={result.warnings.some((warning) => warning.includes('восстановлен'))}
                  className="text-xs leading-relaxed text-ink-2"
                >
                  <summary className="cursor-pointer">Примечания к файлу ({result.warnings.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {result.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}
              {criticalRelations.length > 0 && (
                <div className="space-y-2 rounded-lg border border-input bg-surface-2 p-3 text-xs leading-relaxed">
                  <p className="flex items-center gap-2 font-semibold">
                    <TriangleAlert className="size-4" />
                    Связи между параметрами
                  </p>
                  {criticalRelations.map((i) => (
                    <p key={i.code} className={i.severity === 'error' ? 'text-crit' : 'text-ink-2'}>
                      {i.message}. {i.how_to_fix}
                    </p>
                  ))}
                </div>
              )}
              {relationNotes.length > 0 && (
                <details className="text-xs leading-relaxed text-ink-2">
                  <summary className="cursor-pointer">Замечания к связям параметров ({relationNotes.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {relationNotes.map((i) => (
                      <li key={i.code}>
                        {i.message}. {i.how_to_fix}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={problemsOnly} onCheckedChange={(on) => setProblemsOnly(on === true)} />
                  Только проблемы и изменения
                </label>
                {suggestions > 0 && (
                  <Button size="sm" variant="outline" onClick={() => state.suggest()} disabled={busy || state.dirty}>
                    Применить предложения ({suggestions})
                  </Button>
                )}
              </div>
              {result.rows.length === 0 && (
                <p className="py-4 text-sm text-ink-2">
                  В файле нет заполненных параметров. Заполните значения и загрузите файл снова.
                </p>
              )}
              {visibleRows.length === 0 && result.rows.length > 0 && (
                <p className="py-3 text-sm text-ink-2">
                  В этом фильтре нет строк. Снимите фильтр, чтобы увидеть все параметры.
                </p>
              )}
              <div>
                {visibleRows.map((row) => (
                  <ImportRowEditor
                    key={row.row_id}
                    row={row}
                    modified={state.editedIds.has(row.row_id)}
                    draft={drafts.find((d) => d.row_id === row.row_id)!}
                    params={params.data?.params ?? []}
                    disabled={busy}
                    onChange={state.change}
                    onSuggestion={() => state.suggest(row.row_id)}
                  />
                ))}
              </div>
              {missing > 0 && (
                <p className="text-xs leading-relaxed text-ink-3">
                  После импорта останется заполнить обязательных параметров: {missing}. Их можно добавить на странице
                  объекта; импорт части данных разрешён.
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter className="m-0 flex-col gap-3 rounded-none bg-surface-2 px-5 py-4 sm:flex-col sm:px-6">
          {result && (
            <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
              <Checkbox
                checked={state.overwrite}
                disabled={busy}
                className="mt-0.5"
                onCheckedChange={(on) => state.setOverwriteAndCheck(on === true)}
              />
              Перезаписать значения, введённые вручную
            </label>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {result && (
              <Button variant="ghost" size="sm" onClick={state.download} disabled={!canApply} className="mr-auto">
                <Download />
                Скачать исправленный JSON
              </Button>
            )}
            <Button variant="outline" onClick={close} disabled={busy}>
              Отмена
            </Button>
            {state.dirty && (
              <Button variant="outline" onClick={() => state.check()} disabled={busy}>
                {state.review.isPending && <Spinner />}Проверить изменения
              </Button>
            )}
            <Button onClick={onApply} disabled={!canApply}>
              {state.apply.isPending && <Spinner />}Применить{selected.length > 0 ? ` (${selected.length})` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
