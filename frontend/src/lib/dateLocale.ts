import type { Locale } from 'date-fns'
import { enUS, hi } from 'date-fns/locale'
import i18n from '@/i18n'

export function getDateLocale(): Locale {
  return i18n.language?.startsWith('hi') ? hi : enUS
}

export function getActiveLocale(): string {
  return i18n.language || 'en'
}
