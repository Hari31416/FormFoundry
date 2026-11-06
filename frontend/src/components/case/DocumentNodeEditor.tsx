import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getDocumentTypes, type DocumentDefinition, type DocumentExtraction } from '@/lib/api'

export function DocumentNodeEditor({ definition, extractions, onDefinition, onExtractions }: {
  definition: DocumentDefinition | null
  extractions: DocumentExtraction[]
  onDefinition: (definition: DocumentDefinition) => void
  onExtractions: (extractions: DocumentExtraction[]) => void
}) {
  const { t } = useTranslation()
  const catalog = useQuery({ queryKey: ['document-types'], queryFn: getDocumentTypes, staleTime: 300_000 })
  return (
    <div className="space-y-4 border-l-2 border-pine bg-paper p-4" data-testid="document-node-editor">
      <p className="text-xs leading-relaxed text-ink-soft">{t('document_builder.description')}</p>
      <label className="block space-y-1 text-xs font-semibold text-ink">
        <span>{t('document_builder.document_type')}</span>
        <select value={definition ? `${definition.country}/${definition.document_type}` : ''} disabled={catalog.isPending}
          className="w-full h-10 px-3 bg-card-warm border border-line rounded-md text-ink focus:outline-none focus:ring-1 focus:ring-pine/25"
          onChange={(event) => {
            const value = catalog.data?.find((item) => `${item.country}/${item.document_type}` === event.target.value)
            if (value) onDefinition(value)
          }}>
          <option value="">{t(catalog.isPending ? 'document_builder.loading' : 'document_builder.select_type')}</option>
          {catalog.data?.map((item) => <option key={`${item.country}/${item.document_type}`} value={`${item.country}/${item.document_type}`}>{t(`documents.types.${item.document_type}`, { defaultValue: item.document_type })} · {item.country}</option>)}
        </select>
      </label>
      {catalog.isError && <p role="alert" className="text-xs text-terracotta">{t('document_builder.catalog_error')} <button type="button" className="underline" onClick={() => void catalog.refetch()}>{t('document_builder.retry')}</button></p>}
      {definition && <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold text-ink">{t('document_builder.extracted_fields')}</legend>
        {definition.fields.map((field) => {
          const mapping = extractions.find((item) => item.field === field)
          const label = t(`documents.fields.${field}`, { defaultValue: field })
          return <div key={field} className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={!!mapping} onChange={(event) => onExtractions(event.target.checked ? [...extractions, { field, key: field }] : extractions.filter((item) => item.field !== field))} />
              {label}
            </label>
            {mapping && <label className="block text-xs text-ink-soft">
              <span className="sr-only">{t('document_builder.key_for', { field: label })}</span>
              <input value={mapping.key} onChange={(event) => onExtractions(extractions.map((item) => item.field === field ? { ...item, key: event.target.value } : item))}
                placeholder={t('document_builder.dictionary_key')} className="h-9 w-full rounded-md border border-line bg-card-warm px-2 font-mono text-xs text-ink focus:outline-none focus:ring-1 focus:ring-pine/25" />
            </label>}
          </div>
        })}
      </fieldset>}
    </div>
  )
}
