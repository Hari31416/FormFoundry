import { Link } from 'react-router-dom'
import { ArrowRight, Clock, FileText, Layers, Activity, Shield, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { CaseFile, TemplateDefinition } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getCaseTitle, getCaseSubject, formatCaseDate, getShortId, formatCompactTime, formatProgress } from '@/lib/caseLabel'

const STATUS_DOT: Record<string, string> = {
  approved: 'bg-leaf', completed: 'bg-leaf',
  ready_for_review: 'bg-marigold-bright', awaiting_user: 'bg-marigold-bright',
  collecting_input: 'bg-inkblue', extracting: 'bg-inkblue', resolving: 'bg-inkblue', artifact_generating: 'bg-inkblue',
  failed: 'bg-terracotta',
}

const STATUS_PILL: Record<string, string> = {
  awaiting_user: 'bg-[#fff4e0] text-[#8a4b00]',
  ready_for_review: 'bg-[#e3f0e6] text-[#14532d]',
  approved: 'bg-[#e3f0e6] text-[#14532d]',
  completed: 'bg-[#e3f0e6] text-[#14532d]',
  collecting_input: 'bg-[#e6eef7] text-[#1d4a7a]',
  extracting: 'bg-[#e6eef7] text-[#1d4a7a]',
  resolving: 'bg-[#e6eef7] text-[#1d4a7a]',
  artifact_generating: 'bg-[#e6eef7] text-[#1d4a7a]',
  failed: 'bg-[#fde8e8] text-[#7f1d1d]',
  draft: 'bg-paper text-ink-soft border border-line',
}

interface Props {
  templates: TemplateDefinition[]
  cases: CaseFile[]
  filter: string | null
  search?: string
  t: (k: string, o?: any) => string
}

