import { Link, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Clock, Layers, Plus, Settings, ChevronsLeft, ChevronsRight, X, Shield, Activity, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TemplateDefinition, CaseFile } from '@/lib/api'

interface SchemaSummary {
  template: TemplateDefinition
  total: number
  awaiting: number
}

interface Props {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
  schemas: SchemaSummary[]
  totalAwaiting: number
  onArchitect: () => void
  onNewSchema: () => void
  onNavigate?: () => void
  architectActive: boolean
  newSchemaActive: boolean
}

const iconFor = (domain: string) => {
  if (domain === 'healthcare') return <Activity className="w-3.5 h-3.5" />
  if (domain === 'public-safety' || domain === 'safety') return <Shield className="w-3.5 h-3.5" />
  return <Sparkles className="w-3.5 h-3.5" />
}

function SidebarContent({ collapsed, schemas, totalAwaiting, onArchitect, onNewSchema, onNavigate, architectActive, newSchemaActive, onCloseMobile }: Props & { onCloseMobile?: () => void }) {
  const loc = useLocation()
  const filter = new URLSearchParams(loc.search).get('filter')
  const suppressNav = architectActive || newSchemaActive
  const isOverview = !suppressNav && loc.pathname === '/' && !filter
  const isNeeds = !suppressNav && loc.pathname === '/' && filter === 'needs-attention'
  const isAll = !suppressNav && loc.pathname === '/' && filter === 'all'
  const navLinkClass = (active: boolean) => cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium transition-colors',
    active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
  )
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={cn('flex items-center gap-2.5 px-3 py-3 border-b border-white/10 shrink-0', collapsed && 'justify-center px-2')}>
        <div className="w-7 h-7 rounded-md bg-paper text-pine grid place-items-center font-serif font-bold text-sm shrink-0">F</div>
        {!collapsed && (
          <div className="leading-none min-w-0">
            <p className="font-serif font-semibold text-paper text-[13px]">FormFoundry</p>
            <p className="text-[9px] tracking-[0.18em] uppercase text-white/50 mt-0.5 truncate">Admin Intake</p>
          </div>
        )}
      </div>

      <nav className="px-2 py-3 space-y-0.5 shrink-0">
        <Link to="/" onClick={() => { onNavigate?.(); onCloseMobile?.() }} aria-current={isOverview ? 'page' : undefined} className={navLinkClass(isOverview)}>
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Overview</span>}
        </Link>
        <Link to="/?filter=needs-attention" onClick={() => { onNavigate?.(); onCloseMobile?.() }} aria-current={isNeeds ? 'page' : undefined} className={navLinkClass(isNeeds)}>
          <Clock className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Needs Attention</span>}
          {!collapsed && totalAwaiting > 0 && <span className="ml-auto text-[10px] font-bold bg-[#c95a1e] text-white rounded-full px-1.5 py-0.5 leading-none">{totalAwaiting}</span>}
          {collapsed && totalAwaiting > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#c95a1e] ml-auto" />}
        </Link>
        <Link to="/?filter=all" onClick={() => { onNavigate?.(); onCloseMobile?.() }} aria-current={isAll ? 'page' : undefined} className={navLinkClass(isAll)}>
          <Layers className="w-4 h-4 shrink-0" />
          {!collapsed && <span>All Cases</span>}
        </Link>
      </nav>

      {!collapsed && <p className="px-4 pt-2 pb-1 text-[9px] tracking-[0.18em] uppercase text-white/40 shrink-0">Schemas</p>}
      <div className="px-2 space-y-0.5 overflow-y-auto flex-1 min-h-0">
        {schemas.map(({ template, awaiting }) => {
          const to = `/schemas/${template.template_id}`
          const isActive = !suppressNav && loc.pathname === to
          return (
            <NavLink key={template.template_id} to={to} onClick={() => { onNavigate?.(); onCloseMobile?.() }} title={template.name}
              className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', isActive ? 'bg-paper text-ink' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
              <span className={cn('w-7 h-7 rounded-md grid place-items-center text-[13px] shrink-0', isActive ? 'bg-pine-soft text-pine' : 'bg-white/10 text-white/80')}>{iconFor(template.domain)}</span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold leading-tight truncate">{template.name}</span>
                    <span className={cn('block text-[10px] truncate', isActive ? 'text-ink-faint' : 'text-white/40')}>{template.domain.toUpperCase()} · {template.schema?.length ?? 0} fields</span>
                  </span>
                  {awaiting > 0 && <span className={cn('text-[10px] font-bold shrink-0', isActive ? 'text-marigold' : 'text-[#e8a17a]')}>{awaiting}</span>}
                </>
              )}
            </NavLink>
          )
        })}
        <button onClick={() => { onNewSchema(); onCloseMobile?.() }} aria-current={newSchemaActive ? 'page' : undefined} className={cn('w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium cursor-pointer transition-colors', newSchemaActive ? 'bg-paper text-ink' : 'text-white/50 hover:bg-white/5 hover:text-white')}>
          <span className={cn('w-7 h-7 rounded-md grid place-items-center shrink-0', newSchemaActive ? 'bg-pine-soft text-pine' : 'border border-dashed border-white/20')}><Plus className="w-3.5 h-3.5" /></span>
          {!collapsed && <span>New Schema</span>}
        </button>
      </div>

      <div className="px-2 py-2 border-t border-white/10 space-y-0.5 shrink-0 bg-[#0f2e22]">
        <button onClick={() => { onArchitect(); onCloseMobile?.() }} aria-label="Template Architect" className={cn('flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-[12.5px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60', (architectActive && !newSchemaActive) ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
          <Settings className="w-4 h-4 shrink-0" />{!collapsed && <span>Architect</span>}
        </button>
      </div>
    </div>
  )
}

export default function AppSidebar(props: Props) {
  return (
    <>
      <aside className={cn('hidden md:flex sticky top-0 self-start h-dvh max-h-dvh flex-col bg-[#0f2e22] text-white border-r border-[#0f2e22] transition-all duration-200 shrink-0 overflow-hidden', props.collapsed ? 'w-[60px]' : 'w-[232px]')}>
        <div className="flex-1 min-h-0">
          <SidebarContent {...props} />
        </div>
        <button onClick={props.onToggle} aria-label={props.collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="shrink-0 m-2 h-7 rounded-md border border-white/15 text-white/60 hover:text-white hover:bg-white/5 grid place-items-center cursor-pointer">
          {props.collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </aside>

      {props.mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={props.onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] h-dvh max-h-dvh bg-[#0f2e22] text-white flex flex-col overflow-hidden">
            <button onClick={props.onCloseMobile} aria-label="Close menu" className="absolute top-3 right-3 p-1.5 rounded-md text-white/70 hover:bg-white/10 cursor-pointer z-10"><X className="w-5 h-5" /></button>
            <SidebarContent {...{ ...props, collapsed: false }} />
          </aside>
        </div>
      )}
    </>
  )
}
