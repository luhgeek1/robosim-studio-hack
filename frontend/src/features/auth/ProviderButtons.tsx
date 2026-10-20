import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { problemText } from '@/shared/api/problem'
import { authApi, type ProviderId } from './api'
import { ProviderIcon } from './ProviderIcon'

export function ProviderButtons({
  returnTo,
  keepGuest = false,
  disabled = false,
}: {
  returnTo: string
  keepGuest?: boolean
  disabled?: boolean
}) {
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: authApi.providers, retry: false })
  const [pending, setPending] = useState<ProviderId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const available = providers.data?.filter((p) => p.enabled) ?? []
  const start = async (id: ProviderId) => {
    setPending(id)
    setError(null)
    try {
      window.location.assign(await authApi.start(id, returnTo, false, keepGuest))
    } catch (e) {
      setError(problemText(e))
      setPending(null)
    }
  }
  if (!available.length)
    return providers.isError ? (
      <p className="meta mb-4">Вход через сервисы временно недоступен. Используйте почту и пароль.</p>
    ) : null
  return (
    <div className="mb-5 space-y-4">
      <div className="grid gap-2">
        {available.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            type="button"
            className="relative h-11 w-full gap-3 border-line bg-white px-4 text-sm"
            disabled={disabled || !!pending}
            aria-busy={pending === p.id}
            onClick={() => void start(p.id)}
          >
            <span className="absolute left-4 flex size-5 items-center justify-center" aria-hidden="true">
              {pending === p.id ? <Spinner /> : <ProviderIcon provider={p.id} />}
            </span>
            Войти через {p.name}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-crit">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        <span>или с почтой и паролем</span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
    </div>
  )
}
