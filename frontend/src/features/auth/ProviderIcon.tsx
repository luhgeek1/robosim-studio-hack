import type { ProviderId } from './api'

export function ProviderIcon({ provider }: { provider: ProviderId }) {
  return (
    <img
      src={`/auth/${provider}.svg`}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      className={`size-5 shrink-0 ${provider === 'yandex' ? 'rounded-full' : ''}`}
    />
  )
}
