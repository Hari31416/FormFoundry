import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Quote,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  TemplateField,
  FieldState,
  FieldStatus,
  Evidence
} from '@/lib/api'

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
export function getFieldBadge(status: FieldStatus) {
  switch (status) {
    case 'confirmed':
      return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-200/50 text-[9px] uppercase font-black px-1.5 h-4">Confirmed</Badge>
    case 'proposed':
      return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-blue-200/50 text-[9px] uppercase font-black px-1.5 h-4">Proposed</Badge>
    case 'conflicted':
      return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-200/50 text-[9px] uppercase font-black px-1.5 h-4">Conflicted</Badge>
    case 'missing':
      return <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] uppercase font-black px-1.5 h-4">Missing</Badge>
    default:
      return null
  }
}

// Subcomponent: Source Evidence Quote Renderer with expandable toggler
export function EvidenceQuote({ ev }: { ev: Evidence }) {
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
          via {ev.source_type.replace('_', ' ')}
          {ev.source_subtype ? ` · ${ev.source_subtype}` : ''}
        </div>
        {isLongText && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[9px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest transition-colors"
          >
            {isExpanded ? 'Show Less' : 'Show More'}
          </button>
        )}
      </div>
    </div>
  )
}

interface FieldRowProps {
  field: TemplateField
  state: FieldState | undefined
  issues: any[]
  allEvidence: Evidence[]
  onConfirm: (path: string) => void
  onReject: (path: string) => void
}

export function FieldRow({
  field,
  state,
  issues,
  allEvidence,
  onConfirm,
  onReject
}: FieldRowProps) {
  if (!field) return null
  const confidence = state?.confidence ?? 0
  const proposedState = state?.status === 'proposed' ? state : undefined

  // Resolve source evidence
  const sourceEvidence = (state?.source_evidence_ids || [])
    .map((id) => allEvidence.find((ev) => ev.evidence_id === id))
    .filter((ev): ev is Evidence => !!ev && !!getEvidenceDisplayText(ev))

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
                {state && getFieldBadge(state.status)}
                {field.required && (
                  <span className="text-[9px] font-bold text-red-500/60 px-1 border border-red-100 rounded leading-none pt-0.5">REQ</span>
                )}
              </div>
              <div className="text-[15px] font-bold text-slate-900 tabular-nums truncate">
                {hasResolvedValue(state?.resolved_value) ? (
                  String(state?.resolved_value)
                ) : (
                  <span className="text-slate-300 font-medium italic">Awaiting data...</span>
                )}
              </div>

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
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{(confidence * 100).toFixed(0)}% Certainty</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {proposedState && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl transition-all active:scale-95"
                    onClick={() => onReject(proposedState.field_path)}
                  >
                    Reject Match
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                    onClick={() => onConfirm(proposedState.field_path)}
                  >
                    Confirm Match
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
                  <span>Source Provenance</span>
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
