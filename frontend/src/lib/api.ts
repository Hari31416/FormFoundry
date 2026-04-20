import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_BASE_URL,
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
  type: 'string' | 'date' | 'enum' | 'boolean' | 'integer' | 'number'
  required: boolean
  repeated: boolean
  enum_options: string[]
  default_question: string
  clarification_question: string
  help_text: string
  conditions?: {
    depends_on?: string
    equals?: unknown
    not_equals?: unknown
  }
}

export interface TemplateFieldGroup {
  group_id: string
  label: string
  description: string
  field_paths: string[]
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
  created_at: string
  updated_at: string
}

export interface CaseDetail extends CaseFile {
  template: TemplateDefinition
  field_states: FieldState[]
}

export interface Evidence {
  evidence_id: string
  case_id: string
  source_type: string
  storage_uri: string
  raw_text?: string
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
  field_path: string
  field_paths: string[]
  field_labels: string[]
  question: string
  reason: string
  priority: number
}

export const getTemplates = () => api.get<TemplateDefinition[]>('/templates').then((res) => res.data)
export const createCase = (data: { template_id: string; template_version?: number }) =>
  api.post<CaseFile>('/cases', data).then((res) => res.data)
export const getCase = (id: string) => api.get<CaseDetail>(`/cases/${id}`).then((res) => res.data)
export const getCaseSchemaState = (id: string) => api.get<any>(`/cases/${id}/schema-state`).then((res) => res.data)
export const getEvidence = (id: string) => api.get<Evidence[]>(`/cases/${id}/evidence`).then((res) => res.data)
export const getValidationIssues = (id: string) => api.get<ValidationIssue[]>(`/cases/${id}/validation`).then((res) => res.data)
export const getArtifacts = (id: string) => api.get<Artifact[]>(`/cases/${id}/artifacts`).then((res) => res.data)
export const getNextQuestion = (id: string) => api.get<NextQuestion | null>(`/cases/${id}/conversation/next-question`).then((res) => res.data)

export const addTextEvidence = (id: string, text: string) =>
  api.post(`/cases/${id}/evidence/text`, { text }).then((res) => res.data)
export const uploadFileEvidence = (id: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/cases/${id}/evidence/upload`, formData).then((res) => res.data)
}

export const submitTurn = (id: string, message: string) =>
  api.post(`/cases/${id}/conversation/turns`, { message }).then((res) => res.data)

export const editField = (caseId: string, fieldPath: string, value: any) =>
  api.post(`/cases/${caseId}/fields/${fieldPath}/edit`, { value }).then((res) => res.data)
export const confirmField = (caseId: string, fieldPath: string) =>
  api.post(`/cases/${caseId}/fields/${fieldPath}/confirm`, {}).then((res) => res.data)

export const approveCase = (id: string) => api.post(`/cases/${id}/approve`).then((res) => res.data)
export const generateArtifact = (id: string, type: string) =>
  api.post(`/cases/${id}/artifacts`, { artifact_type: type }).then((res) => res.data)

export const getDownloadUrl = (caseId: string, artifactId: string) =>
  `${API_BASE_URL}/cases/${caseId}/artifacts/${artifactId}/download`
