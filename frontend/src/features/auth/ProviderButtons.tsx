import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { problemText } from '@/shared/api/problem'
import { authApi, type ProviderId } from './api'

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
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap gap-2">
        {available.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            className="h-11 grow text-sm"
            disabled={disabled || !!pending}
            onClick={() => void start(p.id)}
          >
            {pending === p.id && <Spinner />} {p.name}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-crit">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-ink-3">или с почтой и паролем</p>
    </div>
  )
}
