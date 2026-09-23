import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { readCookie } from '@/lib/cookies'

const API_PATH = '/api/v1'
const CSRF_COOKIE = 'csrf_token'

const baseURL = `${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')}${API_PATH}`

// The contract uses style=form, explode=false for arrays: `status=operation,piloting`.
function serializeParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','))
    } else {
      search.set(key, String(value))
    }
  }
  return search.toString()
}

const common = {
  baseURL,
  timeout: 60_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'X-Client': 'web' },
  paramsSerializer: { serialize: serializeParams },
}

export const apiPublic = axios.create(common)
export const api = axios.create(common)

type TokenPair = { access_token: string }

let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null
let onUnauthorized: (() => void) | null = null

export const setAccessToken = (token: string | null) => {
  accessToken = token
}

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler
}

export const apiUrl = (path: string) => `${baseURL}${path}`

// Several requests can hit 401 at once; they all wait for one refresh instead of rotating the token N times.
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    const csrf = readCookie(CSRF_COOKIE)
    if (!csrf) return null
    const { data } = await apiPublic.post<TokenPair>('/auth/refresh', {}, { headers: { 'X-CSRF-Token': csrf } })
    accessToken = data.access_token
    return accessToken
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    config.headers = headers
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (error.response?.status !== 401 || !original || original._retry) throw error
    original._retry = true
    const token = await refreshAccessToken().catch(() => null)
    if (!token) {
      accessToken = null
      onUnauthorized?.()
      throw error
    }
    const headers = AxiosHeaders.from(original.headers)
    headers.set('Authorization', `Bearer ${token}`)
    original.headers = headers
    return api(original)
  },
)
