import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import type { Project, ProjectParam } from '@/api/types'
import { ConfidenceRing } from '@/components/TopBar'
import { Button } from '@/components/ui'
import { filledShare } from '@/lib/format'
import { downloadFile } from '@/lib/download'
import { OBJECT_TYPE_LABEL } from '@/lib/labels'
import { problemText } from '@/api/problem'
import { useStore } from '@/store'
import { IMPORT_ACCEPT, dataOrigin } from './origin'

export function SourceCard({
  project,
  params,
  onFile,
}: {
  project: Project
  params: ProjectParam[]
  onFile: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState(false)
  const setTrustOpen = useStore((s) => s.setTrustOpen)
  const toast = useStore((s) => s.toast)
  const origin = dataOrigin(project, params)
  const fill = filledShare(project.data_quality.counts)

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      await downloadFile(
        `/object-types/${project.object_type}/template.xlsx`,
        `Шаблон — ${OBJECT_TYPE_LABEL[project.object_type].toLowerCase()}.xlsx`,
      )
    } catch (error) {
      toast(problemText(error), 'error')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div className="card flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-black/[0.05] text-ink-2">
          <FileSpreadsheet size={17} />
        </span>
        <button type="button" onClick={() => setTrustOpen(true)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13.5px] font-medium">{origin.title}</span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {origin.detail} · заполнено {fill.filled} из {fill.total}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTrustOpen(true)}
          className="-mr-1 flex shrink-0 items-center gap-2 rounded-[8px] px-1.5 py-1 text-[13px] hover:bg-black/[0.04]"
          title="Откуда взяты данные объекта"
        >
          <ConfidenceRing value={fill.pct} size={22} />
          <span className="num font-medium">{fill.pct} %</span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
        <Button size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
          Загрузить Excel/CSV/JSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Download size={14} />}
          onClick={() => void downloadTemplate()}
          disabled={downloading}
        >
          {downloading ? 'Готовим шаблон…' : 'Скачать шаблон Excel'}
        </Button>
      </div>
    </div>
  )
}
