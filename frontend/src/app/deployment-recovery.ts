type RecoveryOptions = {
  currentEntry: string | null
  latestEntry: () => Promise<string | null>
  lastReloadAt: () => number
  rememberReload: (time: number) => void
  reload: () => void
  now: () => number
}

const RELOAD_COOLDOWN_MS = 60_000

export function deploymentRecovery(options: RecoveryOptions) {
  let checking = false
  return async () => {
    if (checking || !options.currentEntry) return false
    checking = true
    try {
      if (options.now() - options.lastReloadAt() < RELOAD_COOLDOWN_MS) return false
      const latest = await options.latestEntry()
      if (!latest || latest === options.currentEntry) return false
      options.rememberReload(options.now())
      options.reload()
      return true
    } catch {
      // Offline or blocked storage must leave the normal retry screen usable.
      return false
    } finally {
      checking = false
    }
  }
}

export function installDeploymentRecovery() {
  const storageKey = 'robomera:deployment-reload-at'
  const recover = deploymentRecovery({
    currentEntry: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null,
    latestEntry: async () => {
      const response = await fetch(window.location.href.split('#')[0], { cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null
      const page = new DOMParser().parseFromString(await response.text(), 'text/html')
      const source = page.querySelector('script[type="module"][src]')?.getAttribute('src')
      return source ? new URL(source, window.location.href).href : null
    },
    lastReloadAt: () => Number(sessionStorage.getItem(storageKey) ?? 0),
    rememberReload: (time) => sessionStorage.setItem(storageKey, String(time)),
    reload: () => window.location.reload(),
    now: Date.now,
  })
  window.addEventListener('vite:preloadError', () => void recover())
}
