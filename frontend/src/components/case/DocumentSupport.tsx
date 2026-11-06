import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  getDocumentTypes,
  type DocumentAnalysis,
  type DocumentUpload,
  type DocumentKind,
} from '@/lib/api'

export interface DocumentUploadMutation {
  isPending: boolean
  mutate: (upload: DocumentUpload) => void
}

export function DocumentTypeSelect({ value, onChange, disabled }: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const { data: types } = useQuery({
    queryKey: ['document-types'],
    queryFn: getDocumentTypes,
    staleTime: 300_000,
  })
  return (
    <label className="flex items-center gap-2 text-xs text-ink-soft">
      <span>{t('documents.upload_type')}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="min-w-0 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
      >
        <option value="">{t('documents.auto')}</option>
        {types?.filter((item) => item.country === 'IN').map((item) => (
          <option key={item.document_type} value={item.document_type}>
            {t(`documents.types.${item.document_type}`, { defaultValue: item.document_type })}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DocumentAnalysisSummary({ analysis }: { analysis?: DocumentAnalysis | null }) {
  const { t } = useTranslation()
  if (!analysis) return null
  const kind = analysis.detected
  const issues = analysis.checks.filter((check) => ['fail', 'inconclusive', 'error'].includes(check.outcome))
  return (
    <div className="mt-3 rounded-md border border-line bg-paper p-3 text-xs text-ink" data-testid="document-analysis">
      <p className="font-semibold">
        {kind && `${t(`documents.types.${kind.document_type}`, { defaultValue: kind.document_type })} · `}
        {t(`documents.status.${analysis.status}`)}
      </p>
      {analysis.status === 'mismatch' && analysis.declared && (
        <p className="mt-1 text-terracotta">
          {t('documents.expected', { type: t(`documents.types.${analysis.declared.document_type}`, { defaultValue: analysis.declared.document_type }) })}
        </p>
      )}
      {!analysis.authenticity_checked && <p className="mt-1 text-ink-soft">{t('documents.basic_only')}</p>}
      {issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-terracotta">
          {issues.map((check, index) => (
            <li key={`${check.code}-${check.field ?? ''}-${index}`}>
              {t(`documents.checks.${check.code}`, { defaultValue: t('documents.review_check') })}
              {check.field && ` · ${t(`documents.fields.${check.field}`, { defaultValue: check.field })}`}
            </li>
          ))}
        </ul>
      )}
      {Object.keys(analysis.fields).length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-pine">{t('documents.extracted_fields')}</summary>
          <dl className="mt-2 space-y-2">
            {Object.entries(analysis.fields).map(([key, field]) => (
              <div key={key}>
                <dt className="text-ink-soft">{t(`documents.fields.${key}`, { defaultValue: key })}</dt>
                <dd className="whitespace-pre-wrap break-words">{field.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  )
}

export function DocumentUploadQuestion({ documents, mutation, clearError, error, disabled }: {
  documents: DocumentKind[]
  mutation: DocumentUploadMutation
  clearError: () => void
  error: string | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 space-y-3" data-testid="document-upload-question">
      <p className="text-xs text-ink-soft">{t('documents.upload_only')}</p>
      {documents.map((document) => {
        const name = t(`documents.types.${document.document_type}`, { defaultValue: document.document_type })
        return (
          <label key={`${document.country}/${document.document_type}`} className="block rounded-md border border-line bg-paper p-3 text-sm text-ink">
            <span className="mb-2 block font-semibold">{name}</span>
            <input
              aria-label={t('documents.upload_named', { type: name })}
              type="file"
              accept="image/*,.pdf,application/pdf"
              disabled={mutation.isPending || disabled}
              className="block w-full min-w-0 text-xs text-ink-soft file:mr-2 file:rounded-md file:border-0 file:bg-pine file:px-3 file:py-2 file:font-semibold file:text-primary-foreground"
              onChange={(event) => {
                clearError()
                const file = event.target.files?.[0]
                if (file) mutation.mutate({ file, documentType: document.document_type })
                event.target.value = ''
              }}
            />
          </label>
        )
      })}
      {mutation.isPending && <p role="status" className="text-xs text-pine">{t('uploading_ocr')}</p>}
      {error && <p role="alert" className="text-xs text-terracotta">{error}</p>}
    </div>
  )
}
