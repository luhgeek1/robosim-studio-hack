import { create } from 'zustand'

export type ProjectTab = { id: string; path: string }

const STORAGE_KEY = 'roboscope.project-tabs'

function load(): ProjectTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((t): t is ProjectTab => typeof t?.id === 'string' && typeof t?.path === 'string')
      : []
  } catch {
    return []
  }
}

function save(tabs: ProjectTab[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  } catch {
    // Вкладки — удобство одного браузера: без хранилища они просто живут до перезагрузки.
  }
}

type State = {
  tabs: ProjectTab[]
  visit: (id: string, path: string) => void
  close: (id: string) => ProjectTab | null
}

/* Открытые проекты как вкладки браузера: вкладка помнит последний экран проекта и не закрывается при уходе
   в «Проекты» или «Каталог». close возвращает соседнюю вкладку, куда перейти, если закрыли текущую. */
export const useProjectTabs = create<State>((set, get) => ({
  tabs: load(),
  visit: (id, path) => {
    const tabs = get().tabs
    const index = tabs.findIndex((t) => t.id === id)
    if (index >= 0 && tabs[index].path === path) return
    const next = index >= 0 ? tabs.map((t) => (t.id === id ? { id, path } : t)) : [...tabs, { id, path }]
    save(next)
    set({ tabs: next })
  },
  close: (id) => {
    const tabs = get().tabs
    const index = tabs.findIndex((t) => t.id === id)
    if (index < 0) return null
    const next = tabs.filter((t) => t.id !== id)
    save(next)
    set({ tabs: next })
    return next[index] ?? next[index - 1] ?? null
  },
}))
