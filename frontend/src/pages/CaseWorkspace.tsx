import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Plus,
  Zap,
  MessageSquare,
  Layout
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CaseDetail,
  FieldState,
  TemplateField,
  addTextEvidence,
  approveCase,
  confirmField,
  generateArtifact,
  getArtifacts,
  getCase,
  getEvidence,
  getNextQuestion,
  getValidationIssues,
  rejectField,
  submitTurn,
  detectLanguage,
  getLanguageConfig,
  textToSpeech,
  uploadFileEvidence,
  Evidence,
  getConversationTurns
} from '@/lib/api'

import { DropdownMenuComponent } from '@/components/case/DropdownMenuComponent'
import { SimplifiedChatView } from '@/components/case/SimplifiedChatView'
import { DetailedWorkspaceView } from '@/components/case/DetailedWorkspaceView'

function getValueByPath(payload: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = payload
  for (const segment of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined
    }
    const record = cursor as Record<string, unknown>
    if (!(segment in record)) {
      return undefined
    }
    cursor = record[segment]
  }
  return cursor
}

function isFieldActive(field: TemplateField, schemaState: Record<string, unknown>): boolean {
  const conditions = field.conditions ?? {}
  const dependsOn = conditions.depends_on
  if (!dependsOn) {
    return true
  }

  const actualValue = getValueByPath(schemaState, dependsOn)
  if ('equals' in conditions) {
    return actualValue === conditions.equals
  }
  if ('not_equals' in conditions) {
    return actualValue !== conditions.not_equals
  }
  return Boolean(actualValue)
}

function isQuestionOutstanding(field: TemplateField, state: FieldState): boolean {
  if (field.required && state.status === 'missing') {
    return true
  }
  if (state.status === 'conflicted') {
    return true
  }
  if (field.required && state.status === 'proposed' && state.confidence < 0.9) {
    return true
  }
  if (!field.required && state.status === 'missing') {
    return true
  }
  return false
}

