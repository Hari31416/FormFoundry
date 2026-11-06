import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Database, Layers, Workflow, Sparkles, FileJson, X, Check, Plus, Trash2, Edit,
  HelpCircle, RefreshCw, FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TemplateDefinition, TemplateField, TemplateFieldGroup } from '@/lib/api'

interface TemplateVisualBuilderProps {
  draftTemplate: TemplateDefinition
  setDraftTemplate: React.Dispatch<React.SetStateAction<TemplateDefinition>>
  activeTemplate: TemplateDefinition | null
  onCancel: () => void
  onSave: () => void
  isPending: boolean
}

export const TemplateVisualBuilder: React.FC<TemplateVisualBuilderProps> = ({
  draftTemplate,
  setDraftTemplate,
  activeTemplate,
  onCancel,
  onSave,
  isPending
}) => {
  const { t } = useTranslation()
  const [builderTab, setBuilderTab] = React.useState<'metadata' | 'fields' | 'groups' | 'ai' | 'json'>('metadata')
  const [jsonText, setJsonText] = React.useState<string>('')
  const [isAddingGroup, setIsAddingGroup] = React.useState<boolean>(false)

  // Field inline editor state
  const [editingFieldIdx, setEditingFieldIdx] = React.useState<number | null>(null)
  const [fieldForm, setFieldForm] = React.useState<TemplateField>({
    path: '',
    label: '',
    type: 'string',
    required: false,
    repeated: false,
    enum_options: [],
    default_question: '',
    clarification_question: '',
    help_text: '',
    validation_refs: [],
    calculation: '',
    conditions: {}
  })
  const [newEnumOption, setNewEnumOption] = React.useState<string>('')
  const [newValidationRef, setNewValidationRef] = React.useState<string>('')

  // Sub-field inline editor state
  const [editingSubFieldIdx, setEditingSubFieldIdx] = React.useState<number | null>(null)
  const [subFieldForm, setSubFieldForm] = React.useState<TemplateField | null>(null)

  React.useEffect(() => {
    setJsonText(JSON.stringify(draftTemplate, null, 2))
  }, [draftTemplate])

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonText)
      if (!parsed.template_id || !parsed.name || !parsed.schema) {
        alert(t('alert_invalid_schema_structure'))
        return
      }
      setDraftTemplate(parsed)
      alert(t('alert_json_applied'))
    } catch (err: any) {
      alert(t('alert_json_syntax_error', { error: err.message }))
    }
  }

  // Field Schema Visual Builder Helpers
  const startFieldEdit = (idx: number) => {
    setEditingFieldIdx(idx)
    const field = draftTemplate.schema[idx]
    setFieldForm({
      ...field,
      validation_refs: field.validation_refs || [],
      calculation: field.calculation || '',
      conditions: field.conditions || {}
    })
  }

  const saveFieldForm = () => {
    if (!fieldForm.path || !fieldForm.label) {
      alert(t('alert_field_json_label_required'))
      return
    }

    const updatedSchema = [...draftTemplate.schema]

    // Auto populate questions if blank
    const updatedField = {
      ...fieldForm,
      default_question: fieldForm.default_question || t('auto_question_default', { label: fieldForm.label.toLowerCase() }),
      clarification_question: fieldForm.clarification_question || t('auto_question_clarification', { label: fieldForm.label.toLowerCase() }),
      calculation: fieldForm.calculation?.trim() || null,
      validation_refs: fieldForm.validation_refs || [],
      conditions: fieldForm.conditions && Object.keys(fieldForm.conditions).length > 0 ? fieldForm.conditions : undefined
    }

    updatedSchema[editingFieldIdx!] = updatedField

    setDraftTemplate(prev => ({
      ...prev,
      schema: updatedSchema
    }))
    setEditingFieldIdx(null)
  }

  const deleteField = (idx: number) => {
    const pathToDelete = draftTemplate.schema[idx].path
    const updatedSchema = draftTemplate.schema.filter((_, i) => i !== idx)

    // Also remove from field groups
    const updatedGroups = draftTemplate.field_groups.map(group => ({
      ...group,
      field_paths: group.field_paths.filter(p => p !== pathToDelete)
    }))

    setDraftTemplate(prev => ({
      ...prev,
      schema: updatedSchema,
      field_groups: updatedGroups
    }))
  }

  const startFieldAdd = () => {
    const newField: TemplateField = {
      path: '',
      label: '',
      type: 'string',
      required: false,
      repeated: false,
      enum_options: [],
      default_question: '',
      clarification_question: '',
      help_text: '',
      validation_refs: [],
      calculation: '',
      conditions: {}
    }
    setEditingFieldIdx(draftTemplate.schema.length)
    setFieldForm(newField)
  }

  const addEnumOption = () => {
    if (!newEnumOption.trim()) return
    if (fieldForm.enum_options?.includes(newEnumOption.trim())) return
    setFieldForm(prev => ({
      ...prev,
      enum_options: [...(prev.enum_options || []), newEnumOption.trim()]
    }))
    setNewEnumOption('')
  }

  const removeEnumOption = (opt: string) => {
    setFieldForm(prev => ({
      ...prev,
      enum_options: (prev.enum_options || []).filter(o => o !== opt)
    }))
  }

  const addValidationRef = () => {
    if (!newValidationRef.trim()) return
    if (fieldForm.validation_refs?.includes(newValidationRef.trim())) return
    setFieldForm(prev => ({
      ...prev,
      validation_refs: [...(prev.validation_refs || []), newValidationRef.trim()]
    }))
    setNewValidationRef('')
  }

  const removeValidationRef = (ref: string) => {
    setFieldForm(prev => ({
      ...prev,
      validation_refs: (prev.validation_refs || []).filter(r => r !== ref)
    }))
  }

  // Nested sub-schema helper actions
  const startSubFieldAdd = () => {
    const parentPath = fieldForm.path ? `${fieldForm.path}.` : ''
    setEditingSubFieldIdx((fieldForm.schema || []).length)
    setSubFieldForm({
      path: parentPath,
      label: '',
      type: 'string',
      required: false,
      repeated: false,
      enum_options: [],
      default_question: '',
      clarification_question: '',
      help_text: '',
      validation_refs: [],
      calculation: '',
      conditions: {}
    })
  }

  const startSubFieldEdit = (idx: number) => {
    setEditingSubFieldIdx(idx)
    const subField = (fieldForm.schema || [])[idx]
    setSubFieldForm({
      ...subField,
      enum_options: subField.enum_options || [],
      validation_refs: subField.validation_refs || [],
      conditions: subField.conditions || {}
    })
  }

  const saveSubFieldForm = () => {
    if (!subFieldForm || !subFieldForm.path || !subFieldForm.label) {
      alert(t('alert_subfield_required'))
      return
    }

    const currentSchema = [...(fieldForm.schema || [])]
    const updatedSubField = {
      ...subFieldForm,
      default_question: subFieldForm.default_question || t('auto_question_default', { label: subFieldForm.label.toLowerCase() }),
      clarification_question: subFieldForm.clarification_question || t('auto_question_clarification', { label: subFieldForm.label.toLowerCase() }),
    }

    currentSchema[editingSubFieldIdx!] = updatedSubField

    setFieldForm(prev => ({
      ...prev,
      schema: currentSchema
    }))
    setEditingSubFieldIdx(null)
    setSubFieldForm(null)
  }

  const deleteSubField = (idx: number) => {
    const currentSchema = (fieldForm.schema || []).filter((_, i) => i !== idx)
    setFieldForm(prev => ({
      ...prev,
      schema: currentSchema
    }))
  }

  const reorderSubField = (idx: number, direction: 'up' | 'down') => {
    const currentSchema = [...(fieldForm.schema || [])]
    if (direction === 'up' && idx > 0) {
      const temp = currentSchema[idx]
      currentSchema[idx] = currentSchema[idx - 1]
      currentSchema[idx - 1] = temp
    } else if (direction === 'down' && idx < currentSchema.length - 1) {
      const temp = currentSchema[idx]
      currentSchema[idx] = currentSchema[idx + 1]
      currentSchema[idx + 1] = temp
    }
    setFieldForm(prev => ({
      ...prev,
      schema: currentSchema
    }))
  }

  // Field Groups Mapping Helpers
  const addFieldGroup = () => {
    setIsAddingGroup(true)
    setTimeout(() => setIsAddingGroup(false), 1000)

    const gId = 'group_' + Date.now().toString().slice(-4)
    const newGroup: TemplateFieldGroup = {
      group_id: gId,
      label: t('new_section_group'),
      description: t('section_description_default'),
      field_paths: []
    }
    setDraftTemplate(prev => ({
      ...prev,
      field_groups: [newGroup, ...prev.field_groups]
    }))
  }

  const deleteFieldGroup = (idx: number) => {
    setDraftTemplate(prev => ({
      ...prev,
      field_groups: prev.field_groups.filter((_, i) => i !== idx)
    }))
  }

  const updateFieldGroupText = (idx: number, key: keyof TemplateFieldGroup, val: string) => {
    const updated = [...draftTemplate.field_groups]
    updated[idx] = {
      ...updated[idx],
      [key]: val
    }
    setDraftTemplate(prev => ({
      ...prev,
      field_groups: updated
    }))
  }

  const toggleFieldInGroup = (groupIdx: number, fieldPath: string) => {
    const updated = [...draftTemplate.field_groups]
    const group = updated[groupIdx]
    const paths = group.field_paths.includes(fieldPath)
      ? group.field_paths.filter(p => p !== fieldPath)
      : [...group.field_paths, fieldPath]
    updated[groupIdx] = { ...group, field_paths: paths }

    setDraftTemplate(prev => ({
      ...prev,
      field_groups: updated
    }))
  }

  return (
    <div className="card-ledger rounded-lg overflow-hidden min-h-[600px] flex flex-col">
      <div className="p-6 bg-paper border-b border-line flex justify-between items-center">
        <div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-pine">{t('template_architect')}</span>
          <h2 className="font-serif text-2xl font-semibold text-ink">{activeTemplate ? t('edit_schema_layout') : t('create_custom_schema')}</h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-line-strong text-ink-soft hover:bg-card-warm hover:text-ink" onClick={onCancel}>
            <X className="w-4 h-4 mr-2" /> {t('cancel')}
          </Button>
          <Button className="bg-pine hover:bg-pine-deep font-semibold shadow-none text-primary-foreground" onClick={onSave} disabled={isPending}>
            <Check className="w-4 h-4 mr-2" /> {isPending ? t('saving') : t('save_template_config')}
          </Button>
        </div>
      </div>

      <div className="flex border-b border-line bg-card-warm px-4 gap-1">
        {[
          { id: 'metadata', label: t('builder_tab_metadata'), icon: <span className="p-1 rounded-sm bg-leaf-soft text-leaf"><Database className="w-3.5 h-3.5" /></span> },
          { id: 'fields', label: t('builder_tab_fields'), icon: <span className="p-1 rounded-sm bg-inkblue-soft text-inkblue"><Layers className="w-3.5 h-3.5" /></span> },
          { id: 'groups', label: t('builder_tab_groups'), icon: <span className="p-1 rounded-sm bg-marigold-soft text-marigold"><Workflow className="w-3.5 h-3.5" /></span> },
          { id: 'ai', label: t('builder_tab_ai'), icon: <span className="p-1 rounded-sm bg-pine-soft text-pine"><Sparkles className="w-3.5 h-3.5" /></span> },
          { id: 'json', label: t('builder_tab_json'), icon: <span className="p-1 rounded-sm bg-paper text-ink-faint border border-line"><FileJson className="w-3.5 h-3.5" /></span> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === 'json') {
                setJsonText(JSON.stringify(draftTemplate, null, 2))
              }
              setBuilderTab(tab.id as any)
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[11px] font-mono font-semibold uppercase tracking-[0.16em] transition-colors cursor-pointer border-b-2 -mb-px",
              builderTab === tab.id
                ? "border-pine text-pine"
                : "border-transparent text-ink-faint hover:text-ink-soft"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-grow p-6">
        {builderTab === 'metadata' && (
          <div className="max-w-2xl space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('template_id_label')}</label>
                <Input
                  disabled={!!activeTemplate}
                  value={draftTemplate.template_id}
                  onChange={e => setDraftTemplate(prev => ({ ...prev, template_id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') }))}
                  placeholder={t('ph_template_id')}
                  className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('template_version_label')}</label>
                <Input
                  type="number"
                  disabled={!!activeTemplate}
                  value={draftTemplate.template_version}
                  onChange={e => setDraftTemplate(prev => ({ ...prev, template_version: parseInt(e.target.value) || 1 }))}
                  placeholder={t('ph_template_version')}
                  className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('template_name_label')}</label>
              <Input
                value={draftTemplate.name}
                onChange={e => setDraftTemplate(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('ph_template_name')}
                className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="case-title-pattern" className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('case_title_pattern')}</label>
              <Input id="case-title-pattern" value={draftTemplate.conversation_config?.title_pattern || ''} maxLength={200}
                onChange={e => setDraftTemplate(prev => ({ ...prev, conversation_config: { ...prev.conversation_config, title_pattern: e.target.value } }))}
                placeholder={draftTemplate.schema.slice(0, 2).map(field => `{${field.path}}`).join(' · ')}
                aria-describedby="case-title-pattern-help" className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25" />
              <p id="case-title-pattern-help" className="text-xs text-ink-soft">{t('case_title_pattern_help')}</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('domain_label')}</label>
                <select
                  value={draftTemplate.domain}
                  onChange={e => setDraftTemplate(prev => ({ ...prev, domain: e.target.value }))}
                  className="w-full h-11 px-3 bg-card-warm border border-line rounded-md text-ink focus:outline-none focus:ring-1 focus:ring-pine/25"
                >
                  <option value="custom">{t('domain_custom')}</option>
                  <option value="healthcare">{t('domain_healthcare')}</option>
                  <option value="public-safety">{t('domain_public_safety')}</option>
                  <option value="legal">{t('domain_legal')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('supported_formats_label')}</label>
                <div className="flex gap-4 items-center h-11">
                  {['json_export', 'pdf'].map(artifact => (
                    <label key={artifact} className="flex items-center gap-2 text-sm font-semibold text-ink-soft cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftTemplate.supported_artifacts.includes(artifact)}
                        onChange={e => {
                          const active = draftTemplate.supported_artifacts
                          const updated = e.target.checked
                            ? [...active, artifact]
                            : active.filter(x => x !== artifact)
                          setDraftTemplate(prev => ({ ...prev, supported_artifacts: updated }))
                        }}
                        className="rounded border-line text-pine focus:ring-pine/40"
                      />
                      {artifact.toUpperCase().replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('description_label')}</label>
              <Textarea
                value={draftTemplate.description}
                onChange={e => setDraftTemplate(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('ph_description')}
                className="min-h-24 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
              />
            </div>

            {draftTemplate.supported_artifacts.includes('pdf') && (
              <div className="p-4 bg-paper border border-line rounded-md space-y-4">
                <span className="text-sm font-semibold text-ink flex items-center gap-2">
                  <FileText className="w-4 h-4 text-pine" /> {t('pdf_assembly_config')}
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink-soft">{t('pdf_title_label')}</label>
                    <Input
                      value={draftTemplate.renderer_config?.pdf_title || ''}
                      onChange={e => setDraftTemplate(prev => ({
                        ...prev,
                        renderer_config: { ...(prev.renderer_config || {}), pdf_title: e.target.value }
                      }))}
                      placeholder={t('ph_pdf_title')}
                      className="h-10 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink-soft">{t('template_pdf_path_label')}</label>
                    <Input
                      value={draftTemplate.renderer_config?.template_asset || ''}
                      onChange={e => setDraftTemplate(prev => ({
                        ...prev,
                        renderer_config: { ...(prev.renderer_config || {}), template_asset: e.target.value }
                      }))}
                      placeholder={t('ph_template_pdf_path')}
                      className="h-10 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {builderTab === 'fields' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Fields List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[11px] font-semibold text-ink-soft uppercase tracking-[0.16em]">{draftTemplate.schema.length} {t('field_nodes_configured', { count: draftTemplate.schema.length })}</span>
                <Button variant="outline" className="border-dashed border-line text-ink-faint rounded-md font-semibold hover:text-pine hover:border-pine" onClick={startFieldAdd}>
                  <Plus className="w-4 h-4 mr-2" /> {t('add_field_node')}
                </Button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {draftTemplate.schema.map((field, idx) => (
                  <div key={idx} className={cn(
                    "p-3.5 border rounded-md flex justify-between items-start transition-all",
                    editingFieldIdx === idx ? "border-inkblue bg-inkblue-soft/50 shadow-sm" : "border-line bg-card-warm hover:border-line-strong"
                  )}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-ink">{field.label}</span>
                        <Badge variant="outline" className="font-mono text-[11px] uppercase font-semibold text-ink-faint border-line">{field.type}</Badge>
                        {field.required && <Badge className="font-mono text-[11px] uppercase font-semibold bg-terracotta-soft text-terracotta border border-terracotta/20">{t('required_badge')}</Badge>}
                        {field.repeated && <Badge className="font-mono text-[11px] uppercase font-semibold bg-marigold-soft text-marigold border border-marigold/20">{t('list_badge')}</Badge>}
                        {field.type === 'object' && (
                          <Badge className="font-mono text-[11px] uppercase font-semibold bg-inkblue-soft text-inkblue border border-inkblue/20">
                            {t('properties_count', { count: field.schema?.length || 0 })}
                          </Badge>
                        )}
                        {field.type === 'list_of_objects' && (
                          <Badge className="font-mono text-[11px] uppercase font-semibold bg-inkblue-soft text-inkblue border border-inkblue/20">
                            {t('list_of_properties', { count: field.schema?.length || 0 })}
                          </Badge>
                        )}
                      </div>
                      <code className="text-[11px] font-mono text-ink-soft bg-paper border border-line px-1.5 py-0.5 rounded inline-block mb-2">{field.path}</code>
                      <p className="text-xs text-ink-soft">{field.help_text || t('no_description_help')}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startFieldEdit(idx)} className="p-2 text-ink-faint hover:text-pine hover:bg-paper rounded-md cursor-pointer border-none">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteField(idx)} className="p-2 text-ink-faint hover:text-terracotta hover:bg-terracotta-soft rounded-md cursor-pointer border-none">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Field Inline Editor Panel */}
            <div className="card-ledger rounded-lg p-6 h-fit">
              {editingFieldIdx !== null ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-line">
                    <span className="font-serif font-semibold text-ink">
                      {editingFieldIdx === draftTemplate.schema.length ? t('add_field') : t('edit_field_properties')}
                    </span>
                    <button onClick={() => setEditingFieldIdx(null)} className="p-1 rounded-md text-ink-faint hover:bg-paper cursor-pointer border-none bg-transparent">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em]">{t('json_path_label')}</label>
                      <Input
                        value={fieldForm.path}
                        onChange={e => setFieldForm(prev => ({ ...prev, path: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                        placeholder={t('ph_json_path')}
                        className="h-10 bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em]">{t('field_label_label')}</label>
                      <Input
                        value={fieldForm.label}
                        onChange={e => setFieldForm(prev => ({ ...prev, label: e.target.value }))}
                        placeholder={t('ph_field_label')}
                        className="h-10 bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em]">{t('field_data_type_label')}</label>
                      <select
                        value={fieldForm.type}
                        onChange={e => setFieldForm(prev => {
                          const type = e.target.value as any
                          const schema = (type === 'object' || type === 'list_of_objects') ? (prev.schema || []) : undefined
                          const enum_options = type === 'enum' ? (prev.enum_options || []) : []
                          return { ...prev, type, schema, enum_options }
                        })}
                        className="w-full h-10 px-3 bg-card-warm border border-line rounded-md text-ink focus:outline-none focus:ring-1 focus:ring-pine/25"
                      >
                        <option value="string">{t('type_string')}</option>
                        <option value="date">{t('type_date')}</option>
                        <option value="enum">{t('type_enum')}</option>
                        <option value="boolean">{t('type_boolean')}</option>
                        <option value="integer">{t('type_integer')}</option>
                        <option value="number">{t('type_number')}</option>
                        <option value="object">{t('type_object')}</option>
                        <option value="list_of_objects">{t('type_list_of_objects')}</option>
                      </select>
                    </div>
                    <div className="flex gap-4 items-center h-16 pt-3">
                      <label className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fieldForm.required}
                          onChange={e => setFieldForm(prev => ({ ...prev, required: e.target.checked }))}
                          className="rounded border-line text-pine focus:ring-pine/40"
                        />
                        {t('required_badge')}
                      </label>
                      <label className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fieldForm.repeated}
                          onChange={e => setFieldForm(prev => ({ ...prev, repeated: e.target.checked }))}
                          className="rounded border-line text-pine focus:ring-pine/40"
                        />
                        {t('is_list')}
                      </label>
                    </div>
                  </div>

                  {fieldForm.type === 'enum' && (
                    <div className="p-3 bg-paper border border-line rounded-md space-y-2">
                      <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em] block">{t('enum_options_label')}</label>
                      <div className="flex gap-2">
                        <Input
                          value={newEnumOption}
                          onChange={e => setNewEnumOption(e.target.value)}
                          placeholder={t('ph_enum_option')}
                          className="h-8 bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                          onKeyDown={e => e.key === 'Enter' && addEnumOption()}
                        />
                        <Button size="sm" variant="secondary" className="h-8 rounded-md font-semibold" onClick={addEnumOption}>{t('add_button')}</Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {fieldForm.enum_options?.map(opt => (
                          <Badge key={opt} variant="secondary" className="bg-paper hover:bg-line text-ink-soft border border-line flex items-center gap-1.5 py-0.5 px-2">
                            {opt}
                            <X className="w-3 h-3 text-ink-faint hover:text-ink cursor-pointer" onClick={() => removeEnumOption(opt)} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {(fieldForm.type === 'object' || fieldForm.type === 'list_of_objects') && (
                    <div className="p-4 bg-paper border border-line rounded-md space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-line">
                        <div>
                          <label className="font-mono text-[11px] font-semibold text-ink uppercase tracking-[0.16em] block">{t('nested_properties_schema')}</label>
                          <span className="text-[11px] text-ink-faint">{t('nested_properties_desc')}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          className="h-7 text-[11px] font-semibold rounded-md border-dashed border-line text-ink-faint hover:text-pine hover:border-pine"
                          onClick={startSubFieldAdd}
                        >
                          <Plus className="w-3 h-3 mr-1" /> {t('add_property')}
                        </Button>
                      </div>

                      {/* Sub-field list */}
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {(fieldForm.schema || []).map((sub, sIdx) => (
                          <div key={sIdx} className="flex justify-between items-center p-2 bg-card-warm rounded-md border border-line text-xs">
                            <div className="min-w-0 flex-grow pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-ink truncate">{sub.label}</span>
                                <Badge variant="outline" className="font-mono text-[11px] px-1 py-0 border-line text-ink-faint uppercase font-semibold">{sub.type}</Badge>
                                {sub.required && <Badge className="font-mono text-[7px] uppercase font-semibold bg-terracotta-soft text-terracotta border border-terracotta/20 py-0 px-1">{t('req_badge')}</Badge>}
                              </div>
                              <code className="text-[11px] font-mono text-ink-soft truncate block">{sub.path}</code>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={sIdx === 0}
                                onClick={() => reorderSubField(sIdx, 'up')}
                                className="p-1 text-ink-faint hover:text-ink hover:bg-paper rounded disabled:opacity-30 cursor-pointer border-none bg-transparent"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={sIdx === (fieldForm.schema || []).length - 1}
                                onClick={() => reorderSubField(sIdx, 'down')}
                                className="p-1 text-ink-faint hover:text-ink hover:bg-paper rounded disabled:opacity-30 cursor-pointer border-none bg-transparent"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => startSubFieldEdit(sIdx)}
                                className="p-1 text-ink-faint hover:text-pine hover:bg-paper rounded cursor-pointer border-none bg-transparent"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSubField(sIdx)}
                                className="p-1 text-ink-faint hover:text-terracotta hover:bg-terracotta-soft rounded cursor-pointer border-none bg-transparent"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(!fieldForm.schema || fieldForm.schema.length === 0) && (
                          <div className="text-center py-4 text-ink-faint italic text-[11px]">
                            {t('no_subfields')}
                          </div>
                        )}
                      </div>

                      {/* Inline Sub-field Editor Dialog/Panel */}
                      {subFieldForm && (
                        <div className="p-3 border border-inkblue/20 bg-inkblue-soft/40 rounded-md space-y-3 mt-2">
                          <div className="flex justify-between items-center pb-1 border-b border-inkblue/15">
                            <span className="font-mono text-[11px] font-semibold text-inkblue uppercase">
                              {editingSubFieldIdx === (fieldForm.schema || []).length ? t('add_sub_field') : t('edit_sub_field')}
                            </span>
                            <button
                              type="button"
                              onClick={() => { setSubFieldForm(null); setEditingSubFieldIdx(null); }}
                              className="text-ink-faint hover:text-ink border-none bg-transparent cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase">{t('sub_path_label')}</label>
                              <Input
                                value={subFieldForm.path}
                                onChange={e => setSubFieldForm(prev => prev ? ({ ...prev, path: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }) : null)}
                                placeholder={t('ph_sub_path')}
                                className="h-7 text-xs bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase">{t('label_label')}</label>
                              <Input
                                value={subFieldForm.label}
                                onChange={e => setSubFieldForm(prev => prev ? ({ ...prev, label: e.target.value }) : null)}
                                placeholder={t('ph_sub_label')}
                                className="h-7 text-xs bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase">{t('type_label')}</label>
                              <select
                                value={subFieldForm.type}
                                onChange={e => setSubFieldForm(prev => prev ? ({ ...prev, type: e.target.value as any, enum_options: e.target.value === 'enum' ? prev.enum_options || [] : [] }) : null)}
                                className="w-full h-7 px-1.5 bg-card-warm border border-line rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-pine/25"
                              >
                                <option value="string">{t('type_string')}</option>
                                <option value="date">{t('type_date')}</option>
                                <option value="enum">{t('type_enum_short')}</option>
                                <option value="boolean">{t('type_boolean')}</option>
                                <option value="integer">{t('type_integer_short')}</option>
                                <option value="number">{t('type_number')}</option>
                                <option value="object">{t('type_object_short')}</option>
                                <option value="list_of_objects">{t('type_list_of_objects')}</option>
                              </select>
                            </div>
                            <div className="flex items-center pt-3 pl-2">
                              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={subFieldForm.required}
                                  onChange={e => setSubFieldForm(prev => prev ? ({ ...prev, required: e.target.checked }) : null)}
                                  className="rounded border-line text-pine"
                                />
                                {t('required_badge')}
                              </label>
                            </div>
                          </div>

                          {subFieldForm.type === 'enum' && (
                            <div className="space-y-1.5">
                              <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase block">{t('enum_options_label')}</label>
                              <div className="flex gap-1">
                                <Input
                                  value={newEnumOption}
                                  onChange={e => setNewEnumOption(e.target.value)}
                                  placeholder={t('ph_sub_enum')}
                                  className="h-6 text-[11px] bg-card-warm border-line rounded focus-visible:ring-pine/25"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (newEnumOption.trim() && !subFieldForm.enum_options?.includes(newEnumOption.trim())) {
                                        setSubFieldForm(prev => prev ? ({ ...prev, enum_options: [...(prev.enum_options || []), newEnumOption.trim()] }) : null);
                                        setNewEnumOption('');
                                      }
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-6 text-[11px] px-2 rounded-md font-semibold"
                                  onClick={() => {
                                    if (newEnumOption.trim() && !subFieldForm.enum_options?.includes(newEnumOption.trim())) {
                                      setSubFieldForm(prev => prev ? ({ ...prev, enum_options: [...(prev.enum_options || []), newEnumOption.trim()] }) : null);
                                      setNewEnumOption('');
                                    }
                                  }}
                                >
                                  {t('add_button')}
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-1 pt-1">
                                {subFieldForm.enum_options?.map(opt => (
                                  <Badge key={opt} variant="secondary" className="bg-paper border border-line text-ink-soft flex items-center gap-1.5 py-0.5 px-2 text-[11px]">
                                    {opt}
                                    <X
                                      className="w-2.5 h-2.5 text-ink-faint hover:text-ink cursor-pointer"
                                      onClick={() => setSubFieldForm(prev => prev ? ({ ...prev, enum_options: (prev.enum_options || []).filter(o => o !== opt) }) : null)}
                                    />
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Subfield sub-schema (recursive info) */}
                          {(subFieldForm.type === 'object' || subFieldForm.type === 'list_of_objects') && (
                            <div className="p-2 border border-dashed border-inkblue/25 rounded-md bg-inkblue-soft/30 text-[11px] text-inkblue">
                              {t('nested_subfield_note')}
                            </div>
                          )}

                          <Button
                            size="sm"
                            type="button"
                            className="w-full h-8 bg-pine hover:bg-pine-deep text-primary-foreground font-semibold rounded-md text-xs"
                            onClick={saveSubFieldForm}
                          >
                            {t('save_sub_property')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dynamic Validation Support (Rank 1) */}
                  <div className="p-3 bg-paper border border-line rounded-md space-y-2">
                    <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em] block">{t('validation_rules_label')}</label>
                    <div className="flex gap-2">
                      <Input
                        value={newValidationRef}
                        onChange={e => setNewValidationRef(e.target.value)}
                        placeholder={t('ph_validation_ref')}
                        className="h-8 bg-card-warm border-line rounded-md text-xs focus-visible:ring-pine/25"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addValidationRef();
                          }
                        }}
                      />
                      <Button size="sm" variant="secondary" className="h-8 rounded-md font-semibold text-xs" onClick={addValidationRef}>{t('add_button')}</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {fieldForm.validation_refs?.map(ref => (
                        <Badge key={ref} variant="secondary" className="bg-paper hover:bg-line border border-line text-ink-soft flex items-center gap-1.5 py-0.5 px-2 text-xs">
                          {ref}
                          <X className="w-3 h-3 text-ink-faint hover:text-ink cursor-pointer" onClick={() => removeValidationRef(ref)} />
                        </Badge>
                      ))}
                      {(!fieldForm.validation_refs || fieldForm.validation_refs.length === 0) && (
                        <span className="text-[11px] text-ink-faint font-semibold italic">{t('no_custom_rules')}</span>
                      )}
                    </div>
                  </div>

                  {/* Calculated / Computed Fields (Rank 5) */}
                  <div className="space-y-1">
                    <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em] block">{t('calculated_formula_label')}</label>
                    <Input
                      value={fieldForm.calculation || ''}
                      onChange={e => setFieldForm(prev => ({ ...prev, calculation: e.target.value }))}
                      placeholder={t('ph_calculation')}
                      className="h-10 bg-card-warm border-line rounded-md font-mono text-xs focus-visible:ring-pine/25"
                    />
                    <span className="text-[11px] text-ink-faint block leading-tight">
                      {t('calculated_formula_desc')}
                    </span>
                  </div>

                  {/* Conditional Logic (Rank 4) */}
                  <div className="p-3 bg-paper border border-line rounded-md space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em] block">{t('conditional_logic_label')}</label>
                      <button
                        type="button"
                        onClick={() => {
                          const isComplex = fieldForm.conditions && ('operator' in fieldForm.conditions) && ('rules' in fieldForm.conditions || Array.isArray((fieldForm.conditions as any).rules));
                          if (isComplex) {
                            setFieldForm(prev => ({ ...prev, conditions: { depends_on: '', op: 'eq', value: '' } }))
                          } else {
                            setFieldForm(prev => ({ ...prev, conditions: { operator: 'and', rules: [{ depends_on: '', op: 'eq', value: '' }] } }))
                          }
                        }}
                        className="text-[11px] font-mono font-semibold text-pine hover:text-pine-deep uppercase tracking-[0.16em] bg-pine-soft px-2 py-0.5 rounded-md cursor-pointer border-none"
                      >
                        {fieldForm.conditions && ('operator' in fieldForm.conditions) && ('rules' in fieldForm.conditions || Array.isArray((fieldForm.conditions as any).rules)) ? t('switch_to_simple') : t('switch_to_complex')}
                      </button>
                    </div>

                    {!fieldForm.conditions || Object.keys(fieldForm.conditions).length === 0 ? (
                      <div className="flex flex-col items-center py-2 text-center">
                        <span className="text-[11px] text-ink-faint font-semibold mb-2">{t('no_visibility_conditions')}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          className="h-7 text-[11px] font-semibold rounded-md border-dashed border-line text-ink-faint hover:text-pine hover:border-pine"
                          onClick={() => setFieldForm(prev => ({ ...prev, conditions: { depends_on: '', op: 'eq', value: '' } }))}
                        >
                          + {t('add_visibility_rule')}
                        </Button>
                      </div>
                    ) : (fieldForm.conditions && ('operator' in fieldForm.conditions) && ('rules' in fieldForm.conditions || Array.isArray((fieldForm.conditions as any).rules))) ? (
                      <div className="space-y-1.5">
                        <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.12em]">{t('raw_json_conditions_label')}</label>
                        <textarea
                          value={JSON.stringify(fieldForm.conditions, null, 2)}
                          onChange={e => {
                            try {
                              const parsed = JSON.parse(e.target.value)
                              setFieldForm(prev => ({ ...prev, conditions: parsed }))
                            } catch (err) { }
                          }}
                          placeholder={t('ph_conditions_json')}
                          className="w-full h-32 p-3 font-mono text-xs border border-line rounded-md focus:outline-none focus:ring-1 focus:ring-pine/25 bg-card-warm"
                        />
                        <span className="text-[11px] text-ink-faint block leading-tight">{t('conditions_json_help')}</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.12em]">{t('depends_on_label')}</label>
                            <Input
                              value={(fieldForm.conditions as any)?.depends_on || ''}
                              onChange={e => setFieldForm(prev => ({
                                ...prev,
                                conditions: { ...(prev.conditions || {}), depends_on: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }
                              }))}
                              placeholder={t('ph_depends_on')}
                              className="h-8 bg-card-warm border-line rounded-md text-xs focus-visible:ring-pine/25"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.12em]">{t('comparison_operator_label')}</label>
                            <select
                              value={(fieldForm.conditions as any)?.op || (fieldForm.conditions as any)?.operator || 'eq'}
                              onChange={e => setFieldForm(prev => ({
                                ...prev,
                                conditions: { ...(prev.conditions || {}), op: e.target.value, operator: undefined }
                              }))}
                              className="w-full h-8 px-2 bg-card-warm border border-line rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-pine/25"
                            >
                              <option value="eq">{t('op_eq')}</option>
                              <option value="neq">{t('op_neq')}</option>
                              <option value="gt">{t('op_gt')}</option>
                              <option value="gte">{t('op_gte')}</option>
                              <option value="lt">{t('op_lt')}</option>
                              <option value="lte">{t('op_lte')}</option>
                              <option value="in">{t('op_in')}</option>
                              <option value="not_in">{t('op_not_in')}</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.12em]">{t('comparison_value_label')}</label>
                          <Input
                            value={
                              fieldForm.conditions && 'value' in fieldForm.conditions ? String(fieldForm.conditions.value) :
                                fieldForm.conditions && 'equals' in fieldForm.conditions ? String(fieldForm.conditions.equals) :
                                  fieldForm.conditions && 'not_equals' in fieldForm.conditions ? String(fieldForm.conditions.not_equals) : ''
                            }
                            onChange={e => {
                              const val = e.target.value
                              let parsedVal: any = val
                              if (val.startsWith('[') && val.endsWith(']')) {
                                try { parsedVal = JSON.parse(val) } catch (err) { }
                              } else if (val === 'true') {
                                parsedVal = true
                              } else if (val === 'false') {
                                parsedVal = false
                              } else if (!isNaN(Number(val)) && val.trim() !== '') {
                                parsedVal = Number(val)
                              }
                              setFieldForm(prev => {
                                const baseCond = { ...(prev.conditions || {}) }
                                delete baseCond.equals
                                delete baseCond.not_equals
                                return {
                                  ...prev,
                                  conditions: { ...baseCond, value: parsedVal }
                                }
                              })
                            }}
                            placeholder={t('ph_comparison_value')}
                            className="h-8 bg-card-warm border-line rounded-md text-xs focus-visible:ring-pine/25"
                          />
                        </div>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-terracotta hover:underline block mt-2 border-none bg-transparent cursor-pointer"
                          onClick={() => setFieldForm(prev => {
                            const { conditions, ...rest } = prev
                            return rest as any
                          })}
                        >
                          {t('remove_visibility_rule')}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em]">{t('help_text_label')}</label>
                    <Input
                      value={fieldForm.help_text}
                      onChange={e => setFieldForm(prev => ({ ...prev, help_text: e.target.value }))}
                      placeholder={t('ph_help_text')}
                      className="h-10 bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em]">{t('ai_question_default_label')}</label>
                    <Textarea
                      value={fieldForm.default_question}
                      onChange={e => setFieldForm(prev => ({ ...prev, default_question: e.target.value }))}
                      placeholder={t('ph_ai_question')}
                      className="min-h-16 bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em]">{t('ai_question_clarification_label')}</label>
                    <Textarea
                      value={fieldForm.clarification_question}
                      onChange={e => setFieldForm(prev => ({ ...prev, clarification_question: e.target.value }))}
                      placeholder={t('ph_ai_clarification')}
                      className="min-h-16 bg-card-warm border-line rounded-md focus-visible:ring-pine/25"
                    />
                  </div>

                  <Button className="w-full h-11 bg-pine hover:bg-pine-deep font-semibold rounded-md shadow-none cursor-pointer text-primary-foreground" onClick={saveFieldForm}>
                    {t('save_field_node')}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-16 text-ink-faint space-y-3">
                  <HelpCircle className="w-12 h-12 text-line-strong mx-auto" />
                  <p className="font-mono font-semibold text-[11px] uppercase tracking-[0.16em]">{t('select_field_node_hint')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {builderTab === 'groups' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[11px] font-semibold text-ink-soft uppercase tracking-[0.16em]">{t('intake_section_groups')}</span>
              <Button
                variant="outline"
                className={cn(
                  "border-dashed border-line text-ink-faint rounded-md font-semibold transition-all duration-300",
                  isAddingGroup
                    ? "bg-leaf-soft text-leaf border-leaf scale-95"
                    : "hover:text-pine hover:border-pine"
                )}
                onClick={addFieldGroup}
                disabled={isAddingGroup}
              >
                {isAddingGroup ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-leaf" /> {t('section_created')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" /> {t('create_group_section')}
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {draftTemplate.field_groups.map((group, groupIdx) => (
                <div key={group.group_id} className="p-6 border border-line rounded-lg bg-card-warm space-y-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1.5 flex-grow mr-4">
                      <Input
                        value={group.label}
                        onChange={e => updateFieldGroupText(groupIdx, 'label', e.target.value)}
                        placeholder={t('ph_group_title')}
                        className="font-serif font-semibold text-ink border-b border-transparent hover:border-line focus:border-pine focus:outline-none rounded px-1.5 h-8 bg-transparent"
                      />
                      <Input
                        value={group.description}
                        onChange={e => updateFieldGroupText(groupIdx, 'description', e.target.value)}
                        placeholder={t('ph_group_desc')}
                        className="text-xs text-ink-soft border-b border-transparent hover:border-line focus:border-pine focus:outline-none rounded px-1.5 h-6 bg-transparent"
                      />
                    </div>
                    <button onClick={() => deleteFieldGroup(groupIdx)} className="p-2 text-ink-faint hover:text-terracotta hover:bg-terracotta-soft rounded-md cursor-pointer border-none bg-transparent">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 border-t border-line pt-3">
                    <span className="font-mono text-[11px] font-semibold text-ink-faint uppercase tracking-[0.16em] block">{t('assigned_field_nodes')}</span>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {draftTemplate.schema.map(field => (
                        <label key={field.path} className="flex items-center gap-2 text-xs font-semibold text-ink-soft py-1 hover:bg-paper rounded px-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.field_paths.includes(field.path)}
                            onChange={() => toggleFieldInGroup(groupIdx, field.path)}
                            className="rounded border-line text-pine focus:ring-pine/40"
                          />
                          <div className="flex-grow">
                            <span className="text-ink font-semibold block">{field.label}</span>
                            <code className="text-[11px] font-mono text-ink-faint">{field.path}</code>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {builderTab === 'ai' && (
          <div className="max-w-xl space-y-6">
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('conversational_tone_label')}</label>
              <Input
                value={draftTemplate.conversation_config?.tone || ''}
                onChange={e => setDraftTemplate(prev => ({
                  ...prev,
                  conversation_config: {
                    ...prev.conversation_config,
                    tone: e.target.value,
                    explanation_style: prev.conversation_config?.explanation_style || 'clear',
                    reask_cooldown_turns: prev.conversation_config?.reask_cooldown_turns || 1,
                    max_grouped_fields: prev.conversation_config?.max_grouped_fields || 2
                  }
                }))}
                placeholder={t('ph_tone')}
                className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('max_grouped_fields_label')}</label>
              <Input
                type="number"
                value={draftTemplate.conversation_config?.max_grouped_fields || 2}
                onChange={e => setDraftTemplate(prev => ({
                  ...prev,
                  conversation_config: {
                    ...prev.conversation_config,
                    tone: prev.conversation_config?.tone || 'professional',
                    explanation_style: prev.conversation_config?.explanation_style || 'clear',
                    reask_cooldown_turns: prev.conversation_config?.reask_cooldown_turns || 1,
                    max_grouped_fields: parseInt(e.target.value) || 2
                  }
                }))}
                placeholder={t('ph_max_grouped')}
                className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t('agent_explanation_style_label')}</label>
              <Input
                value={draftTemplate.conversation_config?.explanation_style || 'clear'}
                onChange={e => setDraftTemplate(prev => ({
                  ...prev,
                  conversation_config: {
                    ...prev.conversation_config,
                    tone: prev.conversation_config?.tone || 'professional',
                    explanation_style: e.target.value,
                    reask_cooldown_turns: prev.conversation_config?.reask_cooldown_turns || 1,
                    max_grouped_fields: prev.conversation_config?.max_grouped_fields || 2
                  }
                }))}
                placeholder={t('ph_explanation_style')}
                className="h-11 rounded-md bg-card-warm border-line focus-visible:ring-pine/25"
              />
            </div>
          </div>
        )}

        {builderTab === 'json' && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint block">{t('raw_json_hint')}</span>
              <Button variant="outline" className="border-line font-semibold rounded-md" onClick={handleApplyJson}>
                <RefreshCw className="w-4 h-4 mr-2" /> {t('apply_json_schema')}
              </Button>
            </div>
            <textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              placeholder={t('ph_raw_json')}
              className="min-h-[400px] flex-grow font-mono text-[13px] rounded-lg border border-pine-deep bg-pine-deep text-[#e8e6da] p-4 focus:outline-none focus:ring-2 focus:ring-pine/40"
            />
          </div>
        )}
      </div>
    </div>
  )
}
