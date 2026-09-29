export type CatalogQuery = {
  q?: string
  object_type?: string
  solution_type?: string[]
  status?: string[]
  badge?: string[]
  industry?: string
  sort?: string
  page?: number
  page_size?: number
}

// Every project-scoped key starts with ['projects', id], so one invalidation refreshes the whole project after an edit.
export const qk = {
  me: ['me'] as const,
  version: ['version'] as const,
  objectTypes: ['object-types'] as const,
  objectType: (key: string) => ['object-types', key] as const,
  catalog: {
    products: (query: CatalogQuery) => ['catalog', 'products', query] as const,
    facets: (objectType?: string) => ['catalog', 'facets', objectType ?? null] as const,
    product: (id: string) => ['catalog', 'product', id] as const,
    compare: (ids: string[], projectId?: string) => ['catalog', 'compare', ids, projectId ?? null] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: ['projects', 'list'] as const,
    // Рабочая область — часть ключа: переключение показывает свой список, не перезаписывая чужой кэш.
    listIn: (workspaceId: string | null) => ['projects', 'list', workspaceId ?? 'personal'] as const,
    one: (id: string) => ['projects', id] as const,
    params: (id: string) => ['projects', id, 'params'] as const,
    validation: (id: string) => ['projects', id, 'validation'] as const,
    dataQuality: (id: string) => ['projects', id, 'data-quality'] as const,
    processes: (id: string) => ['projects', id, 'processes'] as const,
    audit: (id: string) => ['projects', id, 'audit'] as const,
    layout: (id: string) => ['projects', id, 'layout'] as const,
    matching: (id: string) => ['projects', id, 'matching'] as const,
    scenarios: (id: string) => ['projects', id, 'scenarios'] as const,
    comparison: (id: string) => ['projects', id, 'comparison'] as const,
  },
  scenarios: {
    all: ['scenarios'] as const,
    one: (id: string) => ['scenarios', id] as const,
    survey: (id: string) => ['scenarios', id, 'survey'] as const,
  },
  admin: {
    all: ['admin'] as const,
    analytics: ['admin', 'analytics'] as const,
    users: (query: object) => ['admin', 'users', query] as const,
    products: (query: object) => ['admin', 'products', query] as const,
  },
  reference: {
    solutionTypes: ['reference', 'solution-types'] as const,
    industries: ['reference', 'industries'] as const,
    specKeys: ['reference', 'spec-keys'] as const,
    normSets: ['reference', 'norm-sets'] as const,
    norms: (version?: string) => ['reference', 'norms', version ?? null] as const,
  },
  vendor: {
    all: ['vendor'] as const,
    overview: ['vendor', 'overview'] as const,
    proposals: ['vendor', 'proposals'] as const,
  },
  proposals: {
    all: ['proposals'] as const,
    queue: (status?: string) => ['proposals', 'queue', status ?? 'all'] as const,
  },
  manufacturers: ['manufacturers'] as const,
  organizations: {
    all: ['organizations'] as const,
    list: ['organizations', 'list'] as const,
    one: (id: string) => ['organizations', id] as const,
    invitations: ['organizations', 'invitations'] as const,
  },
  calculations: {
    one: (id: string) => ['calculations', id] as const,
    trace: (id: string) => ['calculations', id, 'trace'] as const,
    narrative: (id: string) => ['calculations', id, 'narrative'] as const,
  },
}
