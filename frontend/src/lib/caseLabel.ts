import i18next from 'i18next'
import type { CaseFile } from './api'
import { getActiveLocale } from './dateLocale'

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
  for (const value of [c.metadata?.subject_name, c.metadata?.display_name]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const fromState = findFullName(c.current_schema_state)
  return fromState
}

export function getCaseTitle(c: CaseFile): string {
  const title = c.metadata?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  return i18next.t('case_title_fallback', { id: getShortId(c) })
}

export function formatCaseDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(getActiveLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

export function getShortId(c: CaseFile): string {
  return c.case_id.slice(0, 8)
}

export function formatCompactTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return i18next.t('time_now')
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  return new Intl.DateTimeFormat(getActiveLocale(), { day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function formatProgress(c: CaseFile): string {
  if (!c.fields_total) return i18next.t('case_progress_unavailable')
  const addressed = (c.fields_collected ?? c.fields_confirmed) + (c.fields_waived ?? 0)
  if (!addressed) return i18next.t('case_progress_empty')
  return i18next.t('case_progress_fields', {
    addressed,
    total: c.fields_total,
    percent: Math.round(c.completion_pct ?? 0),
  })
}
