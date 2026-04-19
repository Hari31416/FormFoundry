import React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getTemplates, createCase } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipboardList, ArrowRight, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'

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
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center justify-center p-2 bg-slate-900 rounded-xl mb-4 text-white">
            <Sparkles className="w-6 h-6 mr-2 text-blue-400" />
            <span className="font-semibold tracking-tight uppercase text-xs">FormFoundry AI</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl mb-4">
            Start a New Case
          </h1>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto">
            Select a template below to begin the automated extraction and resolution workflow.
          </p>
        </motion.div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[280px] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates?.map((template, idx) => (
            <motion.div
              key={template.template_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
            >
              <Card className="h-full border-slate-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden group">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <ClipboardList className="w-5 h-5 text-blue-600" />
                    </div>
                    <Badge variant="secondary" className="bg-slate-200/50 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                      v{template.template_version}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
                    {template.name}
                  </CardTitle>
                  <CardDescription className="text-slate-500 font-medium">
                    {template.domain}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 flex-grow">
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {template.supported_artifacts.map((artifact) => (
                      <Badge key={artifact} variant="outline" className="text-[10px] text-slate-400 border-slate-200">
                        {artifact.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/30 border-t border-slate-100/50 pt-4">
                  <Button
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl"
                    onClick={() => handleCreateCase(template.template_id, template.template_version)}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Initializing...' : 'Begin Intake'}
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
