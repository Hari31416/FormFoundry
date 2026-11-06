import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, History, Clock, FileText, Activity, Shield, Sparkles, Eye, Trash2, MoreHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TemplateDefinition, CaseFile } from '@/lib/api'
import { getCaseTitle, formatCaseDate } from '@/lib/caseLabel'

interface TemplateCardProps {
  templateId: string
  versions: TemplateDefinition[]
  activeVersionNum: number
  onVersionChange: (version: number) => void
  templateCases: CaseFile[]
  isExpanded: boolean
  onToggleExpand: () => void
  onViewSchema: (template: TemplateDefinition) => void
  onStartCase: (templateId: string, version: number) => void
  onDeleteCase?: (caseId: string) => void
  onViewCases?: (template: TemplateDefinition) => void
  isPending: boolean
  t: (key: string, options?: any) => string
}

const DOMAIN_STYLES: Record<string, { icon: React.ReactNode; tile: string }> = {
  healthcare: { icon: <Activity className="w-5 h-5" />, tile: 'bg-pine-soft text-pine border-pine/15' },
  'public-safety': { icon: <Shield className="w-5 h-5" />, tile: 'bg-pine-soft text-pine border-pine/15' },
  safety: { icon: <Shield className="w-5 h-5" />, tile: 'bg-pine-soft text-pine border-pine/15' },
  legal: { icon: <FileText className="w-5 h-5" />, tile: 'bg-pine-soft text-pine border-pine/15' },
  custom: { icon: <Sparkles className="w-5 h-5" />, tile: 'bg-pine-soft text-pine border-pine/15' }
}

const DOMAIN_FALLBACK = { icon: <FileText className="w-5 h-5" />, tile: 'bg-pine-soft text-pine border-pine/15' }

const STATUS_DOT: Record<string, string> = {
  approved: 'bg-leaf',
  ready_for_review: 'bg-marigold-bright',
  awaiting_user: 'bg-marigold-bright',
  collecting_input: 'bg-inkblue',
  extracting: 'bg-inkblue',
  resolving: 'bg-inkblue',
  artifact_generating: 'bg-inkblue',
  completed: 'bg-leaf',
  failed: 'bg-terracotta',
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  templateId,
  versions,
  activeVersionNum,
  onVersionChange,
  templateCases,
  isExpanded,
  onToggleExpand,
  onViewSchema,
  onStartCase,
  onDeleteCase,
  onViewCases,
  isPending,
  t
}) => {
  const template = versions.find((v) => v.template_version === activeVersionNum) || versions[0]
  if (!template) return null

  const displayCases = isExpanded ? templateCases : templateCases.slice(0, 2)
  const domain = DOMAIN_STYLES[template.domain] || DOMAIN_FALLBACK
  const activeCaseCount = templateCases.filter(c => c.status !== 'approved' && c.status !== 'completed' && c.status !== 'failed').length
  const [menuOpen, setMenuOpen] = React.useState(false)

  return (
    <div className={cn(
      "card-ledger rounded-lg flex flex-col overflow-hidden group transition-shadow duration-300 hover:shadow-lg",
      templateCases.length > 0 ? 'h-full' : 'h-fit'
    )}>
      {/* Card header */}
      <div className="px-5 pt-5 pb-4 border-b border-line relative">
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          {versions.length > 1 && (
            <select
              value={activeVersionNum}
              onChange={(e) => onVersionChange(parseInt(e.target.value))}
              aria-label="Template version"
              className="appearance-none bg-paper border border-line-strong text-ink-soft font-mono text-[11px] uppercase tracking-[0.14em] pl-2 pr-6 py-1 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-pine/30"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6b66' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              {versions.map((v) => (
                <option key={v.template_version} value={v.template_version}>
                  V{v.template_version}
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="p-1.5 rounded-md text-ink-faint hover:text-pine hover:bg-paper transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-8 z-20 w-44 rounded-md border border-line bg-card-warm shadow-lg py-1 text-xs">
                <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-2 hover:bg-paper text-ink-soft cursor-pointer" onClick={() => { onViewSchema(template); setMenuOpen(false) }}>
                  <Eye className="w-3.5 h-3.5" /> View schema
                </button>
                {onViewCases && (
                  <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-2 hover:bg-paper text-ink-soft cursor-pointer" onClick={() => { onViewCases(template); setMenuOpen(false) }}>
                    <History className="w-3.5 h-3.5" /> View cases ({templateCases.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={cn("w-11 h-11 rounded-md border flex items-center justify-center mb-4", domain.tile)}>
          {domain.icon}
        </div>

        <h3 className="font-serif text-[19px] leading-snug font-semibold text-ink pr-14">
          {t('template_' + template.template_id + '_name', { defaultValue: template.name })}
        </h3>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-ink-faint mt-1">
          {template.domain}
          {activeCaseCount > 0 && <span className="ml-2 text-marigold">· {activeCaseCount} awaiting</span>}
        </p>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 flex-grow flex flex-col justify-between gap-4">
        <div className="space-y-3">
          <p className="text-[12.5px] text-ink-soft leading-relaxed">
            “{t('template_' + template.template_id + '_desc', { defaultValue: template.description })}”
          </p>
        </div>

        <div className="space-y-4">
          <Button
            className="w-full h-10 bg-pine hover:bg-pine-deep text-primary-foreground font-semibold text-xs rounded-md transition-colors shadow-press cursor-pointer"
            onClick={() => onStartCase(template.template_id, template.template_version)}
            disabled={isPending}
          >
            Start Case
            <ArrowRight className="ml-1.5 w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>

          {/* Recent Cases ledger */}
          {templateCases.length > 0 && (
            <div className="border-t border-line pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-ink-faint" />
                  <span className="font-mono text-[11px] font-medium text-ink-faint uppercase tracking-[0.2em]">{t('recent_cases')}</span>
                </div>
                {onViewCases && (
                  <button className="text-[11px] font-semibold text-pine hover:underline cursor-pointer" onClick={() => onViewCases(template)}>
                    View all ({templateCases.length})
                  </button>
                )}
              </div>
              <div className="divide-y divide-line/80">
                <AnimatePresence mode="popLayout">
                  {displayCases.map((c) => (
                    <motion.div
                      key={c.case_id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      layout
                    >
                      <Link
                        to={`/cases/${c.case_id}`}
                        className="flex items-center justify-between gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-paper transition-colors group/case"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[c.status] || 'bg-ink-faint')} />
                          <span className="text-[11px] font-medium text-ink truncate">
                            {getCaseTitle(c)}
                          </span>
                          <span className="text-[10px] text-ink-faint shrink-0">{formatCaseDate(c.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                            {t('case_status_' + c.status)}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDistanceToNow(new Date(c.created_at))}
                          </span>
                          {onDeleteCase && (
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onDeleteCase(c.case_id)
                              }}
                              className="p-1 text-ink-faint hover:text-terracotta hover:bg-terracotta-soft rounded transition-all cursor-pointer opacity-0 group-hover/case:opacity-100 focus-visible:opacity-100"
                              title="Delete Case"
                              aria-label="Delete case"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {templateCases.length > 2 && !isExpanded && (
                <button className="mt-1 text-[11px] font-semibold text-pine hover:underline cursor-pointer" onClick={onToggleExpand}>Show more</button>
              )}
              {isExpanded && templateCases.length > 2 && (
                <button className="mt-1 text-[11px] font-semibold text-pine hover:underline cursor-pointer" onClick={onToggleExpand}>Show less</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
