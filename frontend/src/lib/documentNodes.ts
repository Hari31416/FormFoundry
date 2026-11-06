import type { DocumentDefinition, DocumentExtraction, TemplateField } from './api'

export function buildDocumentNode(definition: DocumentDefinition, extractions: DocumentExtraction[], field: TemplateField): TemplateField {
  if (!/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)*$/.test(field.path) || !field.label.trim()) throw new Error('invalid_fields')
  if (extractions.some((item) => !definition.fields.includes(item.field) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(item.key))) throw new Error('invalid_keys')
  if (new Set(extractions.map((item) => item.key)).size !== extractions.length) throw new Error('duplicate_keys')
  return {
    ...field, type: 'document', repeated: false, calculation: null, document_source: null,
    schema: undefined, allow_document_extraction: true, sensitivity: 'sensitive',
    document: { country: definition.country, document_type: definition.document_type, extractions: extractions.map((item) => ({ ...item })) },
  }
}

export function documentPathsConflict(fields: TemplateField[], existing: TemplateField[]): boolean {
  return fields.some((field) => existing.some((other) => field.path === other.path || field.path.startsWith(`${other.path}.`) || other.path.startsWith(`${field.path}.`)))
}

export function titleFieldPaths(fields: TemplateField[], prefix = ''): string[] {
  return fields.flatMap((field) => {
    const path = !prefix || field.path.startsWith(`${prefix}.`) ? field.path : `${prefix}.${field.path}`
    if (field.type === 'document') return (field.document?.extractions ?? []).map((item) => `${path}.${item.key}`)
    if (field.type === 'object') return titleFieldPaths(field.schema ?? [], path)
    return field.type === 'list_of_objects' ? [] : [path]
  })
}
