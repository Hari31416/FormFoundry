import React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FileText, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createCase, getTemplates } from '@/lib/api'

export default function TemplateSelection() {
  const navigate = useNavigate()
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <header className="mb-12 text-center">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 mb-4">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Government Demo Flow</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl mb-4">
            Start a New FIR Intake Case
          </h1>
          <p className="text-xl text-slate-500 max-w-3xl mx-auto">
            Choose a JSON-defined intake template. The current PoC is configured around an Indian FIR report filing workflow instead of the earlier household assistance example.
          </p>
        </motion.div>
      </header>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-900">LLM-driven intake and questioning</p>
            <p className="text-sm text-slate-600 mt-1">
              Extraction and grouped follow-up questions are generated from the selected template schema, not from a hardcoded workflow.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-[280px] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates?.map((template, idx) => (
            <motion.div
              key={template.template_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
            >
              <Card className="h-full border-slate-200/80 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden group">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <FileText className="w-5 h-5 text-amber-700" />
                    </div>
                    <Badge variant="secondary" className="bg-slate-200/70 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                      v{template.template_version}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-bold text-slate-900 leading-tight">{template.name}</CardTitle>
                  <CardDescription className="text-slate-500 font-medium">{template.domain}</CardDescription>
                </CardHeader>
                <CardContent className="pt-4 flex-grow">
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">{template.description}</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {template.supported_artifacts.map((artifact) => (
                      <Badge key={artifact} variant="outline" className="text-[10px] text-slate-500 border-slate-200">
                        {artifact.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                  <div className="rounded-xl bg-slate-950 px-4 py-3 text-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mb-2">Demo Positioning</p>
                    <p className="text-sm leading-relaxed">
                      Suitable for showing how conversational evidence collection can drive FIR report completion for Indian government workflows.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t border-slate-100 pt-4">
                  <Button
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl"
                    onClick={() => handleCreateCase(template.template_id, template.template_version)}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Initializing...' : 'Open FIR Intake'}
                    {!createMutation.isPending && <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