export default function OverviewView({ templates, cases, filter, search = '', t }: Props) {
  const awaiting = cases.filter(c => !['approved', 'completed', 'failed'].includes(c.status))
  const needsAttention = filter === 'needs-attention'
  const isAll = filter === 'all'
  const nameById = Object.fromEntries(templates.map(x => [x.template_id, x.name]))
  const q = search.trim().toLowerCase()
  const matches = (c: CaseFile) => !q
    || getCaseTitle(c).toLowerCase().includes(q)
    || (getCaseSubject(c) || '').toLowerCase().includes(q)
    || c.case_id.toLowerCase().includes(q)
    || (nameById[c.template_id] || '').toLowerCase().includes(q)
    || c.status.toLowerCase().includes(q)
  const sorted = [...cases].filter(matches).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  const awaitingFiltered = awaiting.filter(matches)
  const shownCases = needsAttention ? awaitingFiltered : isAll ? sorted : q ? sorted : sorted.slice(0, 8)
  const uniqueTemplates = new Set(templates.map(x => x.template_id)).size
  const domains = new Set(templates.map(x => x.domain)).size

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] leading-none font-semibold text-ink">Intake Overview</h1>
          <p className="text-xs text-ink-soft mt-1">Pick a schema on the left, or jump to a case that needs attention.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { label: 'Schemas', value: uniqueTemplates, icon: Layers, hint: `${templates.length} versions`, to: null as string | null },
          { label: 'Total Cases', value: cases.length, icon: FileText, hint: 'all time', to: '/?filter=all' as string | null },
          { label: 'Awaiting', value: awaiting.length, icon: Clock, hint: 'needs attention', to: '/?filter=needs-attention' as string | null, hot: true },
          { label: 'Domains', value: domains, icon: Activity, hint: 'coverage', to: null as string | null },
        ].map(s => s.to ? (
          <Link key={s.label} to={s.to} aria-label={`${s.label}: ${s.value}`} className={cn('bg-white border border-line rounded-lg px-3.5 py-3 flex items-center gap-3 hover:border-pine/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/50', s.hot && 'border-marigold bg-[#fff8ed] shadow-sm')}>
            <span className="p-1.5 rounded-md bg-paper border border-line"><s.icon className="w-4 h-4 text-pine" /></span>
            <span><span className="block text-[10px] uppercase tracking-[0.14em] text-ink-faint">{s.label}</span><span className="block text-xl font-semibold leading-none mt-0.5">{s.value}</span><span className="block text-[10px] text-ink-faint mt-0.5">{s.hint}</span></span>
          </Link>
        ) : (
          <div key={s.label} className="bg-white border border-line rounded-lg px-3.5 py-3 flex items-center gap-3" aria-label={`${s.label}: ${s.value}`}>
            <span className="p-1.5 rounded-md bg-paper border border-line"><s.icon className="w-4 h-4 text-pine" /></span>
            <span><span className="block text-[10px] uppercase tracking-[0.14em] text-ink-faint">{s.label}</span><span className="block text-xl font-semibold leading-none mt-0.5">{s.value}</span><span className="block text-[10px] text-ink-faint mt-0.5">{s.hint}</span></span>
          </div>
        ))}
      </div>

      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{q ? `Results for “${search}”` : needsAttention ? 'Needs Attention' : isAll ? 'All Cases' : 'Recent Cases'}</span>
          <span className="text-[11px] text-ink-faint">{q ? `${shownCases.length} match` : needsAttention ? `${awaiting.length} awaiting` : `${cases.length} total`}</span>
        </div>
        {shownCases.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-ink-faint">{q ? `No cases match “${search}”.` : 'No cases yet — start one from a schema.'}</p>
        ) : (
          <div className="divide-y divide-line/70">
            {shownCases.map(c => (
              <Link key={c.case_id} to={`/cases/${c.case_id}`} title={`#${getShortId(c)} · ${formatCaseDate(c.created_at)}`} className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5 hover:bg-paper transition-colors group min-w-0">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[c.status] || 'bg-ink-faint')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="block text-[12.5px] font-semibold truncate">{getCaseTitle(c)}</span>
                    <span className={cn('inline-block text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 shrink-0', STATUS_PILL[c.status] || 'bg-paper border border-line text-ink-soft')}>{t('case_status_' + c.status)}</span>
                  </span>
                  <span className="block text-[10px] text-ink-faint truncate">{nameById[c.template_id] || c.template_id} · {formatCaseDate(c.created_at)} · {formatProgress(c)}</span>
                </span>
                <span className="w-20 shrink-0 hidden sm:block">
                  {(c.completion_pct ?? 0) > 0 ? (
                    <>
                      <span role="progressbar" aria-label={t('case_progress_label')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.completion_pct ?? 0} className="block h-1 rounded bg-paper overflow-hidden"><span className="block h-full bg-pine" style={{ width: `${c.completion_pct ?? 0}%` }} /></span>
                      <span className="block text-[10px] text-ink-faint mt-0.5 text-right">{Math.round(c.completion_pct ?? 0)}%</span>
                    </>
                  ) : (
                    <span className="block text-[10px] text-ink-faint text-right">{formatProgress(c)}</span>
                  )}
                </span>
                <span className="text-[11px] text-ink-faint shrink-0 tabular-nums">{formatCompactTime(c.created_at)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-pine group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Schemas</div>
        <div className="divide-y divide-line/70">
          {templates.filter((v, i, a) => a.findIndex(x => x.template_id === v.template_id) === i).map(tpl => {
            const pcs = cases.filter(c => c.template_id === tpl.template_id)
            const aw = pcs.filter(c => !['approved', 'completed', 'failed'].includes(c.status)).length
            return (
              <Link key={tpl.template_id} to={`/schemas/${tpl.template_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper group">
                <span className="w-7 h-7 rounded-md bg-pine-soft text-pine grid place-items-center shrink-0">{tpl.domain === 'healthcare' ? <Activity className="w-3.5 h-3.5" /> : tpl.domain === 'public-safety' ? <Shield className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}</span>
                <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold truncate">{tpl.name}</span><span className="block text-[10px] text-ink-faint uppercase tracking-wide">{tpl.domain} · {tpl.schema?.length ?? 0} fields</span></span>
                <span className="text-[11px] text-ink-soft">{pcs.length} {pcs.length === 1 ? 'case' : 'cases'}</span>
                {aw > 0 ? <span className="text-[11px] font-bold text-marigold">{aw} awaiting</span> : <span className="text-[11px] text-ink-faint">None awaiting</span>}
                <ArrowRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-pine transition-all" />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
