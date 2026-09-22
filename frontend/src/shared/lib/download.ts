import { api } from '@/shared/api/client'

export async function downloadFile(path: string, filename: string): Promise<void> {
  const { data } = await api.get<Blob>(path, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
