import type { CaseFile } from './api'

function findFullName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  if (typeof obj.full_name === 'string' && obj.full_name.trim()) return obj.full_name.trim()
  if (typeof obj.name === 'string' && obj.name.trim() && Object.keys(obj).length <= 3) return obj.name.trim()
  for (const v of Object.values(obj)) {
    const found = findFullName(v)
    if (found) return found
  }
  return null
}

export function getCaseSubject(c: CaseFile): string | null {
  const meta = (c.metadata?.subject_name as string) || (c.metadata?.display_name as string)
  if (meta && meta.trim()) return meta.trim()
  const fromState = findFullName(c.current_schema_state)
  return fromState
}

export function getCaseTitle(c: CaseFile): string {
  return getCaseSubject(c) || 'Untitled Case'
}

export function formatCaseDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

export function getShortId(c: CaseFile): string {
  return c.case_id.slice(0, 8)
}

export function formatCompactTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function formatProgress(c: CaseFile): string {
  if ((c.completion_pct ?? 0) === 0) return 'Not started'
  if (c.fields_total) return `${c.fields_confirmed}/${c.fields_total} · ${Math.round(c.completion_pct ?? 0)}%`
  return `${Math.round(c.completion_pct ?? 0)}%`
}
