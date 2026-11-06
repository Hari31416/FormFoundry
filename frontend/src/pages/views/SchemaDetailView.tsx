import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Eye, Trash2 } from 'lucide-react'
import type { CaseFile, TemplateDefinition } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getCaseTitle, getCaseSubject, formatCaseDate, getShortId, formatCompactTime, formatProgress } from '@/lib/caseLabel'

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
  template: TemplateDefinition
  versions: TemplateDefinition[]
  activeVersion: number
  onVersionChange: (v: number) => void
  cases: CaseFile[]
  search: string
  onSearch: (s: string) => void
  onStartCase: () => void
  onViewSchema: () => void
  onDeleteCase: (id: string) => void
  isPending: boolean
  t: (k: string, o?: any) => string
}

export default function SchemaDetailView({ template, versions, activeVersion, onVersionChange, cases, search, onSearch, onStartCase, onViewSchema, onDeleteCase, isPending, t }: Props) {
  const [tab, setTab] = React.useState<'cases' | 'schema'>('cases')
  const filtered = cases.filter(c => {
    const q = search.toLowerCase().trim()
    return !q || getCaseTitle(c).toLowerCase().includes(q) || (getCaseSubject(c) || '').toLowerCase().includes(q) || c.case_id.toLowerCase().includes(q) || c.status.toLowerCase().includes(q)
  }).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))

  const awaiting = cases.filter(c => !['approved', 'completed', 'failed'].includes(c.status)).length
  const ready = cases.filter(c => c.status === 'ready_for_review').length
  const done = cases.filter(c => ['approved', 'completed'].includes(c.status)).length

  return (
    <div className="space-y-3.5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[20px] font-semibold text-ink leading-tight">{template.name}</h1>
            {versions.length > 1 && (
              <select value={activeVersion} onChange={e => onVersionChange(parseInt(e.target.value))} aria-label={t('version_label')} className="text-[11px] font-mono border border-line rounded px-1.5 py-0.5 bg-white cursor-pointer">
                {versions.map(v => <option key={v.template_version} value={v.template_version}>V{v.template_version}</option>)}
              </select>
            )}
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint border border-line rounded px-1.5 py-0.5">{template.domain}</span>
          </div>
          <p className="text-xs text-ink-soft mt-1 line-clamp-2 max-w-xl">{template.description}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onViewSchema}><Eye className="w-3.5 h-3.5 mr-1.5" />{t('schema_button')}</Button>
          <Button size="sm" className="h-8 text-xs bg-pine hover:bg-pine-deep" onClick={onStartCase} disabled={isPending}>+ {t('start_case')}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[[t('stat_total'), cases.length], [t('stat_awaiting'), awaiting], [t('stat_ready'), ready], [t('stat_done'), done]].map(([label, value]) => (
          <div key={label as string} className="bg-white border border-line rounded-lg px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
            <p className="text-xl font-semibold leading-none mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 items-start">
        <div className="bg-white border border-line rounded-lg overflow-hidden min-w-0">
          <div className="px-3 pt-2 flex items-center gap-1 border-b border-line">
            {(['cases', 'schema'] as const).map(x => (
              <button key={x} onClick={() => setTab(x)} className={cn('px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40 rounded-t-sm', tab === x ? 'border-pine text-pine' : 'border-transparent text-ink-faint hover:text-ink')}>{t(x === 'cases' ? 'tab_cases' : 'tab_schema')}</button>
            ))}
            {tab === 'cases' && search && (
              <span className="ml-auto mb-1.5 text-[11px] text-ink-faint">{t('filtering_by', { search })} · <button onClick={() => onSearch('')} className="font-semibold text-pine hover:underline cursor-pointer">{t('clear_word')}</button></span>
            )}
          </div>

          {tab === 'cases' ? (
            filtered.length === 0 ? (
              <p className="px-4 py-12 text-center text-xs text-ink-faint">{t('no_cases_yet_body')} <button onClick={onStartCase} className="font-semibold text-pine hover:underline cursor-pointer">{t('start_first_case')}</button></p>
            ) : (
              <div className="divide-y divide-line/70">
                {filtered.map(c => (
                  <div key={c.case_id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-paper">
                    <Link to={`/cases/${c.case_id}`} title={`Case #${getShortId(c)} · ${formatCaseDate(c.created_at)}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="block text-[12.5px] font-semibold truncate">{getCaseTitle(c)}</span>
                          <span className={cn('inline-block text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 shrink-0', STATUS_PILL[c.status] || 'bg-paper border border-line text-ink-soft')}>{t('case_status_' + c.status)}</span>
                        </span>
                        <span className="block text-[10px] text-ink-faint truncate">{formatCaseDate(c.created_at)} · {t('time_ago', { time: formatCompactTime(c.created_at) })} · {formatProgress(c)} · <span className="font-mono">#{getShortId(c)}</span></span>
                      </span>
                      <span className="hidden sm:block w-20 shrink-0">
                        <span role="progressbar" aria-label={t('case_progress_label')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.completion_pct ?? 0} className="block h-1 rounded bg-[#eee6d3] overflow-hidden"><span className="block h-full bg-pine" style={{ width: `${c.completion_pct ?? 0}%` }} /></span>
                        <span className="block text-[10px] text-ink-faint mt-0.5 text-right">{Math.round(c.completion_pct ?? 0)}%</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-pine shrink-0" />
                    </Link>
                    <button onClick={() => onDeleteCase(c.case_id)} aria-label={t('delete_case_aria')} className="p-1.5 rounded text-ink-faint hover:text-terracotta hover:bg-terracotta-soft opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="p-4 space-y-4">
              {template.field_groups?.map(g => (
                <div key={g.group_id}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{g.label}</p>
                  <p className="text-[11px] text-ink-faint mt-0.5">{g.description}</p>
                  <div className="mt-1.5 divide-y divide-line/60">
                    {g.field_paths.map(fp => {
                      const f = template.schema?.find(x => x.path === fp)
                      return <div key={fp} className="py-1.5 flex justify-between text-xs"><span className="font-medium">{f?.label || fp}</span><span className="text-ink-faint font-mono text-[10px]">{f?.type}{f?.required ? ` · ${t('required_word')}` : ''}</span></div>
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="bg-white border border-line rounded-lg p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">{t('schema_snapshot')}</p>
            <div className="divide-y divide-line/60">
              {template.field_groups?.map(g => <div key={g.group_id} className="py-1.5 flex justify-between text-xs"><span>{g.label}</span><b>{t('fields_count', { count: g.field_paths.length })}</b></div>)}
            </div>
            <p className="text-[11px] text-ink-faint mt-3 pt-2.5 border-t border-line/70">{t('artifacts_label')}<b className="text-ink">{(template.supported_artifacts || []).join(', ') || '—'}</b><br />Version V{template.template_version} · {t('fields_total', { count: template.schema?.length ?? 0 })}</p>
          </div>
          <div className="bg-pine-soft/50 border border-pine/15 rounded-lg p-3.5">
            <p className="text-[11px] font-semibold text-pine">{t('need_change_fields')}</p>
            <p className="text-[11px] text-ink-soft mt-1">{t('need_change_fields_desc')}</p>
            <button onClick={onViewSchema} className="text-[11px] font-bold text-pine hover:underline mt-2 cursor-pointer">{t('open_schema_preview')}</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
