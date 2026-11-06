import React from 'react'
import { Link } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/lib/auth'
import { useSchemaSummaries } from '@/lib/useSchemaSummaries'
import AppSidebar from '@/components/layout/AppSidebar'
import { LanguageSelector } from '@/components/case/LanguageSelector'
import { Button } from '@/components/ui/button'

interface AppShellProps {
  children: React.ReactNode
  onArchitect: () => void
  onNewSchema: () => void
  onNavigate?: () => void
  architectActive?: boolean
  newSchemaActive?: boolean
  headerBefore?: React.ReactNode
  headerEnd?: React.ReactNode
}

export default function AppShell({
  children,
  onArchitect,
  onNewSchema,
  onNavigate,
  architectActive = false,
  newSchemaActive = false,
  headerBefore,
  headerEnd,
}: AppShellProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = React.useState(
    () => localStorage.getItem('sidebar-collapsed') === '1',
  )
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const { schemas, totalAwaiting } = useSchemaSummaries()

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem('sidebar-collapsed', v ? '0' : '1')
      return !v
    })
  }

  return (
    <div className="min-h-screen flex bg-paper">
      <AppSidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        schemas={schemas}
        totalAwaiting={totalAwaiting}
        onArchitect={onArchitect}
        onNewSchema={onNewSchema}
        onNavigate={onNavigate}
        architectActive={architectActive}
        newSchemaActive={newSchemaActive}
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen overflow-x-hidden">
        <header className="min-h-11 shrink-0 border-b border-line bg-card-warm/80 backdrop-blur-sm flex flex-wrap items-center gap-2 px-3 sm:px-4 py-1.5 sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label={t('open_nav_menu')}
            className="md:hidden min-w-[40px] min-h-[40px] w-10 h-10 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <Link to="/" className="flex md:hidden items-center gap-2">
            <span className="w-6 h-6 rounded bg-pine text-paper grid place-items-center font-serif font-bold text-xs">F</span>
            <span className="font-serif font-semibold text-sm">FormFoundry</span>
          </Link>
          {headerBefore}
          <div className="ml-auto flex items-center gap-2 min-w-0 flex-1 sm:flex-none justify-end">
            {headerEnd ?? <LanguageSelector />}
          </div>
        </header>

        <main className="flex-1 px-3 sm:px-5 py-4 sm:py-5 overflow-y-auto">
          {children}
        </main>

        <nav className="md:hidden sticky bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur flex justify-around py-1.5 text-[10px] font-semibold">
          <Link to="/" className="flex flex-col items-center gap-0.5 px-3 py-1 text-ink-soft">{t('nav_overview')}</Link>
          <Link to="/?filter=needs-attention" className="flex flex-col items-center gap-0.5 px-3 py-1 text-ink-soft">{t('needs_short', { count: totalAwaiting })}</Link>
          <button onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-0.5 px-3 py-1 text-ink-soft cursor-pointer">{t('nav_schemas')}</button>
          {isAdmin && <button onClick={onArchitect} className="flex flex-col items-center gap-0.5 px-3 py-1 text-ink-soft cursor-pointer">{t('nav_architect')}</button>}
        </nav>
      </div>
    </div>
  )
}
