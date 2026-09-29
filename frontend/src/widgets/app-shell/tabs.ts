import { create } from 'zustand'
import { useWorkspaceStore } from '@/entities/organization'

export type ProjectTab = { id: string; path: string }

// Вкладки свои у каждого пользователя и каждой его рабочей области: после смены учётки чужие проекты не всплывают.
const storageKey = (userId: string, workspaceId: string | null) =>
  workspaceId ? `robomera.project-tabs:${userId}:${workspaceId}` : `robomera.project-tabs:${userId}`

function load(userId: string | null, workspaceId: string | null): ProjectTab[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(storageKey(userId, workspaceId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((t): t is ProjectTab => typeof t?.id === 'string' && typeof t?.path === 'string')
      : []
  } catch {
    return []
  }
}

function save(tabs: ProjectTab[]) {
  const { userId, id } = useWorkspaceStore.getState()
  if (!userId) return
  try {
    localStorage.setItem(storageKey(userId, id), JSON.stringify(tabs))
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
  tabs: load(useWorkspaceStore.getState().userId, useWorkspaceStore.getState().id),
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

useWorkspaceStore.subscribe((state, previous) => {
  if (state.userId !== previous.userId || state.id !== previous.id) {
    useProjectTabs.setState({ tabs: load(state.userId, state.id) })
  }
})
