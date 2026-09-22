import { useCallback, useEffect, useRef, useState } from 'react'

/** Tiny request cache: one in-flight promise per key, invalidation by prefix. */
const cache = new Map<string, { value: unknown; at: number }>()
const inflight = new Map<string, Promise<unknown>>()
const listeners = new Set<() => void>()

export function invalidate(prefix = '') {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k)
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k)
  listeners.forEach((l) => l())
}

export function peek<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>) {
  const [, force] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error; loading: boolean }>(() => ({
    key,
    data: key ? (cache.get(key)?.value as T | undefined) : undefined,
    loading: !!key && !cache.has(key),
  }))

  const load = useCallback(async () => {
    if (!key) return
    const hit = cache.get(key)
    if (hit) {
      setState({ key, data: hit.value as T, loading: false })
      return
    }
    setState((s) => ({ key, data: s.key === key ? s.data : undefined, loading: true }))
    let p = inflight.get(key) as Promise<T> | undefined
    if (!p) {
      p = fnRef.current()
      inflight.set(key, p)
    }
    try {
      const value = await p
      cache.set(key, { value, at: Date.now() })
      setState({ key, data: value, loading: false })
    } catch (e) {
      setState({ key, error: e as Error, loading: false })
    } finally {
      inflight.delete(key)
    }
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const l = () => {
      force((n) => n + 1)
      void load()
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [load])

  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: state.loading, reload: () => { if (key) cache.delete(key); void load() } }
}
