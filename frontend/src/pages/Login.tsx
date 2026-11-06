import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LanguageSelector } from '@/components/case/LanguageSelector'

export default function Login() {
  const { user, login, loading } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const from = location.state?.from
  if (user)
    return (
      <Navigate
        to={
          typeof from === 'string' &&
          from.startsWith('/') &&
          !from.startsWith('//') &&
          !from.startsWith('/login')
            ? from
            : '/'
        }
        replace
      />
    )
  if (loading)
    return (
      <p role="status" className="p-8">
        {t('auth_loading')}
      </p>
    )
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(false)
    try {
      await login(username, password)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <main className="min-h-dvh bg-paper grid place-items-center p-6">
      <div className="w-full max-w-md border border-line rounded-xl bg-card-warm shadow-sm overflow-hidden">
        <div className="bg-pine text-paper px-8 py-8">
          <p className="font-serif text-3xl">FormFoundry</p>
          <p className="text-sm mt-2 opacity-80">{t('auth_intro')}</p>
        </div>
        <form onSubmit={submit} className="p-8 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="font-serif text-2xl text-ink">
              {t('auth_sign_in')}
            </h1>
            <LanguageSelector />
          </div>
          <label className="block text-sm space-y-2">
            <span>{t('auth_username')}</span>
            <Input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="block text-sm space-y-2">
            <span>{t('auth_password')}</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={256}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-terracotta">
              {t('auth_login_failed')}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-pine hover:bg-pine-deep"
          >
            {t(pending ? 'auth_signing_in' : 'auth_sign_in')}
          </Button>
          <p className="text-xs text-ink-faint">{t('auth_contact_admin')}</p>
        </form>
      </div>
    </main>
  )
}
