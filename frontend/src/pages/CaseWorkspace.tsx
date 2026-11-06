import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MessageSquare,
  Layout
} from 'lucide-react'
import { useTranslation } from 'react-i18next'


import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { groupDocumentUploadTurns } from '@/lib/conversation'
import {
  CaseDetail,
  ConversationTurn,
  FieldState,
  TemplateField,
  addTextEvidence,
  approveCase,
  bulkRejectFields,
  confirmField,
  editField,
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
  DocumentUpload,
  getConversationTurns,
  updateCaseLanguage
} from '@/lib/api'

import { DropdownMenuComponent } from '@/components/case/DropdownMenuComponent'
import { SimplifiedChatView } from '@/components/case/SimplifiedChatView'
import type { DocumentUploadProgress } from '@/components/case/DocumentSupport'
import { DetailedWorkspaceView } from '@/components/case/DetailedWorkspaceView'
import { CaseTitleEditor } from '@/components/case/CaseTitleEditor'
import { LanguageSelector } from '@/components/case/LanguageSelector'
import AppShell from '@/components/layout/AppShell'

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

function evaluateCondition(rule: any, schemaState: Record<string, unknown>): boolean {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return Boolean(rule)
  }

  if ('operator' in rule) {
    const op = String(rule.operator).toLowerCase()
    const subRules = Array.isArray(rule.rules) ? rule.rules : []
    if (op === 'and') {
      return subRules.every((r: any) => evaluateCondition(r, schemaState))
    }
    if (op === 'or') {
      return subRules.some((r: any) => evaluateCondition(r, schemaState))
    }
    if (op === 'not') {
      if (subRules.length > 0) {
        return !evaluateCondition(subRules[0], schemaState)
      }
      const ruleData = rule.rule
      if (ruleData) {
        return !evaluateCondition(ruleData, schemaState)
      }
      return true
    }
  }

  const dependsOn = rule.depends_on
  if (!dependsOn) {
    return true
  }

  const actualValue = getValueByPath(schemaState, dependsOn)

  if ('equals' in rule) {
    return actualValue === rule.equals
  }
  if ('not_equals' in rule) {
    return actualValue !== rule.not_equals
  }

  if ('op' in rule || 'operator' in rule) {
    const opVal = String(rule.op || rule.operator || '').toLowerCase()
    const val = rule.value

    if (opVal === 'equals' || opVal === 'eq') {
      return actualValue === val
    }
    if (opVal === 'not_equals' || opVal === 'neq') {
      return actualValue !== val
    }
    if (opVal === 'in' || opVal === 'contains') {
      return Array.isArray(val) && val.includes(actualValue)
    }
    if (opVal === 'not_in' || opVal === 'not_contains') {
      return Array.isArray(val) && !val.includes(actualValue)
    }

    if (actualValue !== null && actualValue !== undefined) {
      const actNum = Number(actualValue)
      const valNum = Number(val)
      if (!isNaN(actNum) && !isNaN(valNum)) {
        if (opVal === 'gt' || opVal === 'greater_than') {
          return actNum > valNum
        }
        if (opVal === 'gte' || opVal === 'greater_than_or_equals') {
          return actNum >= valNum
        }
        if (opVal === 'lt' || opVal === 'less_than') {
          return actNum < valNum
        }
        if (opVal === 'lte' || opVal === 'less_than_or_equals') {
          return actNum <= valNum
        }
      }
    }
  }

  return Boolean(actualValue)
}

function isFieldActive(field: TemplateField, schemaState: Record<string, unknown>): boolean {
  const conditions = field.conditions
  if (!conditions || Object.keys(conditions).length === 0) {
    return true
  }
  return evaluateCondition(conditions, schemaState)
}

