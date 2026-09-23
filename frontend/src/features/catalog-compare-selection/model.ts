import { useMemo, useSyncExternalStore } from 'react'

export const COMPARE_LIMIT = 5

const STORAGE_KEY = 'robomera.compare-selection'

export type CompareItem = { id: string; name: string }

function read(): CompareItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is CompareItem => typeof item?.id === 'string' && typeof item?.name === 'string')
      .slice(0, COMPARE_LIMIT)
  } catch {
    return []
  }
}

let items: CompareItem[] = read()
const listeners = new Set<() => void>()

function commit(next: CompareItem[]) {
  items = next
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode or blocked storage: the selection still works for this tab until reload.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => items

export const compareSelection = {
  add(item: CompareItem): boolean {
    if (items.some((i) => i.id === item.id)) return true
    if (items.length >= COMPARE_LIMIT) return false
    commit([...items, item])
    return true
  },
  remove(id: string) {
    if (items.some((i) => i.id === id)) commit(items.filter((i) => i.id !== id))
  },
  toggle(item: CompareItem): boolean {
    if (items.some((i) => i.id === item.id)) {
      compareSelection.remove(item.id)
      return true
    }
    return compareSelection.add(item)
  },
  clear() {
    if (items.length) commit([])
  },
}

export function useCompareSelection() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () => ({
      items: list,
      ids: list.map((i) => i.id),
      has: (id: string) => list.some((i) => i.id === id),
      isFull: list.length >= COMPARE_LIMIT,
      ...compareSelection,
    }),
    [list],
  )
}

export const compareUrl = (ids: string[]) => `/catalog/compare?ids=${ids.join(',')}`
