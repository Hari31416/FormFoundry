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
    <div className="max-w-7xl mx-auto px-6 py-16">
      <header className="mb-16 text-center max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Badge variant="outline" className="mb-6 px-4 py-1.5 text-blue-600 border-blue-100 bg-blue-50/50 rounded-full font-bold uppercase tracking-wider text-[10px]">
             Case Intake Management
          </Badge>
          <h1 className="text-5xl font-black tracking-tight text-slate-900 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
            Select a Case Template
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed">
            Choose a starting point for your new intake process. Our AI-driven engine will dynamically generate the required workflow and verification steps based on the selected schema.
          </p>
        </motion.div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {templates?.map((template, idx) => (
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
                <CardContent className="flex-grow pb-6">
                  <p className="text-[15px] text-slate-600 leading-relaxed mb-6 italic">"{template.description}"</p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.supported_artifacts.map((artifact) => (
                      <Badge key={artifact} variant="secondary" className="text-[9px] font-bold text-slate-400 bg-slate-50 border-transparent">
                        {artifact.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
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
          ))}
        </div>
      )}
    </div>
  )
}