export default function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isSimplifiedView, setIsSimplifiedView] = useState(true)
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('review')
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: caseDetail, isLoading: isLoadingCase } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCase(caseId!),
    enabled: !!caseId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const { data: evidence } = useQuery({
    queryKey: ['evidence', caseId],
    queryFn: () => getEvidence(caseId!),
    enabled: !!caseId,
    refetchInterval: () => {
      const status = caseDetail?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const { data: validation } = useQuery({
    queryKey: ['validation', caseId],
    queryFn: () => getValidationIssues(caseId!),
    enabled: !!caseId,
    refetchInterval: () => {
      const status = caseDetail?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts', caseId],
    queryFn: () => getArtifacts(caseId!),
    enabled: !!caseId,
    refetchInterval: () => {
      const status = caseDetail?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const nextQuestionQuery = useQuery({
    queryKey: ['next-question', caseId],
    queryFn: () => getNextQuestion(caseId!),
    enabled: !!caseId,
    refetchInterval: () => {
      const status = caseDetail?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })
  const nextQuestion = nextQuestionQuery.data

  const { data: turns } = useQuery({
    queryKey: ['turns', caseId],
    queryFn: () => getConversationTurns(caseId!),
    enabled: !!caseId && !nextQuestionQuery.isLoading,
    refetchInterval: () => {
      const status = caseDetail?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const { data: langConfig } = useQuery({
    queryKey: ['languages-config'],
    queryFn: () => getLanguageConfig(),
  })

  const [playingQuestion, setPlayingQuestion] = useState<string | null>(null)
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null)
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null)

  const handlePlayTTS = async (text: string, lang: string) => {
    if (playingQuestion === text) {
      if (audioInstance) {
        audioInstance.pause()
        audioInstance.currentTime = 0
      }
      setPlayingQuestion(null)
      return
    }

    try {
      setLoadingAudio(text)
      const audioBlob = await textToSpeech(text, lang)
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      setAudioInstance(audio)
      setLoadingAudio(null)
      setPlayingQuestion(text)

      audio.onended = () => {
        setPlayingQuestion(null)
        URL.revokeObjectURL(audioUrl)
      }
      audio.onerror = () => {
        setPlayingQuestion(null)
        URL.revokeObjectURL(audioUrl)
      }
      await audio.play()
    } catch (err) {
      console.error('Failed to play TTS audio:', err)
      setLoadingAudio(null)
      setPlayingQuestion(null)
    }
  }

  const submitTurnMutation = useMutation({
    mutationFn: async (msg: string) => {
      try {
        const detection = await detectLanguage(msg)
        return submitTurn(caseId!, msg, detection.language)
      } catch (err) {
        console.error('Failed to detect language, falling back to standard submit:', err)
        return submitTurn(caseId!, msg)
      }
    },
    onSuccess: () => {
      setChatInput('')
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
    },
  })

  const addTextMutation = useMutation({
    mutationFn: (text: string) => addTextEvidence(caseId!, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      setIsEvidenceModalOpen(false)
      const el = document.getElementById('evidence-text') as HTMLTextAreaElement
      if (el) el.value = ''
    },
  })

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => uploadFileEvidence(caseId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      setUploadError(null)
      setIsEvidenceModalOpen(false)
      const input = document.getElementById('evidence-file') as HTMLInputElement | null
      if (input) input.value = ''
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail || 'Upload failed. Only images and PDFs are supported.'
      setUploadError(String(detail))
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => approveCase(caseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (type: string) => generateArtifact(caseId!, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', caseId] })
    },
  })

  const confirmFieldMutation = useMutation({
    mutationFn: (fieldPath: string) => confirmField(caseId!, fieldPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
    },
  })

  const rejectFieldMutation = useMutation({
    mutationFn: (fieldPath: string) => rejectField(caseId!, fieldPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
    },
  })

  const bulkConfirmMutation = useMutation({
    mutationFn: async (fieldPaths: string[]) => {
      await Promise.all(fieldPaths.map((path) => confirmField(caseId!, path)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
    },
  })

  const mergedMessages = React.useMemo(() => {
    const list: Array<{
      id: string
      role: 'user' | 'assistant' | 'system'
      message: string
      created_at: string
      type: 'turn' | 'evidence' | 'system'
      metadata?: any
    }> = []

    if (turns) {
      turns.forEach((t) => {
        list.push({
          id: t.turn_id,
          role: t.role,
          message: t.message,
          created_at: t.created_at,
          type: 'turn',
          metadata: t.metadata,
        })
      })
    }

    if (evidence) {
      evidence.forEach((ev) => {
        if (ev.source_type === 'chat_answer') return

        let displayMessage = ''
        if (ev.source_type === 'pdf_upload' || ev.source_type === 'image_upload') {
          displayMessage = `📎 Uploaded file: ${ev.source_subtype || 'Document'}`
        } else if (ev.source_type === 'user_text') {
          displayMessage = `📝 Injected note: "${ev.raw_text}"`
        } else {
          displayMessage = `➕ Injected evidence (${ev.source_type}): ${ev.source_subtype || ''}`
        }

        list.push({
          id: ev.evidence_id,
          role: 'user',
          message: displayMessage,
          created_at: ev.created_at,
          type: 'evidence',
          metadata: { ev },
        })
      })
    }

    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return list
  }, [turns, evidence])

  const schemaState = (caseDetail?.current_schema_state ?? {}) as Record<string, unknown>
  const templateFields = caseDetail?.template.schema ?? []
  const fieldStates = caseDetail?.field_states ?? []
  const fieldStatesByPath = new Map(fieldStates.map((state) => [state.field_path, state]))
  const activeFieldPaths = new Set(
    templateFields.filter((field) => isFieldActive(field, schemaState)).map((field) => field.path),
  )
  const hiddenConditionalFieldCount = templateFields.length - activeFieldPaths.size
  const outstandingQuestionCount = templateFields.reduce((count, field) => {
    if (!activeFieldPaths.has(field.path)) {
      return count
    }
    const state = fieldStatesByPath.get(field.path)
    if (!state) {
      return count
    }
    return isQuestionOutstanding(field, state) ? count + 1 : count
  }, 0)
  const isConversationComplete = !nextQuestion && outstandingQuestionCount === 0
  const completionMessage =
    caseDetail?.status === 'approved'
      ? 'All active intake questions are complete. You can generate artifacts now.'
      : caseDetail?.status === 'ready_for_review'
        ? 'All active intake questions are complete. Confirm all field values in Field Review to enable approval.'
        : 'All active intake questions are complete.'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'extracting':
      case 'resolving':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'awaiting_user':
        return 'bg-amber-100 text-amber-700 border-amber-200'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  const allFieldsConfirmed = Array.from(activeFieldPaths).every((path) => {
    const state = fieldStatesByPath.get(path)
    return state?.status === 'confirmed'
  })

  const isApproveReady = caseDetail?.status === 'ready_for_review' && allFieldsConfirmed && !(validation?.some((v) => v.blocking))

  if (isLoadingCase) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="h-dvh min-h-screen flex flex-col bg-slate-50/20 overflow-hidden font-sans">
      <header className="h-14 border-b border-slate-200/50 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-4">
          <div className="p-1.5 bg-blue-600 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => navigate('/')}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-900">{caseDetail?.template.name}</span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none">#{caseId?.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Toggle View Mode */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shadow-sm mr-2 select-none">
            <button
              onClick={() => setIsSimplifiedView(true)}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all duration-200",
                isSimplifiedView
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setIsSimplifiedView(false)}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all duration-200",
                !isSimplifiedView
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Layout className="w-3 h-3" />
              <span>Detailed</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex h-8 w-8 p-0 rounded-lg border-slate-200 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
            onClick={() => navigate('/')}
          >
            <Plus className="w-4 h-4" />
          </Button>

          <div className="hidden sm:block h-4 w-px bg-slate-200 mx-1" />

          <Badge className={cn('px-2.5 py-0.5 font-bold text-[9px] uppercase tracking-wider border rounded-full', getStatusColor(caseDetail?.status || ''))}>
            {caseDetail?.status.replace('_', ' ')}
          </Badge>

          {caseDetail?.metadata?.preferred_language && caseDetail?.metadata?.preferred_language !== 'en' && (
            <Badge className="px-2.5 py-0.5 font-bold text-[9px] uppercase tracking-wider border rounded-full bg-blue-50 text-blue-700 border-blue-200">
              Language: {caseDetail.metadata.preferred_language}
            </Badge>
          )}

          <div className="h-4 w-px bg-slate-200 mx-1" />

          {caseDetail?.status === 'ready_for_review' && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white font-bold h-8 rounded-lg shadow-sm px-4 text-xs transition-all ring-offset-2 focus:ring-2 focus:ring-green-500/20"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || validation?.some((v) => v.blocking) || !allFieldsConfirmed}
            >
              Approve & Close
            </Button>
          )}

          {caseDetail?.status === 'approved' && caseDetail.template.supported_artifacts.length > 0 && (
            <DropdownMenuComponent
              options={caseDetail.template.supported_artifacts}
              onSelect={(type) => generateMutation.mutate(type)}
              isLoading={generateMutation.isPending}
            />
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {isSimplifiedView ? (
          <SimplifiedChatView
            caseDetail={caseDetail}
            mergedMessages={mergedMessages}
            nextQuestion={nextQuestion}
            langConfig={langConfig}
            playingQuestion={playingQuestion}
            loadingAudio={loadingAudio}
            handlePlayTTS={handlePlayTTS}
            isThinkingExpanded={isThinkingExpanded}
            setIsThinkingExpanded={setIsThinkingExpanded}
            isConversationComplete={isConversationComplete}
            completionMessage={completionMessage}
            activeFieldPaths={activeFieldPaths}
            fieldStatesByPath={fieldStatesByPath}
            validation={validation}
            evidence={evidence}
            confirmFieldMutation={confirmFieldMutation}
            rejectFieldMutation={rejectFieldMutation}
            bulkConfirmMutation={bulkConfirmMutation}
            isApproveReady={isApproveReady}
            approveCaseMutation={approveMutation}
            artifacts={artifacts}
            generateArtifactMutation={generateMutation}
            chatInput={chatInput}
            setChatInput={setChatInput}
            submitTurnMutation={submitTurnMutation}
            uploadFileMutation={uploadFileMutation}
            uploadError={uploadError}
            setUploadError={setUploadError}
            caseId={caseId}
          />
        ) : (
            <DetailedWorkspaceView
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              activeFieldPaths={activeFieldPaths}
              fieldStatesByPath={fieldStatesByPath}
              caseDetail={caseDetail}
              validation={validation}
              evidence={evidence}
              confirmFieldMutation={confirmFieldMutation}
              rejectFieldMutation={rejectFieldMutation}
              bulkConfirmMutation={bulkConfirmMutation}
              isEvidenceModalOpen={isEvidenceModalOpen}
              setIsEvidenceModalOpen={setIsEvidenceModalOpen}
              uploadFileMutation={uploadFileMutation}
              uploadError={uploadError}
              setUploadError={setUploadError}
              addTextMutation={addTextMutation}
              nextQuestion={nextQuestion}
              langConfig={langConfig}
              playingQuestion={playingQuestion}
              loadingAudio={loadingAudio}
              handlePlayTTS={handlePlayTTS}
              isConversationComplete={isConversationComplete}
              completionMessage={completionMessage}
              hiddenConditionalFieldCount={hiddenConditionalFieldCount}
              chatInput={chatInput}
              setChatInput={setChatInput}
              submitTurnMutation={submitTurnMutation}
              artifacts={artifacts}
              caseId={caseId}
            />
        )}
      </main>
    </div>
  )
}
