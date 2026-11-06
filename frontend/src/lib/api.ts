import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('formfoundry_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(response => response, error => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && error.config?.url !== '/auth/token') {
    localStorage.removeItem('formfoundry_access_token')
    window.dispatchEvent(new Event('formfoundry:unauthorized'))
  }
  return Promise.reject(error)
})

export type CaseStatus =
  | 'draft'
  | 'collecting_input'
  | 'extracting'
  | 'resolving'
  | 'awaiting_user'
  | 'ready_for_review'
  | 'approved'
  | 'artifact_generating'
  | 'completed'
  | 'failed'

export type FieldStatus =
  | 'missing'
  | 'proposed'
  | 'confirmed'
  | 'conflicted'
  | 'invalid'
  | 'waived'

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface TemplateField {
  path: string
  label: string
  type: 'string' | 'date' | 'enum' | 'boolean' | 'integer' | 'number' | 'object' | 'list_of_objects'
  required: boolean
  repeated: boolean
  enum_options: string[]
  default_question: string
  clarification_question: string
  help_text: string
  document_source?: { country: string; document_type: string; field: string } | null
  conditions?: Record<string, any>
  validation_refs?: string[]
  calculation?: string | null
  schema?: TemplateField[]
}

export interface TemplateFieldGroup {
  group_id: string
  label: string
  description: string
  field_paths: string[]
}

export interface ValidationRule {
  rule_id: string
  type: string
  pattern?: string
}

export interface TemplateDefinition {
  template_id: string
  template_version: number
  name: string
  domain: string
  description: string
  schema: TemplateField[]
  field_groups: TemplateFieldGroup[]
  supported_artifacts: string[]
  conversation_config?: {
    tone?: string
    title_pattern?: string
    explanation_style?: string
    reask_cooldown_turns?: number
    max_grouped_fields?: number
  }
  renderer_config?: {
    artifact_type?: string
    template_asset?: string
    pdf_title?: string
  }
  validation_rules?: ValidationRule[]
}

export interface FieldState {
  field_path: string
  resolved_value: any
  status: FieldStatus
  confidence: number
  candidate_ids: string[]
  source_evidence_ids: string[]
}

export interface CaseFile {
  case_id: string
  template_id: string
  template_version: number
  status: CaseStatus
  created_by: string
  current_schema_state: Record<string, any>
  review_status: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  completion_pct: number
  fields_collected: number
  fields_waived: number
  fields_confirmed: number
  fields_total: number
}

export interface CaseDetail extends CaseFile {
  template: TemplateDefinition
  field_states: FieldState[]
}

export interface DocumentKind {
  country: string
  document_type: string
}

export interface DocumentDefinition extends DocumentKind {
  version: string
  type_indicators: string[]
  fields: string[]
  required_fields: string[]
}

export interface DocumentCheck {
  code: string
  scope: 'classification' | 'extraction' | 'format' | 'authenticity' | 'holder'
  outcome: 'pass' | 'fail' | 'inconclusive' | 'skipped' | 'error'
  field: string | null
}

export interface DocumentAnalysis {
  schema_version: 1
  analysis_id: string
  analyzed_at: string
  declared: DocumentKind | null
  detected: DocumentKind | null
  classification_confidence?: number | null
  type_source_quote?: string | null
  status: 'matched' | 'detected' | 'mismatch' | 'needs_review' | 'error'
  fields: Record<string, { value: string; source_quote: string; confidence: number }>
  checks: DocumentCheck[]
  stages: Array<{
    stage: string
    version: string
    status: 'completed' | 'error'
    error_code: string | null
    checks: DocumentCheck[]
    regions: Array<{ page: number; x0: number; y0: number; x1: number; y1: number; label: string; confidence: number }>
  }>
  authenticity_checked: boolean
}

export interface DocumentUpload {
  file: File
  documentType?: string
}

export interface Evidence {
  evidence_id: string
  case_id: string
  source_type: string
  source_subtype: string
  storage_uri: string
  raw_text?: string
  parsed_payload: Record<string, any>
  document_analysis?: DocumentAnalysis | null
  metadata: Record<string, any>
  source_refs: Array<Record<string, any>>
  created_by: string
  created_at: string
}

export interface ValidationIssue {
  issue_id: string
  field_path: string
  severity: 'error' | 'warning' | 'info'
  message: string
  blocking: boolean
}

export interface Artifact {
  artifact_id: string
  artifact_type: string
  status: 'pending' | 'generated' | 'failed'
  storage_uri?: string
}

export interface NextQuestion {
  kind?: 'field' | 'document_upload'
  documents?: DocumentKind[]
  field_path: string
  field_paths: string[]
  field_labels: string[]
  question: string
  reason: string
  priority: number
}

export interface ConversationTurn {
  turn_id: string
  case_id: string
  role: 'user' | 'assistant'
  message: string
  related_field_path: string | null
  metadata: Record<string, any>
  created_at: string
}

export interface ConversationTurnResponse {
  user_turn: ConversationTurn
  assistant_turn: ConversationTurn | null
  next_question: NextQuestion | null
}

