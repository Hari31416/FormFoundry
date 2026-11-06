import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, getTemplates } from '@/lib/api'
import type { SessionUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AppShell from '@/components/layout/AppShell'

function UserAccess({ user }: { user: SessionUser }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const access = useQuery({
    queryKey: ['access', user.id],
    queryFn: () =>
      api.get<string[]>(`/auth/users/${user.id}/schemas`).then((r) => r.data),
  })
  const templates = useQuery({ queryKey: ['templates'], queryFn: getTemplates })
  const [selected, setSelected] = React.useState<string[] | null>(null)
  const ids = selected ?? access.data ?? []
  const save = useMutation({
    mutationFn: () =>
      api.put(`/auth/users/${user.id}/schemas`, { template_ids: ids }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['access', user.id] })
      setSelected(null)
    },
  })
  const toggle = useMutation({
    mutationFn: () =>
      api.patch(`/auth/users/${user.id}`, {
        disabled: !user.disabled,
        expires_at: user.expires_at,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }),
  })
  const schemas = [
    ...new Map(
      templates.data?.map((item) => [item.template_id, item]),
    ).values(),
  ]
  return (
    <section className="bg-white border border-line rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold flex-1">{user.username}</h2>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
          {t(user.role === 'admin' ? 'auth_admin' : 'auth_user')}
        </span>
        {user.role !== 'admin' && (
          <Button
            variant="outline"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {t(user.disabled ? 'auth_enable' : 'auth_disable')}
          </Button>
        )}
      </div>
      {user.role === 'admin' ? (
        <p className="text-sm text-ink-soft">{t('auth_admin_all_schemas')}</p>
      ) : (
        <>
          <p className="text-xs text-ink-soft">{t('auth_access_help')}</p>
          {access.isLoading || templates.isLoading ? (
            <p role="status">{t('auth_loading')}</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {schemas.map((schema) => (
                <label
                  key={schema.template_id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-pine cursor-pointer"
                    disabled={
                      save.isPending || access.isError || templates.isError
                    }
                    checked={ids.includes(schema.template_id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...ids, schema.template_id]
                          : ids.filter((id) => id !== schema.template_id),
                      )
                    }
                  />
                  {schema.name}
                </label>
              ))}
            </div>
          )}
          <Button
            className="disabled:bg-pine-soft disabled:text-ink-faint disabled:opacity-100"
            disabled={
              selected === null ||
              save.isPending ||
              access.isError ||
              templates.isError
            }
            onClick={() => save.mutate()}
          >
            {t('auth_save_access')}
          </Button>
          {save.isSuccess && selected === null && (
            <p role="status" className="text-sm text-pine">
              {t('auth_access_saved')}
            </p>
          )}
        </>
      )}
      {(save.isError ||
        toggle.isError ||
        access.isError ||
        templates.isError) && (
        <p role="alert" className="text-sm text-terracotta">
          {t('auth_save_failed')}
        </p>
      )}
    </section>
  )
}

export default function AccessManagement() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const navigate = useNavigate()
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<SessionUser[]>('/auth/users').then((r) => r.data),
  })
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const create = useMutation({
    mutationFn: () => api.post('/auth/users', { username, password }),
    onSuccess: () => {
      setUsername('')
      setPassword('')
      client.invalidateQueries({ queryKey: ['users'] })
    },
  })
  return (
    <AppShell
      onArchitect={() =>
        navigate('/', { state: { architect: 'design' } })
      }
      onNewSchema={() => navigate('/', { state: { architect: 'new' } })}
    >
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-[22px] leading-none font-semibold text-ink">{t('auth_manage_access')}</h1>
          <p className="text-xs text-ink-soft mt-1.5">{t('auth_manage_help')}</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
          className="bg-white border border-line rounded-lg p-5 space-y-4"
        >
          <h2 className="font-semibold">{t('auth_create_user')}</h2>
          <div className="flex gap-3 flex-wrap">
            <label className="flex-1 min-w-40 text-sm space-y-2">
              <span>{t('auth_username')}</span>
              <Input
                required
                minLength={3}
                maxLength={80}
                pattern="[A-Za-z0-9_.@-]+"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="flex-1 min-w-40 text-sm space-y-2">
              <span>{t('auth_password')}</span>
              <Input
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              className="self-end"
              disabled={create.isPending}
            >
              {t('auth_create_user')}
            </Button>
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-terracotta">
              {t('auth_create_failed')}
            </p>
          )}
        </form>
        {users.isLoading && <p role="status">{t('auth_loading')}</p>}
        {users.isError && <p role="alert">{t('auth_save_failed')}</p>}
        {users.data?.map((user) => (
          <UserAccess key={user.id} user={user} />
        ))}
      </div>
    </AppShell>
  )
}
