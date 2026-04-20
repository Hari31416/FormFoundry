import React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FileText, ShieldAlert, History, User, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createCase, getTemplates, getCases, CaseFile } from '@/lib/api'

export default function TemplateSelection() {
  const navigate = useNavigate()
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  })

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => getCases({ limit: 50 }),
  })

  const createMutation = useMutation({
    mutationFn: createCase,
    onSuccess: (data) => {
      navigate(`/cases/${data.case_id}`)
    },
  })

  const handleCreateCase = (templateId: string, version: number) => {
    createMutation.mutate({ template_id: templateId, template_version: version })
  }

  const [expandedTemplates, setExpandedTemplates] = React.useState<Record<string, boolean>>({})

  const toggleExpand = (templateId: string) => {
    setExpandedTemplates(prev => ({
      ...prev,
      [templateId]: !prev[templateId]
    }))
  }

  const casesByTemplate = React.useMemo(() => {
    if (!cases) return {}
    return cases.reduce((acc, c) => {
      if (!acc[c.template_id]) acc[c.template_id] = []
      acc[c.template_id].push(c)
      return acc
    }, {} as Record<string, CaseFile[]>)
  }, [cases])

  const isLoading = templatesLoading || casesLoading

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <header className="mb-16 text-center max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Badge variant="outline" className="mb-6 px-4 py-1.5 text-blue-600 border-blue-100 bg-blue-50/50 rounded-full font-bold uppercase tracking-wider text-[10px]">
             Case Intake Management
          </Badge>
          <h1 className="text-5xl font-black tracking-tight text-slate-900 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
            Intake Control Center
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed">
            Select a template to launch a new intake process or resume a pre-existing case. Our AI-driven engine dynamically adapts to your selected schema.
          </p>
        </motion.div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[400px] w-full rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {templates?.map((template, idx) => {
            const templateCases = casesByTemplate[template.template_id] || []
            const isExpanded = expandedTemplates[template.template_id]
            const displayCases = isExpanded ? templateCases : templateCases.slice(0, 3)

            return (
              <motion.div
                key={template.template_id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <Card className="h-full border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col rounded-3xl overflow-hidden bg-white/80 backdrop-blur-sm group">
                  <CardHeader className="pb-4 relative">
                    <div className="absolute top-6 right-6">
                      <Badge variant="secondary" className="bg-slate-100/80 text-slate-500 text-[10px] uppercase font-bold tracking-widest px-2 py-0.5">
                        v{template.template_version}
                      </Badge>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-2xl w-fit mb-4 group-hover:bg-blue-600 transition-colors duration-300">
                      <FileText className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors duration-300" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900 leading-tight mb-1">{template.name}</CardTitle>
                    <CardDescription className="text-blue-500 font-semibold tracking-wide uppercase text-[10px]">{template.domain}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow pb-6 space-y-6">
                    <div>
                      <p className="text-[15px] text-slate-600 leading-relaxed mb-4 italic">"{template.description}"</p>
                      <div className="flex flex-wrap gap-1.5">
                        {template.supported_artifacts.map((artifact) => (
                          <Badge key={artifact} variant="secondary" className="text-[9px] font-bold text-slate-400 bg-slate-50 border-transparent">
                            {artifact.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {templateCases.length > 0 && (
                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <History className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recent Cases</span>
                          </div>
                          {templateCases.length > 3 && (
                            <button
                              onClick={() => toggleExpand(template.template_id)}
                              className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest px-2 py-1 -mr-2"
                            >
                              {isExpanded ? 'See less' : `+${templateCases.length - 3} more`}
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
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
                                  className="block p-3 rounded-xl bg-slate-50 hover:bg-white hover:ring-1 hover:ring-slate-200 transition-all group/case"
                                >
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="text-[12px] font-medium text-slate-700 truncate max-w-[120px]">
                                      {c.metadata?.subject_name || c.case_id.split('-')[0]}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-200 bg-white text-slate-500">
                                      {c.status.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatDistanceToNow(new Date(c.created_at))} ago
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      {c.created_by}
                                    </span>
                                  </div>
                                </Link>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-0 pb-6 px-6">
                    <Button
                      className="w-full h-12 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-slate-900/10 hover:shadow-blue-600/20"
                      onClick={() => handleCreateCase(template.template_id, template.template_version)}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? 'Initializing...' : 'Start New Case'}
                      {!createMutation.isPending && <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