function isQuestionOutstanding(field: TemplateField, state: FieldState): boolean {
  if (field.type === 'document') return field.required && !state.resolved_value?._file?.evidence_id
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
  const { t, i18n } = useTranslation()

  const [isSimplifiedView, setIsSimplifiedView] = useState(true)
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('review')
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [pendingTurn, setPendingTurn] = useState<{ turn: ConversationTurn; existingIds: Set<string> } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, DocumentUploadProgress>>({})
  React.useEffect(() => {
    setUploadProgress({})
    setUploadError(null)
  }, [caseId])

  const [localRejectedFields, setLocalRejectedFields] = useState<Set<string>>(new Set())

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

  React.useEffect(() => {
    setUploadProgress((previous) => {
      let updated = previous
      for (const [type, item] of Object.entries(previous)) {
        if (item.status !== 'queued' || !item.evidenceId) continue
        const analysis = evidence?.find((record) => record.evidence_id === item.evidenceId)?.document_analysis
        if (!analysis) continue
        updated = { ...updated, [type]: { ...item, status: analysis.status === 'error' ? 'failed' : ['matched', 'detected'].includes(analysis.status) ? 'completed' : 'needs_review' } }
      }
      return updated
    })
  }, [evidence])

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

  React.useEffect(() => {
    if (caseDetail?.metadata?.preferred_language) {
      const preferred = caseDetail.metadata.preferred_language
      if ((preferred === 'hi' || preferred === 'en') && i18n.language !== preferred) {
        i18n.changeLanguage(preferred)
      }
    }
  }, [caseDetail?.metadata?.preferred_language, i18n])

  const [playingQuestion, setPlayingQuestion] = useState<string | null>(null)
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null)
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number>(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false)

  // Persistent TTS cache map ref
  const ttsCacheRef = React.useRef<Map<string, { blob: Blob; url: string }>>(new Map())

  // Revoke all cached object URLs on unmount
  React.useEffect(() => {
    return () => {
      ttsCacheRef.current.forEach((cached) => {
        URL.revokeObjectURL(cached.url)
      })
      ttsCacheRef.current.clear()
    }
  }, [])

  React.useEffect(() => {
    return () => {
      if (audioInstance) {
        audioInstance.pause()
      }
    }
  }, [audioInstance])

  const handlePlayTTS = async (text: string, lang: string) => {
    if (playingQuestion === text && audioInstance) {
      if (isAudioPlaying) {
        audioInstance.pause()
      } else {
        if (audioInstance.currentTime >= audioInstance.duration) {
          audioInstance.currentTime = 0
          setAudioCurrentTime(0)
        }
        audioInstance.play().catch((err) => console.error(err))
      }
      return
    }

    if (audioInstance) {
      audioInstance.pause()
      setAudioInstance(null)
      setIsAudioPlaying(false)
      setAudioDuration(0)
      setAudioCurrentTime(0)
    }

    const cacheKey = `${lang}:${text}`
    let audioUrl = ttsCacheRef.current.get(cacheKey)?.url || ''

    try {
      if (!audioUrl) {
        setLoadingAudio(text)
        const audioBlob = await textToSpeech(text, lang)
        audioUrl = URL.createObjectURL(audioBlob)
        ttsCacheRef.current.set(cacheKey, { blob: audioBlob, url: audioUrl })
      }

      const audio = new Audio(audioUrl)

      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration)
      }
      audio.ontimeupdate = () => {
        setAudioCurrentTime(audio.currentTime)
      }
      audio.onplay = () => {
        setIsAudioPlaying(true)
      }
      audio.onpause = () => {
        setIsAudioPlaying(false)
      }
      audio.onended = () => {
        setIsAudioPlaying(false)
        setAudioCurrentTime(audio.duration)
      }
      audio.onerror = () => {
        setPlayingQuestion(null)
        setAudioInstance(null)
        setIsAudioPlaying(false)
        setAudioDuration(0)
        setAudioCurrentTime(0)
        ttsCacheRef.current.delete(cacheKey)
      }

      setAudioInstance(audio)
      setLoadingAudio(null)
      setPlayingQuestion(text)

      await audio.play()
    } catch (err) {
      console.error('Failed to play TTS audio:', err)
      setLoadingAudio(null)
      setPlayingQuestion(null)
      setAudioInstance(null)
      setIsAudioPlaying(false)
      setAudioDuration(0)
      setAudioCurrentTime(0)
    }
  }

  const handleTogglePlayPause = () => {
    if (!audioInstance) return
    if (isAudioPlaying) {
      audioInstance.pause()
    } else {
      if (audioInstance.currentTime >= audioInstance.duration) {
        audioInstance.currentTime = 0
        setAudioCurrentTime(0)
      }
      audioInstance.play().catch((err) => console.error(err))
    }
  }

  const handleSeekAudio = (value: number) => {
    if (!audioInstance) return
    audioInstance.currentTime = value
    setAudioCurrentTime(value)
  }

  const handleStopAudio = () => {
    if (audioInstance) {
      audioInstance.pause()
    }
    setPlayingQuestion(null)
    setAudioInstance(null)
    setIsAudioPlaying(false)
    setAudioDuration(0)
    setAudioCurrentTime(0)
  }

  const updateLanguageMutation = useMutation({
    mutationFn: (lang: string) => updateCaseLanguage(caseId!, lang),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
    }
  })

  const submitTurnMutation = useMutation({
    onMutate: (message: string) => {
      setPendingTurn({
        turn: {
          turn_id: crypto.randomUUID(),
          case_id: caseId!,
          role: 'user',
          message,
          created_at: new Date().toISOString(),
          related_field_path: nextQuestion?.field_path ?? null,
          metadata: {},
        },
        existingIds: new Set(
          (queryClient.getQueryData<ConversationTurn[]>(['turns', caseId]) ?? [])
            .map((turn) => turn.turn_id),
        ),
      })
      setChatInput('')
      handleStopAudio()
    },
    mutationFn: async (msg: string) => {
      try {
        let activeLang = i18n.language
        if (activeLang === 'en') {
          const detection = await detectLanguage(msg)
          if (detection.language === 'hi') {
            activeLang = 'hi'
            i18n.changeLanguage('hi')
          }
        }
        return submitTurn(caseId!, msg, activeLang)
      } catch (err) {
        console.error('Failed to detect language, falling back to active locale:', err)
        return submitTurn(caseId!, msg, i18n.language)
      }
    },
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ['turns', caseId] })
      queryClient.setQueryData<ConversationTurn[]>(['turns', caseId], (previous = []) => {
        const received = [response.user_turn, response.assistant_turn]
          .filter((turn): turn is ConversationTurn => turn !== null)
        const receivedIds = new Set(received.map((turn) => turn.turn_id))
        return [...previous.filter((turn) => !receivedIds.has(turn.turn_id)), ...received]
      })
      setPendingTurn(null)
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      await queryClient.cancelQueries({ queryKey: ['next-question', caseId] })
      queryClient.setQueryData(['next-question', caseId], response.next_question)
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
    },
    onError: (_error, message) => {
      setPendingTurn(null)
      setChatInput((draft) => draft || message)
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
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
    onMutate: ({ file, documentType }: DocumentUpload) => {
      setUploadError(null)
      setUploadProgress((previous) => ({ ...previous, [documentType || 'auto']: { filename: file.name, status: 'uploading', percent: 0 } }))
    },
    mutationFn: ({ file, documentType }: DocumentUpload) => uploadFileEvidence(caseId!, file, documentType, (event) => {
      const percent = event.total ? Math.min(100, Math.round(100 * event.loaded / event.total)) : undefined
      setUploadProgress((previous) => ({ ...previous, [documentType || 'auto']: {
        filename: file.name,
        status: event.total && event.loaded >= event.total ? 'processing' : 'uploading',
        percent,
      } }))
    }),
    onSuccess: (response, { file, documentType }) => {
      const analysisStatus = response.evidence?.document_analysis?.status
      setUploadProgress((previous) => ({ ...previous, [documentType || 'auto']: {
        filename: file.name,
        evidenceId: response.evidence?.evidence_id,
        status: response.job?.status === 'queued' ? 'queued' : analysisStatus === 'mismatch' || analysisStatus === 'needs_review' || analysisStatus === 'error' ? 'needs_review' : 'completed',
      } }))
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
    onError: (error: any, { file, documentType }) => {
      const detail = String(error?.response?.data?.detail || t('upload_error_generic'))
      setUploadError(detail)
      setUploadProgress((previous) => ({ ...previous, [documentType || 'auto']: { filename: file.name, status: 'failed', error: detail } }))
    },
    onSettled: () => {
      // Failed extraction can still leave a stored upload and grounded field mappings.
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
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
    onSuccess: (_, fieldPath) => {
      setLocalRejectedFields((prev) => {
        const next = new Set(prev)
        next.delete(fieldPath)
        return next
      })
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

  const editFieldMutation = useMutation({
    mutationFn: ({ fieldPath, value }: { fieldPath: string; value: any }) =>
      editField(caseId!, fieldPath, value),
    onSuccess: (_, variables) => {
      setLocalRejectedFields((prev) => {
        const next = new Set(prev)
        next.delete(variables.fieldPath)
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
    },
  })

  const handleEditField = async (fieldPath: string, value: any) => {
    await editFieldMutation.mutateAsync({ fieldPath, value })
  }

  const bulkConfirmMutation = useMutation({
    mutationFn: async (fieldPaths: string[]) => {
      await Promise.all(fieldPaths.map((path) => confirmField(caseId!, path)))
    },
    onSuccess: (_, fieldPaths) => {
      setLocalRejectedFields((prev) => {
        const next = new Set(prev)
        fieldPaths.forEach(path => next.delete(path))
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
    },
  })

  const bulkRejectMutation = useMutation({
    mutationFn: (fieldPaths: string[]) => bulkRejectFields(caseId!, fieldPaths),
    onSuccess: () => {
      setLocalRejectedFields(new Set())
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['turns', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
    },
  })

  const handleLocalReject = (fieldPath: string) => {
    setLocalRejectedFields((prev) => {
      const next = new Set(prev)
      next.add(fieldPath)
      return next
    })
  }

  const handleUndoLocalReject = (fieldPath: string) => {
    setLocalRejectedFields((prev) => {
      const next = new Set(prev)
      next.delete(fieldPath)
      return next
    })
  }

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
      groupDocumentUploadTurns(turns).forEach((t) => {
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

    if (pendingTurn && !turns?.some((turn) =>
      turn.role === 'user' &&
      turn.message === pendingTurn.turn.message &&
      !pendingTurn.existingIds.has(turn.turn_id)
    )) {
      list.push({
        id: pendingTurn.turn.turn_id,
        role: 'user',
        message: pendingTurn.turn.message,
        created_at: pendingTurn.turn.created_at,
        type: 'turn',
      })
    }

    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    return list
  }, [turns, pendingTurn])

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
  const proposedFields = Array.from(activeFieldPaths).filter((path) => {
    const state = fieldStatesByPath.get(path)
    return state?.status === 'proposed'
  })
  const unreviewedProposedCount = proposedFields.filter(path => !localRejectedFields.has(path)).length
  const completionMessage =
    caseDetail?.status === 'approved'
      ? t('completion_approved')
      : caseDetail?.status === 'ready_for_review'
        ? t('completion_ready')
        : t('completion_complete')

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'bg-leaf'
      case 'failed':
        return 'bg-terracotta'
      case 'extracting':
      case 'resolving':
      case 'artifact_generating':
        return 'bg-inkblue'
      case 'ready_for_review':
        return 'bg-marigold-bright'
      case 'awaiting_user':
        return 'bg-marigold-bright'
      default:
        return 'bg-ink-faint'
    }
  }

  const allFieldsConfirmed = Array.from(activeFieldPaths).every((path) => {
    const state = fieldStatesByPath.get(path)
    const field = templateFields.find((item) => item.path === path)
    if (field?.type === 'document' && !field.required && state?.status === 'missing') return true
    return state?.status === 'confirmed'
  })

  const isApproveReady = nextQuestion?.kind !== 'document_upload' && caseDetail?.status === 'ready_for_review' && allFieldsConfirmed && !(validation?.some((v) => v.blocking))

  const isInitializing = isLoadingCase || (nextQuestionQuery.isLoading && (!turns || turns.length === 0))

  if (isInitializing) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-paper font-sans">
        <div className="flex flex-col items-center max-w-sm text-center px-8 py-10 rounded-lg card-ledger animate-in fade-in zoom-in-95 duration-300">
          <div className="w-12 h-12 rounded-md bg-pine flex items-center justify-center mb-5">
            <Loader2 className="w-6 h-6 animate-spin text-primary-foreground" />
          </div>
          <h3 className="font-mono text-[11px] font-medium text-ink mb-2 uppercase tracking-[0.22em]">
            {isLoadingCase ? t('loading_case') : t('preparing_assistant')}
          </h3>
          <p className="text-xs text-ink-soft leading-relaxed">
            {isLoadingCase
              ? t('loading_case_desc')
              : t('preparing_assistant_desc')
            }
          </p>
        </div>
      </div>
    )
  }

  return (
    <AppShell
      fill
      onArchitect={() => navigate('/', { state: { architect: 'design' } })}
      onNewSchema={() => navigate('/', { state: { architect: 'new' } })}
      headerBefore={(
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <div className="flex items-center gap-2 min-w-0">
            {caseDetail && <CaseTitleEditor caseFile={caseDetail} />}
            <span className="font-mono text-[10px] text-ink-faint bg-paper border border-line px-1.5 py-0.5 rounded leading-none shrink-0">#{caseId?.slice(0, 8)}</span>
          </div>
          <span className="block text-[10px] text-ink-faint truncate mt-0.5">{caseDetail?.template.name}</span>
        </div>
      )}
      headerEnd={(
        <>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] border border-line rounded bg-white text-ink-soft">
              <span className={cn('w-1.5 h-1.5 rounded-full', getStatusDot(caseDetail?.status || ''))} />
              {t('case_status_' + caseDetail?.status)}
            </span>

            <div className="flex items-center bg-paper border border-line p-0.5 rounded-md select-none" role="group" aria-label={t('view_mode')}>
              <button
                onClick={() => setIsSimplifiedView(true)}
                aria-pressed={isSimplifiedView}
                aria-label={t('chat_view')}
                title={t('chat_view')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-[5px] text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/50 min-h-[38px]",
                  isSimplifiedView
                    ? "bg-pine text-paper shadow-sm"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <MessageSquare className="w-3 h-3" />
                <span>{t('chat_view')}</span>
              </button>
              <button
                onClick={() => setIsSimplifiedView(false)}
                aria-pressed={!isSimplifiedView}
                aria-label={t('detailed_view')}
                title={t('detailed_view')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-[5px] text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/50 min-h-[38px]",
                  !isSimplifiedView
                    ? "bg-pine text-paper shadow-sm"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <Layout className="w-3 h-3" />
                <span>{t('detailed_view')}</span>
              </button>
            </div>

            {caseDetail?.status === 'ready_for_review' && (
              <Button
                size="sm"
                className="bg-leaf hover:bg-leaf/85 text-paper font-semibold h-9 rounded-md px-4 text-[10px] sm:text-[11px] uppercase tracking-[0.1em] transition-all cursor-pointer border border-leaf/40"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || validation?.some((v) => v.blocking) || !allFieldsConfirmed}
              >
                {t('approve_and_close')}
              </Button>
            )}

            {caseDetail?.status === 'approved' && caseDetail.template.supported_artifacts.length > 0 && (
              <DropdownMenuComponent
                options={caseDetail.template.supported_artifacts}
                onSelect={(type) => generateMutation.mutate(type)}
                isLoading={generateMutation.isPending}
              />
            )}
            <LanguageSelector onLanguageChange={(code) => updateLanguageMutation.mutate(code)} />
        </>
      )}
    >
      <div className="h-full min-h-0 flex flex-col bg-paper font-sans">
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
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
            onEditField={handleEditField}
            chatInput={chatInput}
            setChatInput={setChatInput}
            submitTurnMutation={submitTurnMutation}
            uploadFileMutation={{ ...uploadFileMutation, progress: uploadProgress }}
            uploadError={uploadError}
            setUploadError={setUploadError}
            caseId={caseId}
            localRejectedFields={localRejectedFields}
            onLocalReject={handleLocalReject}
            onUndoLocalReject={handleUndoLocalReject}
            bulkRejectMutation={bulkRejectMutation}
            unreviewedProposedCount={unreviewedProposedCount}
            audioInstance={audioInstance}
            audioDuration={audioDuration}
            audioCurrentTime={audioCurrentTime}
            isAudioPlaying={isAudioPlaying}
            handleTogglePlayPause={handleTogglePlayPause}
            handleSeekAudio={handleSeekAudio}
            handleStopAudio={handleStopAudio}
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
            onEditField={handleEditField}
            isEvidenceModalOpen={isEvidenceModalOpen}
            setIsEvidenceModalOpen={setIsEvidenceModalOpen}
            uploadFileMutation={{ ...uploadFileMutation, progress: uploadProgress }}
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
            localRejectedFields={localRejectedFields}
            onLocalReject={handleLocalReject}
            onUndoLocalReject={handleUndoLocalReject}
            bulkRejectMutation={bulkRejectMutation}
            unreviewedProposedCount={unreviewedProposedCount}
            audioInstance={audioInstance}
            audioDuration={audioDuration}
            audioCurrentTime={audioCurrentTime}
            isAudioPlaying={isAudioPlaying}
            handleTogglePlayPause={handleTogglePlayPause}
            handleSeekAudio={handleSeekAudio}
            handleStopAudio={handleStopAudio}
          />
        )}
        </div>
      </div>
    </AppShell>
  )
}
