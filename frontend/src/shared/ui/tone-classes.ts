export type Tone = 'ok' | 'info' | 'warn' | 'crit' | 'muted'

export const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok/20',
  info: 'bg-info-soft text-info border-info/20',
  warn: 'bg-warn-soft text-warn border-warn/25',
  crit: 'bg-crit-soft text-crit border-crit/20',
  muted: 'bg-muted text-muted-foreground border-border',
}

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  info: 'text-info',
  warn: 'text-warn',
  crit: 'text-crit',
  muted: 'text-muted-foreground',
}
