import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Edit, Database, Sparkles, Layers, Activity, Clock, Search, FileText, Settings
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  createCase, getTemplates, getCases, CaseFile,
  createTemplate, updateTemplate, deleteTemplate, deleteCase, TemplateDefinition
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { LanguageSelector } from '@/components/case/LanguageSelector'

// Modular Component Imports
import { TemplateCard } from '@/components/case/TemplateCard'
import { SchemaVisualizerDialog } from '@/components/case/SchemaVisualizerDialog'
import { TemplateVisualBuilder } from '@/components/case/TemplateVisualBuilder'
import { TemplateCasesDialog } from '@/components/case/TemplateCasesDialog'

const defaultBlankTemplate = (id: string, name: string): TemplateDefinition => ({
  template_id: id || 'custom-intake',
  template_version: 1,
  name: name || 'New Custom Intake',
  domain: 'custom',
  description: 'A dynamically configured intake workflow.',
  schema: [
    {
      path: 'subject.full_name',
      label: 'Full Name',
      type: 'string',
      required: true,
      repeated: false,
      enum_options: [],
      default_question: 'What is the full name of the subject?',
      clarification_question: 'Please enter the legal full name.',
      help_text: 'Name as listed in official documentation.'
    }
  ],
  field_groups: [
    {
      group_id: 'primary_info',
      label: 'Primary Information',
      description: 'Key identification details.',
      field_paths: ['subject.full_name']
    }
  ],
  supported_artifacts: ['json_export'],
  conversation_config: {
    tone: 'empathetic and professional',
    explanation_style: 'clear',
    reask_cooldown_turns: 1,
    max_grouped_fields: 2
  },
  renderer_config: {
    artifact_type: 'json_export',
    pdf_title: 'Custom Intake Report'
  },
  validation_rules: [
    {
      rule_id: 'required',
      type: 'requiredness'
    }
  ]
})

