export function scrollToParam(key: string) {
  const row = document.getElementById(`param-${key}`)
  if (!row) return
  let parent: HTMLElement | null = row.parentElement
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true
    parent = parent.parentElement
  }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  row
    .querySelector<HTMLElement>('input, button[role="combobox"], button[role="switch"]')
    ?.focus({ preventScroll: true })
}
