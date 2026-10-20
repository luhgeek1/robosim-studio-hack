import { useState } from 'react'
import { toast } from 'sonner'
import { useApplyImport, useImportFile, useReviewImport } from '@/entities/project'
import type { ImportEdit, ImportResult, ImportReviewRow } from '@/shared/api/types'

const toEdit = (row: ImportReviewRow): ImportEdit => ({
  row_id: row.row_id,
  key: row.key,
  value: row.value,
  unit: row.unit,
  excluded: row.excluded,
})

export function useImportReview(projectId: string) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [drafts, setDrafts] = useState<ImportEdit[]>([])
  const [dirty, setDirty] = useState(false)
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const parse = useImportFile(projectId)
  const review = useReviewImport(projectId)
  const apply = useApplyImport(projectId)
  const busy = parse.isPending || review.isPending || apply.isPending
  const receive = (data: ImportResult) => {
    setResult(data)
    setDrafts(data.rows.map(toEdit))
    setDirty(false)
  }
  const reset = () => {
    setFileName(null)
    setResult(null)
    setDrafts([])
    setEditedIds(new Set())
    setDirty(false)
    setOverwrite(false)
    parse.reset()
    review.reset()
    apply.reset()
  }
  const onFile = (file: File | undefined, maxMb: number) => {
    if (!file || busy) return
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Максимальный размер файла - ${maxMb} МБ`)
      return
    }
    reset()
    setFileName(file.name)
    parse.mutate(file, { onSuccess: receive })
  }
  const change = (edit: ImportEdit) => {
    setEditedIds((prev) => new Set(prev).add(edit.row_id))
    setDrafts((prev) => prev.map((row) => (row.row_id === edit.row_id ? edit : row)))
    setDirty(true)
    apply.reset()
  }
  const check = (edits = drafts, nextOverwrite = overwrite) => {
    if (!result || busy) return
    review.mutate(
      { importId: result.import_id, body: { edits, overwrite_user_values: nextOverwrite } },
      { onSuccess: receive },
    )
  }
  const suggest = (onlyRow?: string) => {
    const changedIds = new Set(editedIds)
    const edits = drafts.map((draft) => {
      const proposal = result?.rows.find((row) => row.row_id === draft.row_id)?.suggestion
      if (proposal && !draft.excluded && (!onlyRow || onlyRow === draft.row_id)) {
        changedIds.add(draft.row_id)
        return { ...draft, key: proposal.key, value: proposal.value, unit: proposal.unit }
      }
      return draft
    })
    setDrafts(edits)
    setEditedIds(changedIds)
    setDirty(true)
    check(edits)
  }
  const setOverwriteAndCheck = (value: boolean) => {
    setOverwrite(value)
    setDirty(true)
    check(drafts, value)
  }
  const download = () => {
    if (!result || dirty) return
    const content = result.rows.filter((row) => !row.excluded).map(({ key, value, unit }) => ({ key, value, unit }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${fileName?.replace(/\.[^.]+$/, '') ?? 'parameters'}-исправлено.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return {
    fileName,
    result,
    drafts,
    dirty,
    editedIds,
    overwrite,
    parse,
    review,
    apply,
    busy,
    reset,
    onFile,
    change,
    check,
    suggest,
    setOverwriteAndCheck,
    download,
  }
}
