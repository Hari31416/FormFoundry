import React from 'react'
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

  React.useEffect(() => {
    setJsonText(JSON.stringify(draftTemplate, null, 2))
  }, [draftTemplate])

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonText)
      if (!parsed.template_id || !parsed.name || !parsed.schema) {
        alert("Invalid schema structure: Must contain template_id, name, and schema.")
        return
      }
      setDraftTemplate(parsed)
      alert("JSON Configuration applied successfully to builder!")
    } catch (err: any) {
      alert("JSON Syntax Error: " + err.message)
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
      alert("Field JSON Path and Label are required.")
      return
    }

    const updatedSchema = [...draftTemplate.schema]

    // Auto populate questions if blank
    const updatedField = {
      ...fieldForm,
      default_question: fieldForm.default_question || `What is the ${fieldForm.label.toLowerCase()}?`,
      clarification_question: fieldForm.clarification_question || `Please provide details for the ${fieldForm.label.toLowerCase()}.`,
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

  // Field Groups Mapping Helpers
  const addFieldGroup = () => {
    setIsAddingGroup(true)
    setTimeout(() => setIsAddingGroup(false), 1000)

    const gId = 'group_' + Date.now().toString().slice(-4)
    const newGroup: TemplateFieldGroup = {
      group_id: gId,
      label: 'New Section Group',
      description: 'Section description text.',
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
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
      <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">Template Architect</span>
          <h2 className="text-2xl font-black">{activeTemplate ? 'Edit Schema Layout' : 'Create Custom Schema'}</h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={onCancel}>
            <X className="w-4 h-4 mr-2" /> Cancel
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-500 font-bold shadow-lg shadow-indigo-500/20 text-white" onClick={onSave} disabled={isPending}>
            <Check className="w-4 h-4 mr-2" /> {isPending ? 'Saving...' : 'Save Template Configuration'}
          </Button>
        </div>
      </div>

      <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-2">
        {[
          { id: 'metadata', label: '1. Metadata & Output', icon: <Database className="w-4 h-4" /> },
          { id: 'fields', label: '2. Form Fields Schema', icon: <Layers className="w-4 h-4" /> },
          { id: 'groups', label: '3. Section Groups', icon: <Workflow className="w-4 h-4" /> },
          { id: 'ai', label: '4. Conversation & AI', icon: <Sparkles className="w-4 h-4" /> },
          { id: 'json', label: '5. Raw JSON Editor', icon: <FileJson className="w-4 h-4" /> },
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
              "flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
              builderTab === tab.id
                ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                : "text-slate-500 hover:bg-slate-200/50"
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
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Template ID / Code</label>
                <Input
                  disabled={!!activeTemplate}
                  value={draftTemplate.template_id}
                  onChange={e => setDraftTemplate(prev => ({ ...prev, template_id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') }))}
                  placeholder="e.g. employee-onboarding"
                  className="h-11 rounded-xl bg-slate-50 border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Template Version</label>
                <Input
                  type="number"
                  disabled={!!activeTemplate}
                  value={draftTemplate.template_version}
                  onChange={e => setDraftTemplate(prev => ({ ...prev, template_version: parseInt(e.target.value) || 1 }))}
                  placeholder="e.g. 1"
                  className="h-11 rounded-xl bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Template Name</label>
              <Input
                value={draftTemplate.name}
                onChange={e => setDraftTemplate(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Employee HR Intake"
                className="h-11 rounded-xl bg-slate-50 border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Domain Category</label>
                <select
                  value={draftTemplate.domain}
                  onChange={e => setDraftTemplate(prev => ({ ...prev, domain: e.target.value }))}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="custom">Custom Templates</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="public-safety">Public Safety</option>
                  <option value="legal">Legal Operations</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Supported Output Formats</label>
                <div className="flex gap-4 items-center h-11">
                  {['json_export', 'pdf'].map(artifact => (
                    <label key={artifact} className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
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
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {artifact.toUpperCase().replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Description</label>
              <Textarea
                value={draftTemplate.description}
                onChange={e => setDraftTemplate(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Provide a description of this intake flow..."
                className="min-h-24 rounded-xl bg-slate-50 border-slate-200"
              />
            </div>

            {draftTemplate.supported_artifacts.includes('pdf') && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" /> PDF Assembly Configuration
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">PDF Title</label>
                    <Input
                      value={draftTemplate.renderer_config?.pdf_title || ''}
                      onChange={e => setDraftTemplate(prev => ({
                        ...prev,
                        renderer_config: { ...(prev.renderer_config || {}), pdf_title: e.target.value }
                      }))}
                      placeholder="e.g. Screening Report"
                      className="h-10 rounded-xl bg-white border-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Template PDF Path</label>
                    <Input
                      value={draftTemplate.renderer_config?.template_asset || ''}
                      onChange={e => setDraftTemplate(prev => ({
                        ...prev,
                        renderer_config: { ...(prev.renderer_config || {}), template_asset: e.target.value }
                      }))}
                      placeholder="e.g. assets/pdfs/packet.pdf"
                      className="h-10 rounded-xl bg-white border-slate-200"
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
                <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">{draftTemplate.schema.length} Field Nodes Configured</span>
                <Button variant="outline" className="border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50" onClick={startFieldAdd}>
                  <Plus className="w-4 h-4 mr-2" /> Add Field Node
                </Button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {draftTemplate.schema.map((field, idx) => (
                  <div key={idx} className={cn(
                    "p-4 border rounded-2xl flex justify-between items-start transition-all",
                    editingFieldIdx === idx ? "border-blue-500 bg-blue-50/20 shadow-md" : "border-slate-100 bg-white hover:border-slate-300"
                  )}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-slate-800">{field.label}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-400 border-slate-200">{field.type}</Badge>
                        {field.required && <Badge className="text-[9px] uppercase font-black bg-red-50 text-red-500 border border-red-100">Required</Badge>}
                        {field.repeated && <Badge className="text-[9px] uppercase font-black bg-purple-50 text-purple-500 border border-purple-100">List</Badge>}
                      </div>
                      <code className="text-xs text-indigo-600 font-mono block mb-2">{field.path}</code>
                      <p className="text-xs text-slate-500">{field.help_text || 'No description help text provided.'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startFieldEdit(idx)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl cursor-pointer border-none">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteField(idx)} className="p-2 text-slate-400 hover:text-red-650 hover:bg-slate-100 rounded-xl cursor-pointer border-none">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Field Inline Editor Panel */}
            <div className="bg-slate-50/50 border border-slate-150 rounded-2xl p-6 h-fit border">
              {editingFieldIdx !== null ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                    <span className="font-black text-slate-800">
                      {editingFieldIdx === draftTemplate.schema.length ? 'Add Field' : 'Edit Field Properties'}
                    </span>
                    <button onClick={() => setEditingFieldIdx(null)} className="p-1 rounded-full text-slate-400 hover:bg-slate-200 cursor-pointer border-none bg-transparent">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">JSON Path</label>
                      <Input
                        value={fieldForm.path}
                        onChange={e => setFieldForm(prev => ({ ...prev, path: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                        placeholder="e.g. patient.dob"
                        className="h-10 bg-white border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Field Label</label>
                      <Input
                        value={fieldForm.label}
                        onChange={e => setFieldForm(prev => ({ ...prev, label: e.target.value }))}
                        placeholder="e.g. Date of Birth"
                        className="h-10 bg-white border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Field Data Type</label>
                      <select
                        value={fieldForm.type}
                        onChange={e => setFieldForm(prev => ({ ...prev, type: e.target.value as any, enum_options: e.target.value === 'enum' ? prev.enum_options || [] : [] }))}
                        className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="string">String (Text)</option>
                        <option value="date">Date</option>
                        <option value="enum">Enum (Select options)</option>
                        <option value="boolean">Boolean (Yes/No)</option>
                        <option value="integer">Integer (Number)</option>
                        <option value="number">Decimal Number</option>
                      </select>
                    </div>
                    <div className="flex gap-4 items-center h-16 pt-3">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-650 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fieldForm.required}
                          onChange={e => setFieldForm(prev => ({ ...prev, required: e.target.checked }))}
                          className="rounded border-slate-300 text-blue-650 focus:ring-blue-500"
                        />
                        Required
                      </label>
                      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-650 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fieldForm.repeated}
                          onChange={e => setFieldForm(prev => ({ ...prev, repeated: e.target.checked }))}
                          className="rounded border-slate-300 text-blue-650 focus:ring-blue-500"
                        />
                        Is List
                      </label>
                    </div>
                  </div>

                  {fieldForm.type === 'enum' && (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Enum Options</label>
                      <div className="flex gap-2">
                        <Input
                          value={newEnumOption}
                          onChange={e => setNewEnumOption(e.target.value)}
                          placeholder="e.g. male"
                          className="h-8 bg-slate-50 border-slate-200 rounded-lg"
                          onKeyDown={e => e.key === 'Enter' && addEnumOption()}
                        />
                        <Button size="sm" variant="secondary" className="h-8 rounded-lg font-bold" onClick={addEnumOption}>Add</Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {fieldForm.enum_options?.map(opt => (
                          <Badge key={opt} variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center gap-1.5 py-0.5 px-2">
                            {opt}
                            <X className="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-pointer" onClick={() => removeEnumOption(opt)} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Validation Support (Rank 1) */}
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Validation Rules</label>
                    <div className="flex gap-2">
                      <Input
                        value={newValidationRef}
                        onChange={e => setNewValidationRef(e.target.value)}
                        placeholder="e.g. email, phone, regex:^[0-9]{5}$"
                        className="h-8 bg-slate-50 border-slate-200 rounded-lg text-xs"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addValidationRef();
                          }
                        }}
                      />
                      <Button size="sm" variant="secondary" className="h-8 rounded-lg font-bold text-xs" onClick={addValidationRef}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {fieldForm.validation_refs?.map(ref => (
                        <Badge key={ref} variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center gap-1.5 py-0.5 px-2 text-xs">
                          {ref}
                          <X className="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-pointer" onClick={() => removeValidationRef(ref)} />
                        </Badge>
                      ))}
                      {(!fieldForm.validation_refs || fieldForm.validation_refs.length === 0) && (
                        <span className="text-[10px] text-slate-400 font-semibold italic">No custom rules set.</span>
                      )}
                    </div>
                  </div>

                  {/* Calculated / Computed Fields (Rank 5) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Calculated Formula (Expression)</label>
                    <Input
                      value={fieldForm.calculation || ''}
                      onChange={e => setFieldForm(prev => ({ ...prev, calculation: e.target.value }))}
                      placeholder="e.g. {invoice.subtotal} * 1.15"
                      className="h-10 bg-white border-slate-200 rounded-xl font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-450 block leading-tight">
                      Evaluates mathematical or string operations at resolution runtime. Lock is shown in the workspace.
                    </span>
                  </div>

                  {/* Conditional Logic (Rank 4) */}
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Conditional Logic</label>
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
                        className="text-[9px] font-black text-blue-650 hover:text-blue-750 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded cursor-pointer border-none bg-transparent"
                      >
                        {fieldForm.conditions && ('operator' in fieldForm.conditions) && ('rules' in fieldForm.conditions || Array.isArray((fieldForm.conditions as any).rules)) ? 'Switch to Simple' : 'Switch to Complex'}
                      </button>
                    </div>

                    {!fieldForm.conditions || Object.keys(fieldForm.conditions).length === 0 ? (
                      <div className="flex flex-col items-center py-2 text-center">
                        <span className="text-[10px] text-slate-400 font-semibold mb-2">No visibility conditions set. Field is always active.</span>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          className="h-7 text-[10px] font-bold rounded-lg border-slate-200"
                          onClick={() => setFieldForm(prev => ({ ...prev, conditions: { depends_on: '', op: 'eq', value: '' } }))}
                        >
                          + Add Visibility Rule
                        </Button>
                      </div>
                    ) : (fieldForm.conditions && ('operator' in fieldForm.conditions) && ('rules' in fieldForm.conditions || Array.isArray((fieldForm.conditions as any).rules))) ? (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Raw JSON Conditions Definition</label>
                        <textarea
                          value={JSON.stringify(fieldForm.conditions, null, 2)}
                          onChange={e => {
                            try {
                              const parsed = JSON.parse(e.target.value)
                              setFieldForm(prev => ({ ...prev, conditions: parsed }))
                            } catch (err) { }
                          }}
                          placeholder='{ "operator": "and", "rules": [...] }'
                          className="w-full h-32 p-3 font-mono text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900 bg-slate-50"
                        />
                        <span className="text-[9px] text-slate-400 block leading-tight">Must be valid JSON object with rules.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Depends On Field Path</label>
                            <Input
                              value={(fieldForm.conditions as any)?.depends_on || ''}
                              onChange={e => setFieldForm(prev => ({
                                ...prev,
                                conditions: { ...(prev.conditions || {}), depends_on: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }
                              }))}
                              placeholder="e.g. user.age"
                              className="h-8 bg-slate-50 border-slate-250 rounded-lg text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Comparison Operator</label>
                            <select
                              value={(fieldForm.conditions as any)?.op || (fieldForm.conditions as any)?.operator || 'eq'}
                              onChange={e => setFieldForm(prev => ({
                                ...prev,
                                conditions: { ...(prev.conditions || {}), op: e.target.value, operator: undefined }
                              }))}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-250 rounded-lg text-xs focus:outline-none"
                            >
                              <option value="eq">Equals (eq)</option>
                              <option value="neq">Not Equals (neq)</option>
                              <option value="gt">Greater Than (gt)</option>
                              <option value="gte">Greater or Equal (gte)</option>
                              <option value="lt">Less Than (lt)</option>
                              <option value="lte">Less or Equal (lte)</option>
                              <option value="in">In List (in)</option>
                              <option value="not_in">Not In List (not_in)</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Comparison Value</label>
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
                            placeholder="e.g. 18, true, [val1, val2]"
                            className="h-8 bg-slate-50 border-slate-250 rounded-lg text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          className="text-[9px] font-bold text-red-500 hover:text-red-650 block mt-2 border-none bg-transparent cursor-pointer"
                          onClick={() => setFieldForm(prev => {
                            const { conditions, ...rest } = prev
                            return rest as any
                          })}
                        >
                          Remove Visibility Rule
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Help Text</label>
                    <Input
                      value={fieldForm.help_text}
                      onChange={e => setFieldForm(prev => ({ ...prev, help_text: e.target.value }))}
                      placeholder="e.g. Enter a valid formatted date."
                      className="h-10 bg-white border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Question (Default)</label>
                    <Textarea
                      value={fieldForm.default_question}
                      onChange={e => setFieldForm(prev => ({ ...prev, default_question: e.target.value }))}
                      placeholder="What is your date of birth?"
                      className="min-h-16 bg-white border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Question (Clarification)</label>
                    <Textarea
                      value={fieldForm.clarification_question}
                      onChange={e => setFieldForm(prev => ({ ...prev, clarification_question: e.target.value }))}
                      placeholder="Please specify your date of birth in YYYY-MM-DD format."
                      className="min-h-16 bg-white border-slate-200 rounded-xl"
                    />
                  </div>

                  <Button className="w-full h-11 bg-slate-900 hover:bg-indigo-650 font-bold rounded-xl shadow-md cursor-pointer text-white" onClick={saveFieldForm}>
                    Save Field Node Properties
                  </Button>
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400 space-y-3">
                  <HelpCircle className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="font-semibold text-xs uppercase tracking-wider">Select a Field Node to edit, or add a new field node using the visual editor.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {builderTab === 'groups' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">Intake Section Groups</span>
              <Button
                variant="outline"
                className={cn(
                  "border-slate-200 text-slate-700 rounded-xl font-bold transition-all duration-300",
                  isAddingGroup
                    ? "bg-emerald-50 text-emerald-600 border-emerald-250 scale-95"
                    : "hover:bg-slate-50"
                )}
                onClick={addFieldGroup}
                disabled={isAddingGroup}
              >
                {isAddingGroup ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-emerald-500 animate-bounce" /> Section Created!
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" /> Create Group Section
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {draftTemplate.field_groups.map((group, groupIdx) => (
                <div key={group.group_id} className="p-6 border border-slate-150 rounded-2xl bg-white space-y-4 border shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1.5 flex-grow mr-4">
                      <Input
                        value={group.label}
                        onChange={e => updateFieldGroupText(groupIdx, 'label', e.target.value)}
                        placeholder="Group Title (e.g. Demographics)"
                        className="font-bold text-slate-800 border-b border-transparent hover:border-slate-200 focus:border-slate-900 focus:outline-none rounded px-1.5 h-8 bg-transparent"
                      />
                      <Input
                        value={group.description}
                        onChange={e => updateFieldGroupText(groupIdx, 'description', e.target.value)}
                        placeholder="Section description summary..."
                        className="text-xs text-slate-500 border-b border-transparent hover:border-slate-200 focus:border-slate-900 focus:outline-none rounded px-1.5 h-6 bg-transparent"
                      />
                    </div>
                    <button onClick={() => deleteFieldGroup(groupIdx)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded-lg cursor-pointer border-none bg-transparent">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Field Nodes</span>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {draftTemplate.schema.map(field => (
                        <label key={field.path} className="flex items-center gap-2 text-xs font-semibold text-slate-755 py-1 hover:bg-slate-50 rounded px-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.field_paths.includes(field.path)}
                            onChange={() => toggleFieldInGroup(groupIdx, field.path)}
                            className="rounded border-slate-300 text-blue-650 focus:ring-blue-500"
                          />
                          <div className="flex-grow">
                            <span className="text-slate-850 font-bold block">{field.label}</span>
                            <code className="text-[9px] text-slate-400 font-mono">{field.path}</code>
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
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Conversational Tone</label>
              <Input
                value={draftTemplate.conversation_config?.tone || ''}
                onChange={e => setDraftTemplate(prev => ({
                  ...prev,
                  conversation_config: {
                    tone: e.target.value,
                    explanation_style: prev.conversation_config?.explanation_style || 'clear',
                    reask_cooldown_turns: prev.conversation_config?.reask_cooldown_turns || 1,
                    max_grouped_fields: prev.conversation_config?.max_grouped_fields || 2
                  }
                }))}
                placeholder="e.g. empathetic, supportive, yet professional and direct"
                className="h-11 rounded-xl bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Max fields in single agent question turn</label>
              <Input
                type="number"
                value={draftTemplate.conversation_config?.max_grouped_fields || 2}
                onChange={e => setDraftTemplate(prev => ({
                  ...prev,
                  conversation_config: {
                    tone: prev.conversation_config?.tone || 'professional',
                    explanation_style: prev.conversation_config?.explanation_style || 'clear',
                    reask_cooldown_turns: prev.conversation_config?.reask_cooldown_turns || 1,
                    max_grouped_fields: parseInt(e.target.value) || 2
                  }
                }))}
                placeholder="e.g. 2"
                className="h-11 rounded-xl bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Agent Explanation Style</label>
              <Input
                value={draftTemplate.conversation_config?.explanation_style || 'clear'}
                onChange={e => setDraftTemplate(prev => ({
                  ...prev,
                  conversation_config: {
                    tone: prev.conversation_config?.tone || 'professional',
                    explanation_style: e.target.value,
                    reask_cooldown_turns: prev.conversation_config?.reask_cooldown_turns || 1,
                    max_grouped_fields: prev.conversation_config?.max_grouped_fields || 2
                  }
                }))}
                placeholder="e.g. clear, simple"
                className="h-11 rounded-xl bg-slate-50 border-slate-200"
              />
            </div>
          </div>
        )}

        {builderTab === 'json' && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Edit template parameters directly as raw JSON</span>
              <Button variant="outline" className="border-slate-200 font-bold rounded-xl" onClick={handleApplyJson}>
                <RefreshCw className="w-4 h-4 mr-2" /> Apply JSON Schema
              </Button>
            </div>
            <textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              placeholder="Paste raw Intake Template JSON config..."
              className="min-h-[400px] flex-grow font-mono text-sm rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        )}
      </div>
    </div>
  )
}
