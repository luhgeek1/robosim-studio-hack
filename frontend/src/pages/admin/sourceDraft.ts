import type { SourceKind, SourceWrite } from '@/shared/api/types'

export type SourceDraft = { kind: SourceKind; title: string; url: string; date: string }

export const today = () => new Date().toISOString().slice(0, 10)
export const emptySource = (): SourceDraft => ({ kind: 'open_source', title: '', url: '', date: today() })

export const toSourceWrite = (draft: SourceDraft): SourceWrite => ({
  kind: draft.kind,
  title: draft.title.trim(),
  url: draft.url.trim() || null,
  retrieved_at: draft.date || null,
})
