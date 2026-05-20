import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Quote,
  Check,
  Lock,
  Pencil
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
import { useTranslation } from 'react-i18next'

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
      return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-200/50 text-[9px] uppercase font-black px-1.5 h-4">{t('field_status_confirmed')}</Badge>
    case 'proposed':
      return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-blue-200/50 text-[9px] uppercase font-black px-1.5 h-4">{t('field_status_proposed')}</Badge>
    case 'conflicted':
      return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-200/50 text-[9px] uppercase font-black px-1.5 h-4">{t('field_status_conflicted')}</Badge>
    case 'missing':
      return <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] uppercase font-black px-1.5 h-4">{t('field_status_missing')}</Badge>
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
    <div className="relative pl-3 border-l-2 border-slate-100 hover:border-blue-200 transition-colors group/evidence">
      <p className={cn(
        "text-[11px] text-slate-500 italic leading-relaxed transition-all",
        !isExpanded && "line-clamp-2"
      )}>
        “{displayText}”
      </p>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">
          {t('via')} {ev.source_type.replace('_', ' ')}
          {ev.source_subtype ? ` · ${ev.source_subtype}` : ''}
        </div>
        {isLongText && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[9px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest transition-colors cursor-pointer"
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
  onUndoReject
}: FieldRowProps) {
  const { t } = useTranslation()
  if (!field) return null
  const confidence = state?.confidence ?? 0
  const proposedState = state?.status === 'proposed' ? state : undefined
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState<string>(
    formatDraftValue(field, state?.resolved_value),
  )
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const canEdit = !field.calculation

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
      return t('validation_required', { defaultValue: 'This field is required.' })
    }
    if (isEmpty) {
      return null
    }

    const items = field.repeated && Array.isArray(value) ? value : [value]
    for (const item of items) {
      if (field.type === 'enum' && !field.enum_options.includes(String(item))) {
        return t('validation_enum', { defaultValue: 'Select a valid option.' })
      }
      if (field.type === 'date') {
        const dateRegex = new RegExp('^\\d{4}-\\d{2}-\\d{2}$')
        if (!dateRegex.test(String(item))) {
          return t('validation_date', { defaultValue: 'Date format is invalid.' })
        }
      }
      if (field.type === 'boolean' && typeof item !== 'boolean') {
        return t('validation_boolean', { defaultValue: 'Select true or false.' })
      }
      if (field.type === 'integer' && !Number.isInteger(item)) {
        return t('validation_integer', { defaultValue: 'Enter a valid integer.' })
      }
      if (field.type === 'number' && (typeof item !== 'number' || Number.isNaN(item))) {
        return t('validation_number', { defaultValue: 'Enter a valid number.' })
      }

      for (const ref of validationRefs) {
        if (ref === 'email') {
          const emailRegex = new RegExp(emailPattern)
          if (!emailRegex.test(String(item))) {
            return t('validation_email', { defaultValue: 'Email format is invalid.' })
          }
        }
        if (ref === 'phone') {
          const phoneRegex = new RegExp(phonePattern)
          if (!phoneRegex.test(String(item))) {
            return t('validation_phone', { defaultValue: 'Phone format is invalid.' })
          }
        }
        if (ref.startsWith('regex:')) {
          const pattern = ref.split(':', 2)[1]
          try {
            const regex = new RegExp(pattern)
            if (!regex.test(String(item))) {
              return t('validation_format', { defaultValue: 'Invalid format.' })
            }
          } catch {
            // ignore invalid regex
          }
        }
        if (ref.startsWith('min:')) {
          const threshold = Number(ref.split(':', 2)[1])
          if (typeof item === 'number' && !Number.isNaN(threshold) && item < threshold) {
            return t('validation_min', {
              defaultValue: `Value must be at least ${threshold}.`,
              threshold,
            })
          }
        }
        if (ref.startsWith('min_length:')) {
          const threshold = Number(ref.split(':', 2)[1])
          if (String(item).trim().length < threshold) {
            return t('validation_min_length', {
              defaultValue: `Value must be at least ${threshold} characters long.`,
              threshold,
            })
          }
        }
        const rulePattern = validationRuleMap.get(ref)?.pattern
        if (rulePattern) {
          try {
            const regex = new RegExp(rulePattern)
            if (!regex.test(String(item))) {
              return t('validation_format', { defaultValue: 'Invalid format.' })
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
        return { value: null, error: t('validation_integer', { defaultValue: 'Enter a valid integer.' }) }
      }
      return { value: parsed, error: null }
    }
    if (field.type === 'number') {
      const parsed = Number(raw)
      if (Number.isNaN(parsed)) {
        return { value: null, error: t('validation_number', { defaultValue: 'Enter a valid number.' }) }
      }
      return { value: parsed, error: null }
    }
    if (field.type === 'boolean') {
      if (raw === 'true') return { value: true, error: null }
      if (raw === 'false') return { value: false, error: null }
      return { value: null, error: t('validation_boolean', { defaultValue: 'Select true or false.' }) }
    }
    return { value: raw, error: null }
  }

  const normalizeDraftValue = (): { value: any; error: string | null } => {
    const raw = draftValue.trim()
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
        t('edit_save_failed', { defaultValue: 'Failed to save changes.' })
      setEditError(String(detail))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="group relative flex flex-col space-y-2">
      <Card className={cn(
        "border-slate-200/60 shadow-sm transition-all duration-200 bg-white overflow-hidden rounded-2xl",
        issues.some(i => i.blocking) ? "border-red-200 bg-red-50/10" : "hover:border-blue-200 hover:shadow-md"
      )}>
        <CardContent className="p-0 flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <div className="flex-grow min-w-0 pr-4">
              <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-y-1">
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{field.label}</span>
                {isLocallyRejected ? (
                  <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-200/50 text-[9px] uppercase font-black px-1.5 h-4">
                    {t('field_status_rejected_pending', { defaultValue: 'Rejected (Pending QA)' })}
                  </Badge>
                ) : (
                  state && <FieldBadge status={state.status} />
                )}
                {field.required && (
                  <span className="text-[9px] font-bold text-red-500/60 px-1 border border-red-100 rounded leading-none pt-0.5">REQ</span>
                )}
                {field.calculation && (
                  <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-amber-250 text-[9px] uppercase font-black px-1.5 h-4 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    {t('field_calculated', { defaultValue: 'Calculated' })}
                  </Badge>
                )}
              </div>
              <div className="text-[15px] font-bold text-slate-900 tabular-nums">
                {hasResolvedValue(state?.resolved_value) ? (
                  Array.isArray(state?.resolved_value) ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {state.resolved_value.map((val: any, idx: number) => (
                        <Badge key={idx} variant="secondary" className="bg-slate-100 text-slate-800 py-0.5 px-2 font-bold text-xs rounded-lg border-slate-200">
                          {String(val)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="truncate block">{String(state?.resolved_value)}</span>
                  )
                ) : (
                  <span className="text-slate-300 font-medium italic">{t('awaiting_data')}</span>
                )}
              </div>

              {isEditing && (
                <div className="mt-3 space-y-2">
                  {field.type === 'enum' && !field.repeated ? (
                    <select
                      className={cn(
                        "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200",
                        editError && "border-red-300 focus:ring-red-200",
                      )}
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                    >
                      <option value="">{t('select_value', { defaultValue: 'Select a value' })}</option>
                      {field.enum_options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'boolean' && !field.repeated ? (
                    <select
                      className={cn(
                        "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200",
                        editError && "border-red-300 focus:ring-red-200",
                      )}
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                    >
                      <option value="">{t('select_value', { defaultValue: 'Select a value' })}</option>
                      <option value="true">{t('yes', { defaultValue: 'Yes' })}</option>
                      <option value="false">{t('no', { defaultValue: 'No' })}</option>
                    </select>
                  ) : (
                    <Input
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      placeholder={t('edit_value_placeholder', { defaultValue: 'Enter value' })}
                      aria-invalid={!!editError}
                      className={cn("text-sm", editError && "border-red-300")}
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
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
                    {formatHint && (
                      <span>{t('expected_format', { defaultValue: `Expected format: ${formatHint}`, format: formatHint })}</span>
                    )}
                    {field.repeated && (
                      <span>{t('comma_separated', { defaultValue: 'Comma-separated values' })}</span>
                    )}
                  </div>
                  {editError && (
                    <p className="text-[11px] text-red-600 font-semibold">{editError}</p>
                  )}
                </div>
              )}

              {confidence > 0 && state?.status !== 'confirmed' && (
                <div className="mt-3 flex items-center space-x-3">
                  <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-1000',
                        confidence > 0.8 ? 'bg-emerald-500' : confidence > 0.5 ? 'bg-blue-500' : 'bg-red-500',
                      )}
                      style={{ width: `${confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{(confidence * 100).toFixed(0)}% {t('certainty')}</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {proposedState && !isLocallyRejected && !isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl transition-all active:scale-95 cursor-pointer"
                    onClick={() => onReject(proposedState.field_path)}
                  >
                    {t('reject_match')}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
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
                    className="border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl transition-all active:scale-95 cursor-pointer"
                    onClick={() => onUndoReject && onUndoReject(proposedState.field_path)}
                  >
                    {t('undo_rejection', { defaultValue: 'Undo' })}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
                    onClick={() => onConfirm(proposedState.field_path)}
                  >
                    {t('confirm_match')}
                  </Button>
                </>
              )}
              {canEdit && !isEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700 text-[10px] font-black uppercase tracking-widest h-8 px-3 rounded-xl transition-all active:scale-95 cursor-pointer"
                  onClick={handleStartEdit}
                >
                  <Pencil className="w-3 h-3 mr-1.5" />
                  {t('edit_field', { defaultValue: 'Edit' })}
                </Button>
              )}
              {isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700 text-[10px] font-black uppercase tracking-widest h-8 px-3 rounded-xl transition-all active:scale-95 cursor-pointer"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest h-8 px-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? t('saving', { defaultValue: 'Saving...' }) : t('save', { defaultValue: 'Save' })}
                  </Button>
                </>
              )}
              {state?.status === 'confirmed' && (
                <div className="p-1 px-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Source Evidence Provenance */}
          {sourceEvidence.length > 0 && (
            <div className="px-4 pb-4">
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center space-x-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <Quote className="w-2.5 h-2.5" />
                  <span>{t('source_provenance')}</span>
                </div>
                {sourceEvidence.map((ev) => (
                  <EvidenceQuote key={ev.evidence_id} ev={ev} />
                ))}
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
                "flex items-center space-x-2 text-[10px] font-bold p-1 px-2 rounded-lg w-fit",
                issue.blocking ? "bg-red-50 text-red-600 border border-red-100" : "bg-amber-50 text-amber-600 border border-amber-100"
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
