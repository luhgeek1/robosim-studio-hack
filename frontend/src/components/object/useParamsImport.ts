import { useState } from 'react'
import { useImportFile } from '@/api/projects'

// The file is parsed on the server first; nothing changes in the project until the user applies the preview.
export function useParamsImport(projectId: string) {
  const parse = useImportFile(projectId)
  const [fileName, setFileName] = useState<string | null>(null)
  const pick = (file: File) => {
    setFileName(file.name)
    parse.mutate(file)
  }
  const close = () => {
    setFileName(null)
    parse.reset()
  }
  return { fileName, pick, close, parse }
}

export type ParamsImport = ReturnType<typeof useParamsImport>
