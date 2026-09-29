export const parseNumber = (text: string) => {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) ? value : null
}
