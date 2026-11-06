import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Quote,
  Check,
  Lock,
  Pencil,
  ChevronDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DocumentUploadMutation } from './DocumentSupport'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  TemplateField,
  FieldState,
  FieldStatus,
  Evidence,
  ValidationRule
} from '@/lib/api'
import i18next from 'i18next'
import { useTranslation } from 'react-i18next'

export function RenderNestedObject({ value, schema }: { value: unknown; schema?: TemplateField[] }) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return <span className="text-ink-faint italic">{i18next.t('empty_object')}</span>
  }

  const obj = value as Record<string, unknown>
  const schemaFields = schema || []

  // If no schema fields are defined, just render raw key-value pairs
  const keysToRender = schemaFields.length > 0
    ? schemaFields.map(f => ({ path: f.path, label: f.label, leaf: f.path.split('.').pop() || '', field: f }))
    : Object.keys(obj).map(k => ({ path: k, label: k.replace(/_/g, ' '), leaf: k, field: undefined }))

  return (
    <div className="pl-3 py-2 border-l border-line space-y-1.5 bg-paper rounded-r-md pr-3 my-1">
      {keysToRender.map(({ path, label, leaf, field }) => {
        const subVal = obj[path] !== undefined ? obj[path] : obj[leaf]
        const hasVal = subVal !== undefined && subVal !== null && subVal !== ''

        return (
          <div key={path} className="flex flex-col text-[11px] leading-tight">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-ink-faint text-[11px] tracking-[0.08em] uppercase font-mono">{label}:</span>
              {!hasVal && <span className="text-ink-faint/70 italic text-[11px]">{i18next.t('not_provided')}</span>}
            </div>
            {hasVal && (
              <div className="pl-2 mt-0.5 text-ink font-semibold font-mono">
                {field && (field.type === 'object' || field.type === 'list_of_objects') ? (
                  field.type === 'object' ? (
                    <RenderNestedObject value={subVal} schema={field.schema} />
                  ) : (
                    <RenderListOfObjects value={subVal} schema={field.schema} />
                  )
                ) : Array.isArray(subVal) ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {subVal.map((item, i) => (
                      <span key={i} className="bg-paper border border-line text-ink-soft px-1.5 py-0.5 rounded text-[11px] font-mono font-medium">
                        {String(item)}
                      </span>
                    ))}
                  </div>
                ) : typeof subVal === 'boolean' ? (
                  <span className={subVal ? "text-leaf font-semibold text-[11px] uppercase" : "text-ink-soft font-semibold text-[11px] uppercase"}>
                    {subVal ? 'true' : 'false'}
                  </span>
                ) : (
                  <span className="text-ink text-[11px] font-sans break-all">{String(subVal)}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function RenderListOfObjects({ value, schema }: { value: unknown; schema?: TemplateField[] }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <span className="text-ink-faint italic">{i18next.t('empty_list')}</span>
  }

  return (
    <div className="space-y-2 mt-1">
      {value.map((item, idx) => (
        <div key={idx} className="relative border border-line bg-card-warm rounded-md shadow-xs p-2 overflow-hidden hover:border-line-strong transition-colors">
          <div className="absolute top-0 right-0 bg-paper border-bl border-line text-[11px] font-mono font-medium text-ink-faint px-2 py-0.5 rounded-bl-md uppercase tracking-[0.14em]">
            {i18next.t('item_number', { index: idx + 1 })}
          </div>
          <div className="mt-1">
            <RenderNestedObject value={item} schema={schema} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Helper: check if field has resolved value
export function hasResolvedValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return true
}

// Helper: get display text for evidence source
export function getEvidenceDisplayText(ev: Evidence): string {
  if (typeof ev.raw_text === 'string' && ev.raw_text.trim()) {
    return ev.raw_text.trim()
  }

  const extractedText = ev.parsed_payload?.extracted_text
  if (typeof extractedText === 'string' && extractedText.trim()) {
    return extractedText.trim()
  }

  return ''
}

// Helper: Render HSL status badges for field certainty/status
export function FieldBadge({ status }: { status: FieldStatus }) {
  const { t } = useTranslation()
  switch (status) {
    case 'confirmed':
      return <Badge className="bg-leaf-soft text-leaf hover:bg-leaf-soft border-leaf/30 text-[11px] uppercase font-mono font-medium px-1.5 h-4 rounded">{t('field_status_confirmed')}</Badge>
    case 'proposed':
      return <Badge className="bg-inkblue-soft text-inkblue hover:bg-inkblue-soft border-inkblue/30 text-[11px] uppercase font-mono font-medium px-1.5 h-4 rounded">{t('field_status_proposed')}</Badge>
    case 'conflicted':
      return <Badge className="bg-terracotta-soft text-terracotta hover:bg-terracotta-soft border-terracotta/30 text-[11px] uppercase font-mono font-medium px-1.5 h-4 rounded">{t('field_status_conflicted')}</Badge>
    case 'missing':
      return <Badge variant="outline" className="text-ink-faint border-line-strong text-[11px] uppercase font-mono font-medium px-1.5 h-4 rounded">{t('field_status_missing')}</Badge>
    default:
      return null
  }
}

// Subcomponent: Source Evidence Quote Renderer with expandable toggler
export function EvidenceQuote({ ev }: { ev: Evidence }) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const displayText = getEvidenceDisplayText(ev)
  const isLongText = displayText.length > 120

  return (
    <div className="relative pl-3 border-l-2 border-line-strong hover:border-pine transition-colors group/evidence">
      <p className={cn(
        "text-[11px] text-ink-soft italic leading-relaxed transition-all",
        !isExpanded && "line-clamp-2"
      )}>
        “{displayText}”
      </p>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.14em]">
          {t('via')} {ev.source_type.replace('_', ' ')}
          {ev.source_subtype ? ` · ${ev.source_subtype}` : ''}
        </div>
        {isLongText && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[11px] font-semibold text-pine hover:text-pine-deep uppercase tracking-[0.16em] transition-colors cursor-pointer"
          >
            {isExpanded ? t('show_less') : t('show_more')}
          </button>
        )}
      </div>
    </div>
  )
}

function getReadablePattern(pattern: string): string {
  if (pattern === '^\\d{4}-\\d{2}-\\d{2}$') {
    return 'YYYY-MM-DD'
  }
  if (pattern === '^\\d{2}-\\d{2}-\\d{4}$') {
    return 'DD-MM-YYYY'
  }
  return pattern
}

function formatDraftValue(field: TemplateField, value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (field.type === 'object' || field.type === 'list_of_objects') {
    return JSON.stringify(value, null, 2)
  }
  if (field.repeated && Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}

interface FieldRowProps {
  field: TemplateField
  state: FieldState | undefined
  issues: any[]
  allEvidence: Evidence[]
  onConfirm: (path: string) => void
  onReject: (path: string) => void
  onEdit: (path: string, value: any) => Promise<void>
  validationRules?: ValidationRule[]
  isLocallyRejected?: boolean
  onUndoReject?: (path: string) => void
  uploadFileMutation?: DocumentUploadMutation
}

export function FieldRow({
  field,
  state,
  issues,
  allEvidence,
  onConfirm,
  onReject,
  onEdit,
  validationRules = [],
  isLocallyRejected = false,
  onUndoReject,
  uploadFileMutation,
}: FieldRowProps) {
  const { t } = useTranslation()
  if (!field) return null
  const confidence = state?.confidence ?? 0
  const proposedState = state?.status === 'proposed' ? state : undefined
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState<string>(
    formatDraftValue(field, state?.resolved_value),
  )
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const canEdit = !field.calculation && field.type !== 'document'

  const validationRuleMap = React.useMemo(() => {
    const map = new Map<string, ValidationRule>()
    validationRules.forEach((rule) => {
      if (rule.rule_id) {
        map.set(rule.rule_id, rule)
      }
    })
    return map
  }, [validationRules])

  const isDatePicker = field.type === 'date' && !field.repeated

  const emailPattern = React.useMemo(() => {
    return validationRuleMap.get('email')?.pattern || '^[^@]+@[^@]+\\.[^@]+$'
  }, [validationRuleMap])

  const phonePattern = React.useMemo(() => {
    return validationRuleMap.get('phone')?.pattern || '^[0-9+()\\- ]{10,15}$'
  }, [validationRuleMap])

  const validationRefs = field.validation_refs ?? []
  const regexPatterns = validationRefs
    .filter((ref) => ref.startsWith('regex:'))
    .map((ref) => ref.split(':', 2)[1])
    .filter(Boolean)
  const rulePatterns = validationRefs
    .map((ref) => validationRuleMap.get(ref)?.pattern)
    .filter((pattern): pattern is string => Boolean(pattern))
  const combinedPatterns = Array.from(new Set([...regexPatterns, ...rulePatterns]))

  const formatHint = React.useMemo(() => {
    if (field.type === 'date') {
      return 'YYYY-MM-DD'
    }
    if (combinedPatterns.length > 0) {
      return getReadablePattern(combinedPatterns[0])
    }
    if (validationRefs.includes('email')) {
      return getReadablePattern(emailPattern)
    }
    if (validationRefs.includes('phone')) {
      return getReadablePattern(phonePattern)
    }
    return null
  }, [combinedPatterns, emailPattern, field.type, phonePattern, validationRefs])

  React.useEffect(() => {
    if (!isEditing) {
      setDraftValue(formatDraftValue(field, state?.resolved_value))
    }
  }, [field, isEditing, state?.resolved_value])

  // Resolve source evidence
  const sourceEvidence = (state?.source_evidence_ids || [])
    .map((id) => allEvidence.find((ev) => ev.evidence_id === id))
    .filter((ev): ev is Evidence => !!ev && !!getEvidenceDisplayText(ev))

  const validateValue = (value: any): string | null => {
    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    if (field.required && isEmpty) {
      return t('validation_required')
    }
    if (isEmpty) {
      return null
    }

    const items = field.repeated && Array.isArray(value) ? value : [value]
    for (const item of items) {
      if (field.type === 'enum' && !field.enum_options.includes(String(item))) {
        return t('validation_enum')
      }
      if (field.type === 'date') {
        const dateRegex = new RegExp('^\\d{4}-\\d{2}-\\d{2}$')
        if (!dateRegex.test(String(item))) {
          return t('validation_date')
        }
      }
      if (field.type === 'boolean' && typeof item !== 'boolean') {
        return t('validation_boolean')
      }
      if (field.type === 'integer' && !Number.isInteger(item)) {
        return t('validation_integer')
      }
      if (field.type === 'number' && (typeof item !== 'number' || Number.isNaN(item))) {
        return t('validation_number')
      }

      for (const ref of validationRefs) {
        if (ref === 'email') {
          const emailRegex = new RegExp(emailPattern)
          if (!emailRegex.test(String(item))) {
            return t('validation_email')
          }
        }
        if (ref === 'phone') {
          const phoneRegex = new RegExp(phonePattern)
          if (!phoneRegex.test(String(item))) {
            return t('validation_phone')
          }
        }
        if (ref.startsWith('regex:')) {
          const pattern = ref.split(':', 2)[1]
          try {
            const regex = new RegExp(pattern)
            if (!regex.test(String(item))) {
              return t('validation_format')
            }
          } catch {
            // ignore invalid regex
          }
        }
        if (ref.startsWith('min:')) {
          const threshold = Number(ref.split(':', 2)[1])
          if (typeof item === 'number' && !Number.isNaN(threshold) && item < threshold) {
            return t('validation_min', { threshold })
          }
        }
        if (ref.startsWith('min_length:')) {
          const threshold = Number(ref.split(':', 2)[1])
          if (String(item).trim().length < threshold) {
            return t('validation_min_length', { threshold })
          }
        }
        const rulePattern = validationRuleMap.get(ref)?.pattern
        if (rulePattern) {
          try {
            const regex = new RegExp(rulePattern)
            if (!regex.test(String(item))) {
              return t('validation_format')
            }
          } catch {
            // ignore invalid regex
          }
        }
      }
    }

    return null
  }

  const parseScalarValue = (raw: string): { value: any; error: string | null } => {
    if (!raw) {
      return { value: null, error: null }
    }
    if (field.type === 'integer') {
      const parsed = Number(raw)
      if (!Number.isInteger(parsed)) {
        return { value: null, error: t('validation_integer') }
      }
      return { value: parsed, error: null }
    }
    if (field.type === 'number') {
      const parsed = Number(raw)
      if (Number.isNaN(parsed)) {
        return { value: null, error: t('validation_number') }
      }
      return { value: parsed, error: null }
    }
    if (field.type === 'boolean') {
      if (raw === 'true') return { value: true, error: null }
      if (raw === 'false') return { value: false, error: null }
      return { value: null, error: t('validation_boolean') }
    }
    return { value: raw, error: null }
  }

  const normalizeDraftValue = (): { value: any; error: string | null } => {
    const raw = draftValue.trim()
    if (field.type === 'object' || field.type === 'list_of_objects') {
      if (!raw) {
        return { value: field.type === 'object' ? {} : [], error: field.required ? t('validation_required') : null }
      }
      try {
        const parsed = JSON.parse(raw)
        if (field.type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null)) {
          return { value: null, error: t('validation_must_be_object') }
        }
        if (field.type === 'list_of_objects' && !Array.isArray(parsed)) {
          return { value: null, error: t('validation_must_be_array') }
        }
        return { value: parsed, error: null }
      } catch (err: any) {
        return { value: null, error: t('validation_invalid_json', { error: err?.message || String(err) }) }
      }
    }

    if (field.repeated) {
      const tokens = raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : []
      const parsed: any[] = []
      for (const token of tokens) {
        const parsedToken = parseScalarValue(token)
        if (parsedToken.error) {
          return { value: null, error: parsedToken.error }
        }
        parsed.push(parsedToken.value)
      }
      return { value: parsed, error: validateValue(parsed) }
    }

    const parsed = parseScalarValue(raw)
    if (parsed.error) {
      return { value: null, error: parsed.error }
    }
    return { value: parsed.value, error: validateValue(parsed.value) }
  }

  const handleStartEdit = () => {
    setDraftValue(formatDraftValue(field, state?.resolved_value))
    setEditError(null)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setEditError(null)
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    const normalized = normalizeDraftValue()
    if (normalized.error) {
      setEditError(normalized.error)
      return
    }
    setEditError(null)
    setIsSaving(true)
    try {
      await onEdit(field.path, normalized.value)
      setIsEditing(false)
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        t('edit_save_failed')
      setEditError(String(detail))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="group relative flex flex-col space-y-2">
      <Card className={cn(
        "card-ledger transition-all duration-200 overflow-hidden rounded-lg",
        issues.some(i => i.blocking)
          ? "border-terracotta/40 bg-terracotta-soft/30 border-l-2 border-l-terracotta"
          : state?.status === 'confirmed'
            ? "border-l-2 border-l-leaf"
            : "hover:border-line-strong"
      )}>
        <CardContent className="p-0 flex flex-col">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between">
            <div className="flex-grow min-w-0 pr-4">
              <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-y-1">
                <span className="text-[11px] font-sans font-semibold uppercase tracking-[0.08em] text-ink">{field.label}</span>
                {isLocallyRejected ? (
                  <Badge className="bg-terracotta-soft text-terracotta hover:bg-terracotta-soft border-terracotta/30 text-[11px] uppercase font-mono font-medium px-1.5 h-4 rounded">
                    {t('field_status_rejected_pending')}
                  </Badge>
                ) : (
                  state && <FieldBadge status={state.status} />
                )}
                {field.required && (
                  <span className="text-[11px] font-mono font-medium text-ink-soft border border-line-strong bg-paper rounded px-1 leading-none py-0.5">{t('req_badge')}</span>
                )}
                {field.calculation && (
                  <Badge className="bg-marigold-soft text-marigold hover:bg-marigold-soft border-marigold/30 text-[11px] uppercase font-mono font-medium px-1.5 h-4 rounded flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    {t('field_calculated')}
                  </Badge>
                )}
              </div>
              <div className="text-[15px] font-semibold text-ink tabular-nums">
                {hasResolvedValue(state?.resolved_value) ? (
                  field.type === 'document' ? (
                    <div>
                      <p className="mb-2 text-sm text-pine">{state?.resolved_value?._file?.filename}</p>
                      <RenderNestedObject value={state?.resolved_value} schema={field.schema} />
                    </div>
                  ) : field.type === 'object' ? (
                    <RenderNestedObject value={state?.resolved_value} schema={field.schema} />
                  ) : field.type === 'list_of_objects' ? (
                    <RenderListOfObjects value={state?.resolved_value} schema={field.schema} />
                  ) : Array.isArray(state?.resolved_value) ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {state.resolved_value.map((val: any, idx: number) => (
                        <Badge key={idx} variant="secondary" className="bg-pine-soft text-pine-deep py-0.5 px-2 font-mono font-medium text-[11px] rounded-md border-pine/15">
                          {String(val)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="break-words block">{String(state?.resolved_value)}</span>
                  )
                ) : (
                  <span className="text-ink-faint font-medium italic">{t('awaiting_data')}</span>
                )}
              </div>

              {field.type === 'document' && field.document && uploadFileMutation && (
                <label className="mt-3 block text-xs font-normal text-ink-soft">
                  <span className="mb-1 block">{t('documents.upload_named', { type: field.label })}</span>
                  <input type="file" accept="image/*,.pdf,application/pdf" disabled={uploadFileMutation.isPending}
                    className="block max-w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-pine file:px-3 file:py-2 file:text-primary-foreground"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) uploadFileMutation.mutate({ file, documentType: field.document!.document_type })
                      event.target.value = ''
                    }} />
                </label>
              )}
              {isEditing && (
                <div className="mt-3 space-y-2">
                  {field.type === 'object' || field.type === 'list_of_objects' ? (
                    <textarea
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      placeholder={t('edit_json_placeholder')}
                      aria-invalid={!!editError}
                      rows={6}
                      className={cn(
                        "w-full rounded-md border border-line bg-card-warm px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-pine/25",
                        editError && "border-terracotta/50 focus:ring-terracotta/25"
                      )}
                    />
                  ) : field.type === 'enum' && !field.repeated ? (
                    <select
                      className={cn(
                        "h-8 w-full rounded-md border border-line bg-card-warm px-2 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-pine/25",
                        editError && "border-terracotta/50 focus:ring-terracotta/25",
                      )}
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                    >
                      <option value="">{t('select_value')}</option>
                      {field.enum_options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'boolean' && !field.repeated ? (
                    <select
                      className={cn(
                        "h-8 w-full rounded-md border border-line bg-card-warm px-2 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-pine/25",
                        editError && "border-terracotta/50 focus:ring-terracotta/25",
                      )}
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                    >
                      <option value="">{t('select_value')}</option>
                      <option value="true">{t('yes')}</option>
                      <option value="false">{t('no')}</option>
                    </select>
                  ) : (
                      <Input
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        placeholder={t('edit_value_placeholder')}
                        aria-invalid={!!editError}
                        className={cn("text-sm bg-card-warm border-line text-ink focus-visible:ring-pine/25", editError && "border-terracotta/50")}
                      type={
                        isDatePicker
                          ? 'date'
                          : field.type === 'number' || field.type === 'integer'
                            ? 'number'
                            : 'text'
                      }
                      step={
                        field.type === 'integer'
                          ? 1
                          : field.type === 'number'
                            ? 'any'
                            : undefined
                      }
                    />
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint font-mono font-medium uppercase tracking-[0.16em]">
                    {formatHint && (
                      <span>{t('expected_format', { format: formatHint })}</span>
                    )}
                    {field.repeated && (
                      <span>{t('comma_separated')}</span>
                    )}
                  </div>
                  {editError && (
                    <p className="text-[11px] text-terracotta font-semibold">{editError}</p>
                  )}
                </div>
              )}

              {confidence > 0 && state?.status !== 'confirmed' && (
                <div className="mt-3 flex items-center space-x-3">
                  <div className="w-20 h-1.5 bg-paper border border-line rounded-sm overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-sm transition-all duration-1000',
                        'bg-inkblue',
                      )}
                      style={{ width: `${confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.16em]">{(confidence * 100).toFixed(0)}% {t('certainty')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {proposedState && !isLocallyRejected && !isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-terracotta hover:bg-terracotta-soft text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md transition-all active:scale-95 cursor-pointer"
                    onClick={() => onReject(proposedState.field_path)}
                  >
                    {t('reject_match')}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-pine hover:bg-pine-deep text-primary-foreground text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md shadow-sm transition-all active:scale-95 cursor-pointer"
                    onClick={() => onConfirm(proposedState.field_path)}
                  >
                    {t('confirm_match')}
                  </Button>
                </>
              )}
              {proposedState && isLocallyRejected && !isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-line text-ink-soft hover:bg-paper hover:text-ink text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md transition-all active:scale-95 cursor-pointer"
                    onClick={() => onUndoReject && onUndoReject(proposedState.field_path)}
                  >
                    {t('undo_rejection')}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-pine hover:bg-pine-deep text-primary-foreground text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md shadow-sm transition-all active:scale-95 cursor-pointer"
                    onClick={() => onConfirm(proposedState.field_path)}
                  >
                    {t('confirm_match')}
                  </Button>
                </>
              )}
              {canEdit && !isEditing && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-ink-soft hover:bg-paper hover:text-ink text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md transition-all active:scale-95 cursor-pointer"
                  onClick={handleStartEdit}
                >
                  <Pencil className="w-3 h-3 mr-1.5" />
                  {t('edit_field')}
                </Button>
              )}
              {isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-line text-ink-soft hover:bg-paper hover:text-ink text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md transition-all active:scale-95 cursor-pointer"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-pine hover:bg-pine-deep text-primary-foreground text-[11px] font-semibold uppercase tracking-[0.16em] h-9 px-3 rounded-md shadow-sm transition-all active:scale-95 cursor-pointer"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? t('saving') : t('save')}
                  </Button>
                </>
              )}
              {state?.status === 'confirmed' && (
                <div className="p-1.5 bg-leaf rounded-md text-primary-foreground">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Source Evidence Provenance (collapsed by default) */}
          {sourceEvidence.length > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-paper border border-line rounded-md">
                <button
                  type="button"
                  onClick={() => setIsEvidenceOpen((open) => !open)}
                  aria-expanded={isEvidenceOpen}
                  className="flex items-center justify-between w-full px-3 py-2 text-left cursor-pointer"
                >
                  <span className="flex items-center space-x-2 text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.2em]">
                    <Quote className="w-3 h-3" />
                    <span>{t('source_provenance')} ({sourceEvidence.length})</span>
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-ink-faint transition-transform duration-200', isEvidenceOpen && 'rotate-180')} />
                </button>
                {isEvidenceOpen && (
                  <div className="space-y-3 border-t border-line p-3">
                    {sourceEvidence.map((ev) => (
                      <EvidenceQuote key={ev.evidence_id} ev={ev} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline Issues */}
      {issues.length > 0 && (
        <div className="px-4 space-y-1">
          {issues.map((issue) => (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={issue.issue_id}
              className={cn(
                "flex items-center space-x-2 text-[11px] font-semibold p-1 px-2 rounded-md w-fit border",
                issue.blocking ? "bg-terracotta-soft text-terracotta border-terracotta/30" : "bg-marigold-soft text-marigold border-marigold/30"
              )}
            >
              <AlertCircle className="w-3 h-3" />
              <span>{issue.message}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
