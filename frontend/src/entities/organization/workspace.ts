import { create } from 'zustand'

// Выбор области помнится отдельно для каждого пользователя: на общем браузере чужой выбор не подхватывается.
const storageKey = (userId: string) => `robomera.workspace:${userId}`

function load(userId: string | null): string | null {
  if (!userId) return null
  try {
    return localStorage.getItem(storageKey(userId)) || null
  } catch {
    return null
  }
}

type State = {
  /** Чьё локальное состояние загружено; после выхода остаётся прежним, пока не войдёт другой пользователь. */
  userId: string | null
  /** null — личное пространство, иначе id организации. */
  id: string | null
  own: (userId: string) => void
  select: (id: string | null) => void
}

/* Текущая рабочая область, как переключатель организаций у OpenAI: от неё зависят список проектов, вкладки
   и куда создаётся новый проект. Помнится в браузере — после перезагрузки открывается та же. */
export const useWorkspaceStore = create<State>((set, get) => ({
  userId: null,
  id: null,
  own: (userId) => {
    if (get().userId !== userId) set({ userId, id: load(userId) })
  },
  select: (id) => {
    const { userId } = get()
    try {
      if (userId && id) localStorage.setItem(storageKey(userId), id)
      else if (userId) localStorage.removeItem(storageKey(userId))
    } catch {
      // Без хранилища выбор живёт до перезагрузки.
    }
    set({ id })
  },
}))

export const useWorkspaceId = () => useWorkspaceStore((s) => s.id)
