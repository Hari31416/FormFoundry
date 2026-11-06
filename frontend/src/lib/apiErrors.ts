export function apiErrorMessage(error: unknown, fallback: string): string {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: unknown }
  const detail = candidate?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((entry) => entry && typeof entry.msg === 'string' ? [entry.msg] : [])
    if (messages.length) return [...new Set(messages)].join('\n')
  }
  if (detail && typeof detail === 'object' && 'msg' in detail && typeof detail.msg === 'string') return detail.msg
  return typeof candidate?.message === 'string' ? candidate.message : fallback
}