export default function TemplateSelection() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // Queries
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  })

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => getCases({ limit: 100 }),
  })

  // Mutations
  const createCaseMutation = useMutation({
    mutationFn: createCase,
    onSuccess: (data) => {
      navigate(`/cases/${data.case_id}`)
    },
  })

  const createTemplateMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setIsEditing(false)
      setActiveTemplate(null)
    },
    onError: (err: any) => {
      alert("Failed to create template: " + (err.response?.data?.detail || err.message))
    }
  })

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, version, data }: { id: string; version: number; data: TemplateDefinition }) =>
      updateTemplate(id, version, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setIsEditing(false)
      setActiveTemplate(null)
    },
    onError: (err: any) => {
      alert("Failed to update template: " + (err.response?.data?.detail || err.message))
    }
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => deleteTemplate(id, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (err: any) => {
      alert("Cannot delete template: " + (err.response?.data?.detail || err.message))
    }
  })

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => deleteCase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
    onError: (err: any) => {
      alert("Cannot delete case: " + (err.response?.data?.detail || err.message))
    }
  })

  const handleDeleteCase = (caseId: string) => {
    if (confirm("Are you sure you want to delete this case? All intake progress and uploaded documents will be permanently lost.")) {
      deleteCaseMutation.mutate(caseId)
    }
  }

  // Navigation / Dashboard States
  const [activeTab, setActiveTab] = React.useState<string>('intake')
  const [searchQuery, setSearchQuery] = React.useState<string>('')
  const [selectedDomain, setSelectedDomain] = React.useState<string>('all')
  const [expandedTemplates, setExpandedTemplates] = React.useState<Record<string, boolean>>({})

  // Template Version Selection States (template_id -> selected template_version)
  const [selectedVersions, setSelectedVersions] = React.useState<Record<string, number>>({})

  // Visual Schema Viewer Dialog State
  const [viewingSchemaTemplate, setViewingSchemaTemplate] = React.useState<TemplateDefinition | null>(null)
  const [viewingCasesTemplate, setViewingCasesTemplate] = React.useState<TemplateDefinition | null>(null)

  // Visual Builder / Editor State
  const [isEditing, setIsEditing] = React.useState<boolean>(false)
  const [activeTemplate, setActiveTemplate] = React.useState<TemplateDefinition | null>(null)
  const [draftTemplate, setDraftTemplate] = React.useState<TemplateDefinition>(defaultBlankTemplate('', ''))

  // Sync selected versions when templates are loaded
  React.useEffect(() => {
    if (templates && templates.length > 0) {
      const defaults: Record<string, number> = {}
      templates.forEach((t) => {
        if (defaults[t.template_id] === undefined) {
          defaults[t.template_id] = t.template_version
        }
      })
      setSelectedVersions(prev => ({ ...defaults, ...prev }))
    }
  }, [templates])

  // Group templates by unique ID to show only one card per template with a version selector
  const groupedTemplates = React.useMemo(() => {
    if (!templates) return {}
    return templates.reduce((acc, t) => {
      if (!acc[t.template_id]) {
        acc[t.template_id] = []
      }
      acc[t.template_id].push(t)
      return acc
    }, {} as Record<string, TemplateDefinition[]>)
  }, [templates])

  // Cases organized by template_id
  const casesByTemplate = React.useMemo(() => {
    if (!cases) return {}
    return cases.reduce((acc, c) => {
      if (!acc[c.template_id]) acc[c.template_id] = []
      acc[c.template_id].push(c)
      return acc
    }, {} as Record<string, CaseFile[]>)
  }, [cases])

  // Dashboard Stats Calculations
  const stats = React.useMemo(() => {
    const totalCases = cases?.length || 0
    const activeCases = cases?.filter(c => c.status !== 'approved' && c.status !== 'completed' && c.status !== 'failed').length || 0
    const uniqueTemplates = Object.keys(groupedTemplates).length || 0
    const domains = new Set(templates?.map(t => t.domain) || [])
    return {
      totalCases,
      activeCases,
      uniqueTemplates,
      domainsCount: domains.size
    }
  }, [cases, templates, groupedTemplates])

  const toggleExpand = (templateId: string) => {
    setExpandedTemplates(prev => ({
      ...prev,
      [templateId]: !prev[templateId]
    }))
  }

  const handleCreateCase = (templateId: string, version: number) => {
    createCaseMutation.mutate({
      template_id: templateId,
      template_version: version,
      metadata: { preferred_language: i18n.language }
    })
  }

  // Visual Builder Actions
  const handleStartNewTemplate = () => {
    const blank = defaultBlankTemplate('custom-intake-' + Date.now().toString().slice(-4), 'New Custom Intake')
    setDraftTemplate(blank)
    setActiveTemplate(null)
    setIsEditing(true)
  }

  const handleEditTemplate = (template: TemplateDefinition) => {
    setDraftTemplate(template)
    setActiveTemplate(template)
    setIsEditing(true)
  }

  const handleSaveTemplate = () => {
    if (!draftTemplate.template_id || !draftTemplate.name) {
      alert("Template ID and Name are required.")
      return
    }

    if (activeTemplate) {
      updateTemplateMutation.mutate({
        id: draftTemplate.template_id,
        version: draftTemplate.template_version,
        data: draftTemplate
      })
    } else {
      createTemplateMutation.mutate(draftTemplate)
    }
  }

  // Filter templates list
  const filteredTemplateIds = React.useMemo(() => {
    return Object.keys(groupedTemplates).filter(id => {
      const versions = groupedTemplates[id]
      const activeVer = selectedVersions[id] || versions[0]?.template_version
      const template = versions.find(v => v.template_version === activeVer) || versions[0]
      if (!template) return false

      const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.template_id.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesDomain = selectedDomain === 'all' || template.domain === selectedDomain

      return matchesSearch && matchesDomain
    })
  }, [groupedTemplates, searchQuery, selectedDomain, selectedVersions])

  const isLoading = templatesLoading || casesLoading

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 relative min-h-screen">
      {/* Language Selector Dropdown */}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-3">
        <LanguageSelector />
      </div>

      {isEditing ? (
        // Visual Schema Builder Workspace Component
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <TemplateVisualBuilder
            draftTemplate={draftTemplate}
            setDraftTemplate={setDraftTemplate}
            activeTemplate={activeTemplate}
            onCancel={() => setIsEditing(false)}
            onSave={handleSaveTemplate}
            isPending={createTemplateMutation.isPending || updateTemplateMutation.isPending}
          />
        </motion.div>
      ) : (
        // Main Intake Hub Landing Dashboard
        <div>
          {/* Header */}
          <header className="mb-6 text-center max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2 bg-clip-text text-transparent bg-gradient-to-r from-slate-950 via-slate-800 to-indigo-650">
                  {t('intake_control_center')}
                </h1>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xl mx-auto">
                  Select from our dynamic case templates to launch an AI-driven smart interview, or manage form schemas directly with our visual builder.
                </p>
              </motion.div>
            </header>

            {/* Unified Tabs Switcher */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col space-y-8">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <TabsList className="bg-slate-100 p-1 rounded-xl">
                  <TabsTrigger value="intake" className="font-extrabold uppercase text-xs tracking-wider px-5 py-2 cursor-pointer">
                    <Layers className="w-4 h-4 mr-2" /> Intake Hub
                  </TabsTrigger>
                  <TabsTrigger value="architect" className="font-extrabold uppercase text-xs tracking-wider px-5 py-2 cursor-pointer">
                    <Settings className="w-4 h-4 mr-2" /> Template Architect
                  </TabsTrigger>
                </TabsList>

                {activeTab === 'architect' && (
                  <Button className="bg-slate-950 hover:bg-indigo-600 font-bold rounded-xl shadow-lg cursor-pointer text-white" onClick={handleStartNewTemplate}>
                    <Plus className="w-4 h-4 mr-2" />Create Template
                  </Button>
                )}
              </div>

              {/* Content Tabs */}
              <TabsContent value="intake" className="space-y-8">
                {/* Dynamic Stats Dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {[
                    { label: 'Active Projects', value: stats.uniqueTemplates, icon: <Layers className="text-indigo-600" />, bg: 'bg-indigo-50 border-indigo-100' },
                    { label: 'Total Cases Filed', value: stats.totalCases, icon: <FileText className="text-blue-600" />, bg: 'bg-blue-50 border-blue-100' },
                    { label: 'Awaiting Actions', value: stats.activeCases, icon: <Clock className="text-amber-600" />, bg: 'bg-amber-50 border-amber-100' },
                    { label: 'Configured Domains', value: stats.domainsCount, icon: <Activity className="text-emerald-600" />, bg: 'bg-emerald-50 border-emerald-100' },
                  ].map((stat, idx) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className={cn("p-5 border rounded-2xl bg-white shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300", stat.bg)}
                    >
                      <div className="p-3 bg-white rounded-xl shadow-xs">{stat.icon}</div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{stat.label}</span>
                        <span className="text-3xl font-black text-slate-900 leading-none">{stat.value}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Filtering Controls */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white border border-slate-150 p-4 rounded-2xl shadow-sm border">
                  <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {[
                      { id: 'all', label: 'All Domains' },
                      { id: 'healthcare', label: 'Healthcare' },
                      { id: 'public-safety', label: 'Public Safety' },
                      { id: 'legal', label: 'Legal' },
                      { id: 'custom', label: 'Custom' },
                    ].map(dom => (
                      <button
                        key={dom.id}
                        onClick={() => setSelectedDomain(dom.id)}
                        className={cn(
                          "px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border-none",
                          selectedDomain === dom.id
                            ? "bg-slate-900 text-white shadow-md"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-150"
                        )}
                      >
                        {dom.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search schemas..."
                      className="pl-10 h-10 bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-[400px] w-full rounded-3xl" />
                    ))}
                  </div>
                ) : (
                    // Templates Cards Grid using Modular TemplateCard Component
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {filteredTemplateIds.map((templateId, idx) => {
                        const versions = groupedTemplates[templateId] || []
                        const activeVersionNum = selectedVersions[templateId] || versions[0]?.template_version
                        const templateCases = casesByTemplate[templateId] || []
                        const isExpanded = !!expandedTemplates[templateId]

                        return (
                          <motion.div
                            key={templateId}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: idx * 0.05 }}
                          >
                            <TemplateCard
                              templateId={templateId}
                              versions={versions}
                              activeVersionNum={activeVersionNum}
                              onVersionChange={(ver) => setSelectedVersions(prev => ({ ...prev, [templateId]: ver }))}
                              templateCases={templateCases}
                              isExpanded={isExpanded}
                              onToggleExpand={() => toggleExpand(templateId)}
                              onViewSchema={(t) => setViewingSchemaTemplate(t)}
                              onStartCase={(tId, ver) => handleCreateCase(tId, ver)}
                              onDeleteCase={handleDeleteCase}
                              onViewCases={setViewingCasesTemplate}
                              isPending={createCaseMutation.isPending}
                              t={t}
                            />
                          </motion.div>
                        )
                      })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="architect" className="space-y-6">
                {/* Template Master List */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm border">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Configured Schemas</h3>
                      <p className="text-xs text-slate-500">View and edit form fields, validation limits, and target document assets.</p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {templates?.map((t) => (
                      <div key={`${t.template_id}_v${t.template_version}`} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50/50 transition-all">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-extrabold text-slate-800 text-md">{t.name}</span>
                            <Badge variant="secondary" className="bg-indigo-50 border border-indigo-100 text-indigo-650 text-[9px] font-black uppercase">
                              V{t.template_version}
                          </Badge>
                            <Badge variant="outline" className="text-[9px] font-bold text-slate-400 border-slate-200 uppercase">
                              {t.domain}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                            <span>Code: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{t.template_id}</code></span>
                            <span>•</span>
                            <span>{t.schema?.length || 0} fields configured</span>
                            <span>•</span>
                            <span>{t.field_groups?.length || 0} section groups</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg font-bold text-xs border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                            onClick={() => handleEditTemplate(t)}
                          >
                            <Edit className="w-3.5 h-3.5 mr-1" /> Edit Layout
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg font-bold text-xs border-slate-200 text-red-500 hover:bg-red-550 hover:border-red-100 cursor-pointer"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete ${t.name} (Version ${t.template_version})?`)) {
                                deleteTemplateMutation.mutate({ id: t.template_id, version: t.template_version })
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    ))}

                    {templates?.length === 0 && (
                      <div className="p-16 text-center text-slate-400 space-y-3">
                        <Database className="w-12 h-12 text-slate-200 mx-auto" />
                        <p className="font-bold">No active form templates configured.</p>
                        <Button size="sm" className="bg-slate-900 rounded-xl" onClick={handleStartNewTemplate}>Create Custom Template</Button>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
        </div>
      )}

      {/* Visual Schema Outline Preview Pop-up */}
      <SchemaVisualizerDialog
        template={viewingSchemaTemplate}
        isOpen={!!viewingSchemaTemplate}
        onClose={() => setViewingSchemaTemplate(null)}
        onLaunchCase={handleCreateCase}
        t={t}
      />

      {/* Cases list paginated browser */}
      <TemplateCasesDialog
        template={viewingCasesTemplate}
        isOpen={!!viewingCasesTemplate}
        onClose={() => setViewingCasesTemplate(null)}
        cases={viewingCasesTemplate ? (casesByTemplate[viewingCasesTemplate.template_id] || []) : []}
        onDeleteCase={handleDeleteCase}
        t={t}
      />
    </div>
  )
}
