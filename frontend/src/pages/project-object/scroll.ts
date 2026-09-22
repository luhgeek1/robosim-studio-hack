export function scrollToParam(key: string) {
  const row = document.getElementById(`param-${key}`)
  if (!row) return
  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  row
    .querySelector<HTMLElement>('input, button[role="combobox"], button[role="switch"]')
    ?.focus({ preventScroll: true })
}
