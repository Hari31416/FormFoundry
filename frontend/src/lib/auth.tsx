import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

export interface SessionUser {
  id: string
  username: string
  role: 'admin' | 'user'
  disabled: boolean
  expires_at: string | null
}

const TOKEN_KEY = 'formfoundry_access_token'
export const readToken = () => localStorage.getItem(TOKEN_KEY)
const AuthContext = React.createContext<{
  user: SessionUser | null
  loading: boolean
  error: boolean
  retry: () => void
  login: (username: string, password: string) => Promise<void>
  logout: () => void
} | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const client = useQueryClient()
  const generation = React.useRef(0)
  const logout = React.useCallback(() => {
    generation.current++
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setLoading(false)
    setError(false)
    client.clear()
  }, [client])
  const retry = React.useCallback(() => {
    const current = ++generation.current
    setError(false)
    if (!readToken()) {
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get<SessionUser>('/auth/me')
      .then((response) => {
        if (generation.current === current) setUser(response.data)
      })
      .catch(() => {
        if (generation.current === current) setError(true)
      })
      .finally(() => {
        if (generation.current === current) setLoading(false)
      })
  }, [])
  React.useEffect(() => {
    const unauthorized = () => logout()
    const storage = (event: StorageEvent) => {
      if (event.key !== TOKEN_KEY) return
      if (event.newValue === null) logout()
      else {
        client.clear()
        setUser(null)
        retry()
      }
    }
    window.addEventListener('formfoundry:unauthorized', unauthorized)
    window.addEventListener('storage', storage)
    retry()
    return () => {
      generation.current++
      window.removeEventListener('formfoundry:unauthorized', unauthorized)
      window.removeEventListener('storage', storage)
    }
  }, [logout, retry, client])
  const login = async (username: string, password: string) => {
    const form = new URLSearchParams({ username, password })
    const response = await api.post<{ access_token: string }>(
      '/auth/token',
      form,
    )
    localStorage.setItem(TOKEN_KEY, response.data.access_token)
    try {
      const me = await api.get<SessionUser>('/auth/me')
      client.clear()
      setUser(me.data)
      setError(false)
    } catch (error) {
      logout()
      throw error
    }
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, retry, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is required')
  return context
}

export function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { user, loading, error, retry } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()
  if (loading)
    return (
      <p role="status" className="p-8 text-ink-soft">
        {t('auth_loading')}
      </p>
    )
  if (error)
    return (
      <div role="alert" className="p-8">
        <p>{t('auth_session_failed')}</p>
        <button className="text-pine underline" onClick={retry}>
          {t('auth_retry')}
        </button>
      </div>
    )
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    )
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
