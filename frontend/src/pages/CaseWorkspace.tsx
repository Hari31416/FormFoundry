import { useAuth } from '@/lib/auth'
import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Plus,
  ArrowLeft,
  MessageSquare,
  Layout,
  LogOut
} from 'lucide-react'
import { useTranslation } from 'react-i18next'


import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
import { DetailedWorkspaceView } from '@/components/case/DetailedWorkspaceView'
import { CaseTitleEditor } from '@/components/case/CaseTitleEditor'
import { LanguageSelector } from '@/components/case/LanguageSelector'

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
  const { logout } = useAuth()
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
    mutationFn: ({ file, documentType }: DocumentUpload) => uploadFileEvidence(caseId!, file, documentType),
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
        error?.response?.data?.detail || t('upload_error_generic')
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
        return 'bg-primary-foreground/50'
    }
  }

  const allFieldsConfirmed = Array.from(activeFieldPaths).every((path) => {
    const state = fieldStatesByPath.get(path)
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
    <div className="h-dvh min-h-screen flex flex-col bg-paper overflow-hidden font-sans">
      <header className="min-h-14 h-auto shrink-0 bg-pine-deep text-primary-foreground px-4 sm:px-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1.5 border-b border-pine-deep z-10">
        <div className="flex items-center gap-3 min-w-0 max-w-full">
          <button
            className="w-9 h-9 rounded-md bg-primary-foreground/10 border border-primary-foreground/15 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors cursor-pointer shrink-0"
            onClick={() => navigate('/')}
            aria-label={t('back_to_hub')}
            title={t('back_to_hub')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                {caseDetail && <CaseTitleEditor caseFile={caseDetail} />}
                <span className="block text-[10px] text-primary-foreground/60 truncate">{caseDetail?.template.name}</span>
              </div>
              <span className="font-mono text-[11px] text-primary-foreground/60 bg-primary-foreground/10 px-1.5 py-0.5 rounded leading-none shrink-0">#{caseId?.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 max-w-full">
          <button onClick={logout} title={t('auth_sign_out')} aria-label={t('auth_sign_out')} className="flex items-center gap-1.5 h-10 px-2.5 rounded-md border border-primary-foreground/15 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <LogOut className="w-4 h-4" />
            <span className="hidden xl:inline text-[11px] font-semibold">{t('auth_sign_out')}</span>
          </button>
          <LanguageSelector onLanguageChange={(code) => updateLanguageMutation.mutate(code)} className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:border-primary-foreground/30 shadow-none [&_svg]:text-primary-foreground/70" />

          <div className="hidden sm:block h-5 w-px bg-primary-foreground/15 mx-1" />

          {/* Toggle View Mode */}
          <div className="flex items-center bg-pine/60 p-0.5 rounded-md border border-primary-foreground/10 select-none" role="group" aria-label={t('view_mode')}>
            <button
              onClick={() => setIsSimplifiedView(true)}
              aria-pressed={isSimplifiedView}
              aria-label={t('chat_view')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-[5px] text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 min-h-[40px]",
                isSimplifiedView
                  ? "bg-primary-foreground text-pine-deep shadow-sm"
                  : "text-primary-foreground/60 hover:text-primary-foreground"
              )}
            >
              <MessageSquare className="w-3 h-3" />
              <span>{t('chat_view')}</span>
            </button>
            <button
              onClick={() => setIsSimplifiedView(false)}
              aria-pressed={!isSimplifiedView}
              aria-label={t('detailed_view')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-[5px] text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 min-h-[40px]",
                !isSimplifiedView
                  ? "bg-primary-foreground text-pine-deep shadow-sm"
                  : "text-primary-foreground/60 hover:text-primary-foreground"
              )}
            >
              <Layout className="w-3 h-3" />
              <span>{t('detailed_view')}</span>
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label={t('new_case')}
            className="flex h-10 px-2.5 sm:w-9 sm:p-0 rounded-md border border-primary-foreground/15 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={() => navigate('/')}
          >
            <Plus className="w-4 h-4" />
            <span className="sm:hidden ml-1 text-[11px] font-semibold">{t('new_word')}</span>
          </Button>

          <div className="hidden sm:block h-5 w-px bg-primary-foreground/15 mx-1" />

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] border rounded border-primary-foreground/30 text-primary-foreground/90">
            <span className={cn('w-1.5 h-1.5 rounded-full', getStatusDot(caseDetail?.status || ''))} />
            {t('case_status_' + caseDetail?.status)}
          </span>

          {caseDetail?.metadata?.preferred_language && caseDetail?.metadata?.preferred_language !== 'en' && (
            <span className="hidden lg:inline-block px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] border rounded border-primary-foreground/30 text-primary-foreground/90">
              {t('language')}: {caseDetail.metadata.preferred_language === 'hi' ? 'हिन्दी' : 'English'}
            </span>
          )}

          {caseDetail?.status === 'ready_for_review' && (
            <>
              <div className="hidden sm:block h-5 w-px bg-primary-foreground/15 mx-1" />
              <Button
                size="sm"
                className="bg-leaf hover:bg-leaf/85 text-primary-foreground font-semibold h-9 rounded-md px-4 text-[11px] uppercase tracking-[0.1em] transition-all cursor-pointer border border-leaf/40"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || validation?.some((v) => v.blocking) || !allFieldsConfirmed}
              >
                {t('approve_and_close')}
              </Button>
            </>
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

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
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
            uploadFileMutation={uploadFileMutation}
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
      </main>
    </div>
  )
}
