import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { updateCaseTitle, type CaseFile } from '@/lib/api'
import { getCaseTitle } from '@/lib/caseLabel'

export function CaseTitleEditor({ caseFile }: { caseFile: CaseFile }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const mutation = useMutation({
    mutationFn: (title: string) => updateCaseTitle(caseFile.case_id, title),
    onSuccess: (updated) => {
      queryClient.setQueryData(['case', caseFile.case_id], updated)
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      setEditing(false)
    },
  })

  if (!editing) return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="text-[13px] font-semibold text-ink truncate" title={getCaseTitle(caseFile)}>{getCaseTitle(caseFile)}</span>
      <button type="button" aria-label={t('case_rename')} onClick={() => {
        setDraft(getCaseTitle(caseFile))
        mutation.reset()
        setEditing(true)
      }} className="p-1.5 rounded text-ink-faint hover:text-ink hover:bg-pine-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/50 shrink-0 cursor-pointer">
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )

  return (
    <form className="flex flex-wrap items-center gap-1.5 max-w-md" onSubmit={(event) => {
      event.preventDefault()
      if (draft.trim()) mutation.mutate(draft.trim())
    }}>
      <input autoFocus aria-label={t('case_title')} value={draft} maxLength={160} required
        disabled={mutation.isPending} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape' && !mutation.isPending) setEditing(false) }}
        className="min-w-0 w-48 sm:w-64 rounded border border-line-strong bg-white px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-pine/40" />
      <button type="submit" disabled={!draft.trim() || mutation.isPending} className="px-2.5 py-1.5 text-xs font-semibold rounded bg-pine text-paper hover:bg-pine-deep disabled:opacity-50 cursor-pointer">{t('case_title_save')}</button>
      <button type="button" disabled={mutation.isPending} onClick={() => setEditing(false)} className="px-2.5 py-1.5 text-xs rounded text-ink-soft hover:bg-paper cursor-pointer">{t('case_title_cancel')}</button>
      {mutation.isError && <span role="alert" className="w-full text-xs text-terracotta">{t('case_title_error')}</span>}
    </form>
  )
}
