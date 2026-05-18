import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, History, Clock, FileText, Activity, Shield, Sparkles, Eye, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TemplateDefinition, CaseFile } from '@/lib/api'

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

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  healthcare: <Activity className="w-5 h-5" />,
  'public-safety': <Shield className="w-5 h-5" />,
  safety: <Shield className="w-5 h-5" />,
  legal: <FileText className="w-5 h-5" />,
  custom: <Sparkles className="w-5 h-5" />
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

  const displayCases = isExpanded ? templateCases : templateCases.slice(0, 3)

  return (
    <Card className={`${templateCases.length > 0 ? 'h-full' : 'h-fit'} border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col rounded-3xl overflow-hidden bg-white group border`}>
      <CardHeader className="pb-4 relative">
        {/* Version Selector Dropdown */}
        <div className="absolute top-6 right-6">
          {versions.length > 1 ? (
            <select
              value={activeVersionNum}
              onChange={(e) => onVersionChange(parseInt(e.target.value))}
              className="bg-slate-50 border border-slate-250 text-slate-700 text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg cursor-pointer focus:outline-none"
            >
              {versions.map((v) => (
                <option key={v.template_version} value={v.template_version}>
                  V{v.template_version}
                </option>
              ))}
            </select>
          ) : (
            <Badge variant="secondary" className="bg-slate-50 border border-slate-200 text-slate-500 text-[10px] uppercase font-extrabold tracking-widest px-2 py-1">
              V{template.template_version}
            </Badge>
          )}
        </div>

        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl w-fit mb-4 group-hover:bg-indigo-650 group-hover:text-white transition-all duration-300 text-indigo-600">
          {DOMAIN_ICONS[template.domain] || <FileText className="w-5 h-5" />}
        </div>

        <CardTitle className="text-xl font-black text-slate-900 leading-tight mb-1">
          {t('template_' + template.template_id + '_name', { defaultValue: template.name })}
        </CardTitle>
        <CardDescription className="text-indigo-600 font-extrabold tracking-widest uppercase text-[9px]">
          {template.domain}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-grow pb-6 space-y-6 flex flex-col justify-between">
        <div className="space-y-4">
          <p className="text-[13px] text-slate-500 leading-relaxed italic">
            "{t('template_' + template.template_id + '_desc', { defaultValue: template.description })}"
          </p>

          <div className="flex flex-wrap gap-1.5">
            {template.supported_artifacts.map((artifact) => (
              <Badge key={artifact} variant="secondary" className="text-[8px] font-black text-slate-400 bg-slate-50 border border-slate-100">
                {artifact.toUpperCase()}
              </Badge>
            ))}
            <Badge variant="outline" className="text-[8px] font-black text-indigo-500 bg-indigo-50/20 border-indigo-100">
              {template.schema?.length || 0} FIELDS
            </Badge>
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-10 border-slate-200 text-slate-700 font-extrabold text-xs rounded-xl hover:bg-slate-50 cursor-pointer"
                onClick={() => onViewSchema(template)}
              >
                <Eye className="w-4 h-4 mr-1.5 text-slate-400" /> View Schema
              </Button>
              <Button
                className="h-10 bg-slate-950 hover:bg-indigo-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer"
                onClick={() => onStartCase(template.template_id, template.template_version)}
                disabled={isPending}
              >
                Start Case
                <ArrowRight className="ml-1.5 w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
            {onViewCases && (
              <Button
                variant="secondary"
                className="w-full h-10 bg-slate-100 hover:bg-indigo-50 border border-slate-200/60 text-slate-700 hover:text-indigo-600 hover:border-indigo-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                onClick={() => onViewCases(template)}
              >
                <History className="w-4 h-4 mr-1.5 text-slate-400" /> View Cases ({templateCases.length})
              </Button>
            )}
          </div>

          {/* Recent Cases list */}
          {templateCases.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{t('recent_cases')}</span>
                </div>
                {/* {templateCases.length > 3 && onViewCases && (
                  <button
                    onClick={() => onViewCases(template)}
                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest px-2 py-1 cursor-pointer"
                  >
                    {t('more_cases', { count: templateCases.length - 3 })}
                  </button>
                )} */}
              </div>
              <div className="space-y-1.5">
                <AnimatePresence mode="popLayout">
                  {displayCases.map((c) => (
                    <motion.div
                      key={c.case_id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      layout
                    >
                      <Link
                        to={`/cases/${c.case_id}`}
                        className="block p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/25 hover:border-indigo-100 border border-transparent transition-all group/case relative"
                      >
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="text-[11px] font-black text-slate-700 truncate max-w-[140px]">
                            {c.metadata?.subject_name || c.case_id.split('-')[0]}
                          </span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 border-slate-200 bg-white text-slate-500 font-bold uppercase">
                            {t('case_status_' + c.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {t('time_ago', { time: formatDistanceToNow(new Date(c.created_at)) })}
                          </span>
                          {onDeleteCase && (
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onDeleteCase(c.case_id)
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer opacity-0 group-hover/case:opacity-100 border-none bg-transparent"
                              title="Delete Case"
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
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