export const getTemplates = () => api.get<TemplateDefinition[]>('/templates').then((res) => res.data)
export const createTemplate = (data: TemplateDefinition) =>
  api.post<TemplateDefinition>('/templates', data).then((res) => res.data)
export const updateTemplate = (templateId: string, version: number, data: TemplateDefinition) =>
  api.put<TemplateDefinition>(`/templates/${templateId}/versions/${version}`, data).then((res) => res.data)
export const deleteTemplate = (templateId: string, version: number) =>
  api.delete(`/templates/${templateId}/versions/${version}`).then((res) => res.data)
export const getCases = (params?: { template_id?: string; limit?: number; offset?: number }) =>
  api.get<CaseFile[]>('/cases', { params }).then((res) => res.data)
export const createCase = (data: { template_id: string; template_version?: number; metadata?: Record<string, any> }) =>
  api.post<CaseFile>('/cases', data).then((res) => res.data)
export const getCase = (id: string) => api.get<CaseDetail>(`/cases/${id}`).then((res) => res.data)
export const updateCaseTitle = (caseId: string, title: string) =>
  api.put<CaseDetail>(`/cases/${caseId}/title`, { title }).then((res) => res.data)
export const deleteCase = (id: string) => api.delete(`/cases/${id}`).then((res) => res.data)
export const updateCaseLanguage = (caseId: string, language: string) =>
  api.put<CaseDetail>(`/cases/${caseId}/language`, { language }).then((res) => res.data)
export const getCaseSchemaState = (id: string) => api.get<any>(`/cases/${id}/schema-state`).then((res) => res.data)
export const getEvidence = (id: string) => api.get<Evidence[]>(`/cases/${id}/evidence`).then((res) => res.data)
export const getValidationIssues = (id: string) => api.get<ValidationIssue[]>(`/cases/${id}/validation`).then((res) => res.data)
export const getArtifacts = (id: string) => api.get<Artifact[]>(`/cases/${id}/artifacts`).then((res) => res.data)
export const getNextQuestion = (id: string) => api.get<NextQuestion | null>(`/cases/${id}/conversation/next-question`).then((res) => res.data)
export const getConversationTurns = (id: string) => api.get<ConversationTurn[]>(`/cases/${id}/conversation/turns`).then((res) => res.data)

export const addTextEvidence = (id: string, text: string) =>
  api.post(`/cases/${id}/evidence/text`, { text }).then((res) => res.data)
export const getDocumentTypes = () =>
  api.get<DocumentDefinition[]>('/documents/types').then((res) => res.data)

export const uploadFileEvidence = (id: string, file: File, documentType?: string) => {
  const formData = new FormData()
  formData.append('file', file)
  if (documentType) {
    formData.append('document_type', documentType)
    formData.append('document_country', 'IN')
  }
  return api.post(`/cases/${id}/evidence/upload`, formData).then((res) => res.data)
}

export const submitTurn = (id: string, message: string, language?: string) =>
  api.post<ConversationTurnResponse>(`/cases/${id}/conversation/turns`, { message, language }).then((res) => res.data)

export const detectLanguage = (text: string) =>
  api.post<{ language: string }>('/languages/detect', { text }).then((res) => res.data)

export const editField = (caseId: string, fieldPath: string, value: any) =>
  api.post(`/cases/${caseId}/fields/${fieldPath}/edit`, { value }).then((res) => res.data)
export const confirmField = (caseId: string, fieldPath: string) =>
  api.post(`/cases/${caseId}/fields/${fieldPath}/confirm`, {}).then((res) => res.data)
export const rejectField = (caseId: string, fieldPath: string) =>
  api.post(`/cases/${caseId}/fields/${fieldPath}/reject`, {}).then((res) => res.data)
export const bulkRejectFields = (caseId: string, fieldPaths: string[]) =>
  api.post(`/cases/${caseId}/fields/reject-bulk`, { field_paths: fieldPaths }).then((res) => res.data)

export const approveCase = (id: string) => api.post(`/cases/${id}/approve`).then((res) => res.data)
export const generateArtifact = (id: string, type: string) =>
  api.post(`/cases/${id}/artifacts`, { artifact_type: type }).then((res) => res.data)

export interface LanguageConfig {
  is_translation_enabled: boolean
  is_detection_enabled: boolean
  is_tts_enabled: boolean
  is_stt_enabled: boolean
}

export const getLanguageConfig = () =>
  api.get<LanguageConfig>('/languages/config').then((res) => res.data)

export const textToSpeech = (text: string, language: string) =>
  api.post('/languages/tts', { text, language }, { responseType: 'blob' }).then((res) => res.data)

export const downloadArtifact = async (caseId: string, artifactId: string) => {
  const response = await api.get(`/cases/${caseId}/artifacts/${artifactId}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  const disposition = response.headers['content-disposition'] || ''
  anchor.download = /filename="?([^";]+)"?/.exec(disposition)?.[1] || `artifact-${artifactId}`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
