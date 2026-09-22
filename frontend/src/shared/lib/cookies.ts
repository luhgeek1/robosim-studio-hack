export function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const raw = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
  if (!raw) return null
  try {
    return decodeURIComponent(raw.slice(prefix.length))
  } catch {
    return null
  }
}
