import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

export function useLinkToken(key: string) {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => {
    const raw = new URLSearchParams(location.hash.slice(1)).get('token')
    try {
      if (raw) sessionStorage.setItem(`auth-link:${key}`, raw)
      return raw || sessionStorage.getItem(`auth-link:${key}`) || ''
    } catch {
      return raw || ''
    }
  })
  useEffect(() => {
    if (location.hash)
      void navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate])
  const clear = () => {
    try {
      sessionStorage.removeItem(`auth-link:${key}`)
    } catch {
      /* Storage may be disabled. */
    }
  }
  return { token, clear }
}
