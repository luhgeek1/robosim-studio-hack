import { useState } from 'react'
import { toast } from 'sonner'
import type { Layout } from '@/shared/api/types'
import { saveBlob } from '@/shared/lib/download'
import { derivationDocument } from './derivationDoc'

export function useDerivationDownload(layout: Layout, projectName: string) {
  const [saving, setSaving] = useState(false)
  const download = async () => {
    setSaving(true)
    try {
      const blob = await derivationDocument(layout, projectName)
      saveBlob(blob, `геометрия-планировки-${layout.version}.docx`)
    } catch {
      toast.error('Не удалось собрать документ')
    } finally {
      setSaving(false)
    }
  }
  return { saving, download }
}
