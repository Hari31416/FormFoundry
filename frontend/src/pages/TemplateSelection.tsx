import React from 'react'
import { useAuth } from '@/lib/auth'
import { apiErrorMessage } from '@/lib/apiErrors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams, useLocation, Link } from 'react-router-dom'
import { Plus, Trash2, Edit, Database, Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { createCase, createTemplate, updateTemplate, deleteTemplate, deleteCase, type TemplateDefinition } from '@/lib/api'
import { useSchemaSummaries } from '@/lib/useSchemaSummaries'
import { LanguageSelector } from '@/components/case/LanguageSelector'
import AppShell from '@/components/layout/AppShell'
import OverviewView from '@/pages/views/OverviewView'
import SchemaDetailView from '@/pages/views/SchemaDetailView'
import { SchemaVisualizerDialog } from '@/components/case/SchemaVisualizerDialog'
import { TemplateVisualBuilder } from '@/components/case/TemplateVisualBuilder'
import { TemplateCasesDialog } from '@/components/case/TemplateCasesDialog'

const defaultBlankTemplate = (id: string, name: string): TemplateDefinition => ({
  template_id: id || 'custom-intake', template_version: 1, name: name || 'New Custom Intake', domain: 'custom',
  description: 'A dynamically configured intake workflow.',
  schema: [{ path: 'subject.full_name', label: 'Full Name', type: 'string', required: true, repeated: false, enum_options: [], default_question: 'What is the full name of the subject?', clarification_question: 'Please enter the legal full name.', help_text: 'Name as listed in official documentation.' }],
  field_groups: [{ group_id: 'primary_info', label: 'Primary Information', description: 'Key identification details.', field_paths: ['subject.full_name'] }],
  supported_artifacts: ['json_export'],
  conversation_config: { tone: 'empathetic and professional', explanation_style: 'clear', reask_cooldown_turns: 1, max_grouped_fields: 2 },
  renderer_config: { artifact_type: 'json_export', pdf_title: 'Custom Intake Report' },
  validation_rules: [{ rule_id: 'required', type: 'requiredness' }],
})

export default function TemplateSelection() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()
  const { templateId } = useParams<{ templateId?: string }>()
  const [searchParams] = useSearchParams()
  const filter = searchParams.get('filter')
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const [architect, setArchitect] = React.useState(false)
  const [caseSearch, setCaseSearch] = React.useState('')
  const [versionOverrides, setVersionOverrides] = React.useState<Record<string, number>>({})
  const [viewingSchema, setViewingSchema] = React.useState<TemplateDefinition | null>(null)
  const [viewingCases, setViewingCases] = React.useState<TemplateDefinition | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [activeTemplate, setActiveTemplate] = React.useState<TemplateDefinition | null>(null)
  const [draftTemplate, setDraftTemplate] = React.useState<TemplateDefinition>(() => defaultBlankTemplate('', ''))

  const { templates, cases, schemas, casesByTemplate, isLoading } = useSchemaSummaries()

  const createCaseMutation = useMutation({ mutationFn: createCase, onSuccess: (d) => navigate(`/cases/${d.case_id}`) })
  const createTemplateMutation = useMutation({ mutationFn: createTemplate, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); setIsEditing(false); setActiveTemplate(null) }, onError: (e: any) => alert(t('alert_create_template_failed', { error: apiErrorMessage(e, t('auth_save_failed')) })) })
  const updateTemplateMutation = useMutation({ mutationFn: ({ id, version, data }: any) => updateTemplate(id, version, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); setIsEditing(false); setActiveTemplate(null) }, onError: (e: any) => alert(t('alert_update_template_failed', { error: apiErrorMessage(e, t('auth_save_failed')) })) })
  const deleteTemplateMutation = useMutation({ mutationFn: ({ id, version }: any) => deleteTemplate(id, version), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }), onError: (e: any) => alert(t('alert_delete_template_failed', { error: apiErrorMessage(e, t('auth_save_failed')) })) })
  const deleteCaseMutation = useMutation({ mutationFn: deleteCase, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cases'] }), onError: (e: any) => alert(t('alert_delete_case_failed', { error: apiErrorMessage(e, t('auth_save_failed')) })) })

  const handleDeleteCase = (id: string) => { if (confirm(t('alert_delete_case_confirm'))) deleteCaseMutation.mutate(id) }
  const handleCreateCase = (tid: string, ver: number) => createCaseMutation.mutate({ template_id: tid, template_version: ver, metadata: { preferred_language: i18n.language } })
  const handleStartNewTemplate = () => { setDraftTemplate(defaultBlankTemplate('custom-intake-' + Date.now().toString().slice(-4), t('new_custom_intake'))); setActiveTemplate(null); setIsEditing(true) }
  const handleEditTemplate = (tpl: TemplateDefinition) => { setDraftTemplate(tpl); setActiveTemplate(tpl); setIsEditing(true) }
  const handleSaveTemplate = () => {
    if (!draftTemplate.template_id || !draftTemplate.name) return alert(t('alert_template_id_name_required'))
    if (activeTemplate) updateTemplateMutation.mutate({ id: draftTemplate.template_id, version: draftTemplate.template_version, data: draftTemplate })
    else createTemplateMutation.mutate(draftTemplate)
  }

  const currentSchema = templateId ? schemas.find(p => p.template.template_id === templateId) : null
  const isArchitectView = isAdmin && architect && !isEditing
  const newSchemaActive = isEditing && !activeTemplate
  const architectActive = architect || isEditing

  const handleNewSchema = () => { setArchitect(true); handleStartNewTemplate() }

  const location = useLocation()
  React.useEffect(() => {
    const state = location.state as { architect?: 'design' | 'new' } | null
    if (state?.architect === 'design') setArchitect(true)
    else if (state?.architect === 'new') handleNewSchema()
    if (state?.architect) navigate(location.pathname + location.search, { replace: true, state: null })
  }, [location.state])

  return (
    <AppShell
      onArchitect={() => { setArchitect(true); setIsEditing(false) }}
      onNewSchema={handleNewSchema}
      onNavigate={() => { setArchitect(false); setIsEditing(false); setActiveTemplate(null) }}
      architectActive={architectActive}
      newSchemaActive={newSchemaActive}
      headerBefore={templateId && !isArchitectView ? (
        <select value={templateId} onChange={e => navigate(`/schemas/${e.target.value}`)} aria-label={t('select_schema')} className="md:hidden max-w-[160px] flex-1 text-xs font-semibold border border-line rounded-md px-2 py-1.5 bg-white">
          <option value="/">{t('nav_overview')}</option>
          {schemas.map(p => <option key={p.template.template_id} value={p.template.template_id}>{p.template.name}</option>)}
        </select>
      ) : null}
      headerEnd={(
        <>
          <div className="relative w-full sm:w-56 max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
            <Input type="search" aria-label={t('search_cases_aria')} placeholder={t('search_cases_placeholder')} title={t('search_cases_title')} value={caseSearch} onChange={e => setCaseSearch(e.target.value)} className="pl-8 pr-8 h-8 text-xs bg-white w-full" />
            {caseSearch && (
              <button onClick={() => setCaseSearch('')} aria-label={t('clear_search')} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center text-[13px] text-ink-faint hover:text-ink cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/50">×</button>
            )}
          </div>
          <LanguageSelector />
        </>
      )}
    >
          {isAdmin && isEditing ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl">
              <TemplateVisualBuilder draftTemplate={draftTemplate} setDraftTemplate={setDraftTemplate} activeTemplate={activeTemplate}
                onCancel={() => setIsEditing(false)} onSave={handleSaveTemplate} isPending={createTemplateMutation.isPending || updateTemplateMutation.isPending} />
            </motion.div>
          ) : isArchitectView ? (
            <div className="space-y-3 max-w-5xl">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button onClick={() => setArchitect(false)} className="text-xs font-semibold text-pine hover:underline cursor-pointer">← {t('back_to_hub')}</button>
                <Button size="sm" className="h-8 text-xs bg-pine hover:bg-pine-deep" onClick={handleStartNewTemplate}><Plus className="w-3.5 h-3.5 mr-1.5" />{t('create_template')}</Button>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-ink">{t('template_architect')}</h1>
                <p className="text-xs text-ink-faint">{t('template_architect_desc')}</p>
              </div>
              {templates?.length === 0 && !isLoading ? (
                <div className="bg-white border border-line rounded-lg p-12 text-center space-y-3">
                  <Database className="w-6 h-6 mx-auto text-ink-faint" /><p className="text-sm font-semibold">{t('no_templates_yet')}</p>
                  <Button size="sm" className="bg-pine hover:bg-pine-deep" onClick={handleStartNewTemplate}>{t('create_custom_template')}</Button>
                </div>
              ) : (
                <div className="bg-white border border-line rounded-lg divide-y divide-line/70 overflow-hidden">
                  {templates?.map(tpl => (
                    <div key={`${tpl.template_id}_v${tpl.template_version}`} className="px-4 py-2.5 flex flex-wrap items-center gap-3 hover:bg-paper">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold truncate">{tpl.name}</span>
                        <span className="block text-[10px] text-ink-faint font-mono">{tpl.template_id} · V{tpl.template_version} · {tpl.domain} · {t('fields_count', { count: tpl.schema?.length ?? 0 })}</span>
                      </span>
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => handleEditTemplate(tpl)}><Edit className="w-3 h-3 mr-1" />{t('edit')}</Button>
                      <Button variant="outline" size="sm" className="h-7 text-[11px] text-terracotta hover:bg-terracotta-soft" onClick={() => confirm(t('alert_delete_template_confirm', { name: tpl.name, version: tpl.template_version })) && deleteTemplateMutation.mutate({ id: tpl.template_id, version: tpl.template_version })}><Trash2 className="w-3 h-3 mr-1" />{t('delete')}</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 max-w-5xl"><Skeleton className="h-64 rounded-lg" /><Skeleton className="h-64 rounded-lg hidden lg:block" /></div>
          ) : currentSchema ? (
            <SchemaDetailView
              template={currentSchema.template}
              versions={currentSchema.versions}
              activeVersion={versionOverrides[currentSchema.template.template_id] || currentSchema.template.template_version}
              onVersionChange={(v) => setVersionOverrides(p => ({ ...p, [currentSchema.template.template_id]: v }))}
              cases={casesByTemplate[currentSchema.template.template_id] || []}
              search={caseSearch}
              onSearch={setCaseSearch}
              onStartCase={() => handleCreateCase(currentSchema.template.template_id, versionOverrides[currentSchema.template.template_id] || currentSchema.template.template_version)}
              onViewSchema={() => setViewingSchema(currentSchema.template)}
              onDeleteCase={handleDeleteCase}
              isPending={createCaseMutation.isPending}
              t={t}
            />
          ) : templateId ? (
            <div className="max-w-md mx-auto mt-16 text-center space-y-3">
              <p className="font-serif text-xl font-semibold">{t('schema_not_found')}</p>
              <p className="text-xs text-ink-faint">{t('schema_not_found_desc')}</p>
              <Link to="/" className="text-xs font-semibold text-pine hover:underline">{t('back_to_overview')} →</Link>
            </div>
          ) : (
            <OverviewView templates={templates || []} cases={cases || []} filter={filter} search={caseSearch} t={t} />
          )}

      <SchemaVisualizerDialog template={viewingSchema} isOpen={!!viewingSchema} onClose={() => setViewingSchema(null)} onLaunchCase={handleCreateCase} t={t} />
      <TemplateCasesDialog template={viewingCases} isOpen={!!viewingCases} onClose={() => setViewingCases(null)} cases={viewingCases ? (casesByTemplate[viewingCases.template_id] || []) : []} onDeleteCase={handleDeleteCase} t={t} />
    </AppShell>
  )
}
