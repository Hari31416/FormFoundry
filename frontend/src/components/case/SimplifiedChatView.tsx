import React from 'react'
import { DocumentTypeSelect, DocumentAnalysisSummary, DocumentUploadQuestion, type DocumentUploadMutation } from './DocumentSupport'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  Zap,
  User,
  Loader2,
  VolumeX,
  Volume2,
  Check,
  CheckCircle2,
  FileText,
  Download,
  Paperclip,
  Send,
  Play,
  Pause,
  X,
  RotateCcw,
  RotateCw
} from 'lucide-react'

const formatAudioTime = (secs: number) => {
  if (isNaN(secs)) return '0:00'
  const minutes = Math.floor(secs / 60)
  const seconds = Math.floor(secs % 60)
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { getQuestionEvidence } from '@/lib/conversation'
import {
  CaseDetail,
  FieldState,
  Evidence,
  downloadArtifact
} from '@/lib/api'
import { FieldRow } from './FieldRow'
import { useTranslation } from 'react-i18next'
import { getActiveLocale } from '@/lib/dateLocale'

interface SimplifiedChatViewProps {
  caseDetail: CaseDetail | undefined
  mergedMessages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    message: string
    created_at: string
    type: 'turn' | 'evidence' | 'system'
    metadata?: any
  }>
  nextQuestion: any
  langConfig: any
  playingQuestion: string | null
  loadingAudio: string | null
  handlePlayTTS: (text: string, lang: string) => void
  isThinkingExpanded: boolean
  setIsThinkingExpanded: (expanded: boolean) => void
  isConversationComplete: boolean
  completionMessage: string
  activeFieldPaths: Set<string>
  fieldStatesByPath: Map<string, FieldState>
  validation: any[] | undefined
  evidence: Evidence[] | undefined
  confirmFieldMutation: any
  rejectFieldMutation: any
  bulkConfirmMutation: any
  onEditField: (path: string, value: any) => Promise<void>
  isApproveReady: boolean
  approveCaseMutation: any
  artifacts: any[] | undefined
  generateArtifactMutation: any
  chatInput: string
  setChatInput: (input: string) => void
  submitTurnMutation: any
  uploadFileMutation: DocumentUploadMutation
  uploadError: string | null
  setUploadError: (err: string | null) => void
  caseId: string | undefined
  localRejectedFields: Set<string>
  onLocalReject: (path: string) => void
  onUndoLocalReject: (path: string) => void
  bulkRejectMutation: any
  unreviewedProposedCount: number
  audioInstance: HTMLAudioElement | null
  audioDuration: number
  audioCurrentTime: number
  isAudioPlaying: boolean
  handleTogglePlayPause: () => void
  handleSeekAudio: (value: number) => void
  handleStopAudio: () => void
}

export function SimplifiedChatView({
  caseDetail,
  mergedMessages,
  nextQuestion,
  langConfig,
  playingQuestion,
  loadingAudio,
  handlePlayTTS,
  isThinkingExpanded,
  setIsThinkingExpanded,
  isConversationComplete,
  completionMessage,
  activeFieldPaths,
  fieldStatesByPath,
  validation,
  evidence,
  confirmFieldMutation,
  rejectFieldMutation,
  bulkConfirmMutation,
  onEditField,
  isApproveReady,
  approveCaseMutation,
  artifacts,
  generateArtifactMutation,
  chatInput,
  setChatInput,
  submitTurnMutation,
  uploadFileMutation,
  uploadError,
  setUploadError,
  caseId,
  localRejectedFields,
  onLocalReject,
  onUndoLocalReject,
  bulkRejectMutation,
  unreviewedProposedCount,
  audioInstance,
  audioDuration,
  audioCurrentTime,
  isAudioPlaying,
  handleTogglePlayPause,
  handleSeekAudio,
  handleStopAudio
}: SimplifiedChatViewProps) {
  const { t } = useTranslation()
  const [documentType, setDocumentType] = React.useState('')
  const validationRules = caseDetail?.template.validation_rules ?? []
  // Find the index of the latest assistant message to attach active question decorations
  const lastAssistantIdx = React.useMemo(() => {
    for (let i = mergedMessages.length - 1; i >= 0; i--) {
      if (mergedMessages[i].role === 'assistant') {
        return i
      }
    }
    return -1
  }, [mergedMessages])

  const composerRef = React.useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const input = composerRef.current
    if (input) {
      input.style.height = 'auto'
      input.style.height = `${Math.min(input.scrollHeight, 128)}px`
    }
  }, [chatInput])
  const latestMessageId = mergedMessages.at(-1)?.id
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [latestMessageId])

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-paper">
      <ScrollArea className="flex-1 min-h-0 px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-2">
          {/* Welcome Intro Card */}
          <div className="flex items-start space-x-3 w-full">
            <div className="p-2 bg-pine-soft rounded-md text-pine border border-line">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-card-warm rounded-lg p-4 border border-line border-l-2 border-l-pine max-w-[85%]">
              <p className="text-[11px] font-mono font-semibold text-pine uppercase tracking-[0.22em] mb-1">{t('assistant_name')}</p>
              <p
                className="text-sm text-ink-soft leading-relaxed"
                dangerouslySetInnerHTML={{ __html: t('assistant_welcome', { name: caseDetail ? t('template_' + caseDetail.template.template_id + '_name', { defaultValue: caseDetail.template.name }) : '' }) }}
              />
            </div>
          </div>

          {/* Merged Conversation History */}
          {mergedMessages.map((msg, idx) => {
            const isAssistant = msg.role === 'assistant'
            const messageFieldPaths = Array.isArray(msg.metadata?.field_paths) ? msg.metadata.field_paths : []
            const nextQuestionFieldPaths = Array.isArray(nextQuestion?.field_paths) ? nextQuestion.field_paths : []
            const isSameQuestion = messageFieldPaths.join('|') === nextQuestionFieldPaths.join('|')
            const isLatestAssistant = isAssistant && idx === lastAssistantIdx && !!nextQuestion && isSameQuestion
            const fieldLabels = msg.metadata?.field_labels || nextQuestion?.field_labels || []
            const reason = msg.metadata?.reason || nextQuestion?.reason

            return (
              <div key={msg.id} className={cn("flex items-start space-x-3 w-full", !isAssistant && "justify-end")}>
                {isAssistant && (
                  <div className="p-2 bg-pine-soft rounded-md text-pine border border-line">
                    {isLatestAssistant ? (
                      <Sparkles className="w-4 h-4 text-marigold animate-none" />
                    ) : (
                      <Zap className="w-4 h-4 text-pine" />
                    )}
                  </div>
                )}
                <div className={cn(
                  "rounded-lg p-4 max-w-[80%] shadow-sm transition-all duration-200 relative overflow-hidden",
                  isAssistant
                    ? isLatestAssistant
                      ? "bg-card-warm text-ink border border-line border-l-2 border-l-marigold"
                      : "bg-card-warm text-ink-soft border border-line"
                    : "bg-pine text-primary-foreground rounded-tr-none ml-auto"
                )}>
                  {isAssistant && (
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={cn("text-[11px] font-mono font-semibold uppercase tracking-[0.2em]", isLatestAssistant ? "text-marigold" : "text-ink-faint")}>
                        {isLatestAssistant ? t('active_question') : t('assistant_name')}
                      </span>
                      {msg.metadata?.reason && !isLatestAssistant && (
                        <span className="text-[11px] font-mono font-medium text-ink-faint bg-paper border border-line px-1 py-0.5 rounded-sm leading-none uppercase tracking-[0.16em]">
                          {t('reasoned_match')}
                        </span>
                      )}
                    </div>
                  )}

                  {isAssistant ? (
                    <div className="space-y-3">
                      {isLatestAssistant && nextQuestion.kind !== 'document_upload' && fieldLabels.length > 0 && (
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          {fieldLabels.map((lbl: string) => (
                            <Badge key={lbl} variant="outline" className="text-[11px] font-mono font-medium border-marigold/40 text-marigold bg-marigold-soft uppercase tracking-[0.16em] h-4">
                              {lbl}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <p className={cn("text-[13px] leading-relaxed whitespace-pre-wrap text-left", isLatestAssistant ? "font-semibold text-ink" : "font-medium text-ink-soft")}>
                          {msg.message}
                        </p>
                        {langConfig?.is_tts_enabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-9 w-9 rounded-md text-ink-faint hover:text-pine hover:bg-pine-soft shrink-0",
                              playingQuestion === msg.message && "text-pine bg-pine-soft animate-none"
                            )}
                            onClick={() => handlePlayTTS(msg.message, caseDetail?.metadata?.preferred_language || 'en')}
                            disabled={!!loadingAudio && loadingAudio !== msg.message}
                          >
                            {loadingAudio === msg.message ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : playingQuestion === msg.message ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                      {msg.metadata?.question_payload?.kind === 'document_upload' && (
                        <DocumentUploadQuestion
                          documents={msg.metadata.question_payload.documents ?? []}
                          pendingDocuments={isLatestAssistant ? nextQuestion.pending_documents ?? nextQuestion.documents : []}
                          evidence={getQuestionEvidence(evidence, msg.metadata.upload_question_ids ?? [msg.id], msg.metadata.upload_evidence_ids)}
                          readOnly={!isLatestAssistant}
                          mutation={uploadFileMutation}
                          clearError={() => setUploadError(null)}
                          error={isLatestAssistant ? uploadError : null}
                          disabled={submitTurnMutation.isPending}
                        />
                      )}
                      {playingQuestion === msg.message && audioInstance && (
                        <div className="flex items-center space-x-3 p-3 bg-paper border border-line rounded-lg mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center space-x-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-md text-ink-soft hover:text-pine hover:bg-pine-soft flex items-center justify-center transition-all cursor-pointer"
                              onClick={() => handleSeekAudio(Math.max(0, audioCurrentTime - 10))}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-md bg-pine hover:bg-pine-deep text-primary-foreground shrink-0 shadow-sm transition-all cursor-pointer flex items-center justify-center"
                              onClick={handleTogglePlayPause}
                            >
                              {isAudioPlaying ? (
                                <Pause className="w-3.5 h-3.5 fill-primary-foreground text-primary-foreground" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-primary-foreground text-primary-foreground ml-0.5" />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-md text-ink-soft hover:text-pine hover:bg-pine-soft flex items-center justify-center transition-all cursor-pointer"
                              onClick={() => handleSeekAudio(Math.min(audioDuration, audioCurrentTime + 10))}
                            >
                              <RotateCw className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="flex-1 flex items-center space-x-3 min-w-0">
                            <input
                              type="range"
                              min="0"
                              max={audioDuration || 100}
                              step="0.1"
                              value={audioCurrentTime}
                              onChange={(e) => handleSeekAudio(parseFloat(e.target.value))}
                              className="flex-1 h-1 bg-line rounded-md appearance-none cursor-pointer accent-pine focus:outline-none"
                            />
                            <span className="text-[11px] font-mono text-ink-faint min-w-[65px] text-right tabular-nums shrink-0">
                              {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-md text-ink-faint hover:text-ink hover:bg-pine-soft shrink-0 cursor-pointer flex items-center justify-center"
                            onClick={handleStopAudio}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}

                      {/* Expandable Thinking */}
                      {isLatestAssistant && (
                        <div className="mt-3 border-t border-line pt-2.5">
                          <button
                            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                            className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-pine hover:text-pine-deep flex items-center space-x-1 cursor-pointer"
                          >
                            <span>{isThinkingExpanded ? t('hide_strategy') : t('show_strategy')}</span>
                            <span className="text-[11px]">{isThinkingExpanded ? '▲' : '▼'}</span>
                          </button>
                          <AnimatePresence>
                            {isThinkingExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mt-2"
                              >
                                <p className="text-[11px] text-ink-soft bg-paper rounded-md p-3 border border-line italic leading-relaxed">
                                  {reason}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] leading-relaxed font-medium whitespace-pre-wrap text-left text-primary-foreground">
                      {msg.message}
                    </p>
                  )}

                  {!isAssistant && (
                    <DocumentAnalysisSummary analysis={evidence?.find((item) => item.evidence_id === msg.metadata?.evidence_id)?.document_analysis} />
                  )}
                  <div className={cn("text-[11px] mt-2 font-mono font-medium uppercase tracking-[0.16em] leading-none text-right", isAssistant ? "text-ink-faint" : "text-primary-foreground/70")}>
                    {new Date(msg.created_at).toLocaleTimeString(getActiveLocale(), { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {!isAssistant && (
                  <div className="p-2 bg-pine-soft rounded-md text-pine border border-line">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            )
          })}

          {submitTurnMutation.isPending && (
            <div role="status" aria-live="polite" className="flex items-center gap-3 text-ink-soft">
              <div className="p-2 bg-pine-soft rounded-md border border-line">
                <Loader2 aria-hidden="true" className="w-4 h-4 text-pine animate-spin motion-reduce:animate-none" />
              </div>
              <span className="text-sm">{t('generating_response')}</span>
            </div>
          )}

          {/* Active Upload/OCR Error Alert Card */}
          {uploadError && nextQuestion?.kind !== 'document_upload' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-terracotta-soft border border-terracotta/30 rounded-lg p-5 flex items-start space-x-3 w-full"
            >
              <div className="p-2 bg-terracotta text-primary-foreground rounded-md shrink-0">
                <CheckCircle2 className="w-4 h-4 rotate-45 text-primary-foreground" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-mono font-semibold text-terracotta uppercase tracking-[0.2em]">{t('document_processing_failed')}</h4>
                  <button
                    onClick={() => setUploadError(null)}
                    className="text-[11px] font-mono font-semibold text-terracotta hover:text-terracotta uppercase tracking-[0.16em] leading-none bg-terracotta/10 hover:bg-terracotta/20 px-2 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    {t('clear_error')}
                  </button>
                </div>
                <p className="text-[11px] text-terracotta font-medium leading-relaxed mt-1.5 break-words">
                  {uploadError}
                </p>
              </div>
            </motion.div>
          )}

          {/* Inline Completed Banner, Verification List & Download Dashboard */}
          {isConversationComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 w-full"
            >
              {/* Intake Complete Banner */}
              <div className="bg-leaf-soft border border-leaf/30 rounded-lg p-6 flex items-start space-x-4">
                <div className="p-2.5 bg-leaf text-primary-foreground rounded-md">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-serif font-semibold text-leaf uppercase tracking-[0.08em]">{t('intake_questionnaire_complete')}</h3>
                  <p className="text-xs text-leaf leading-relaxed mt-1">
                    {completionMessage}
                  </p>
                </div>
              </div>

              {/* Inline Field Verification Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex flex-col">
                    <h4 className="text-[11px] font-mono font-semibold text-ink-faint uppercase tracking-[0.2em]">{t('inline_field_verification')}</h4>
                    <p className="text-[11px] text-ink-faint font-medium">{t('inline_field_verification_desc')}</p>
                  </div>
                  {Array.from(activeFieldPaths).some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="bg-card-warm hover:bg-pine-soft border-line hover:border-pine/30 text-pine font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md h-8 px-3 transition-all cursor-pointer"
                      onClick={() => {
                        const proposedPaths = Array.from(activeFieldPaths).filter(p => fieldStatesByPath.get(p)?.status === 'proposed')
                        bulkConfirmMutation.mutate(proposedPaths)
                      }}
                      disabled={bulkConfirmMutation.isPending}
                    >
                      {bulkConfirmMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                      {t('confirm_all_fields')}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {caseDetail?.template.field_groups.map((group) => {
                    const activeGroupPaths = group.field_paths.filter((path) => activeFieldPaths.has(path))
                    if (activeGroupPaths.length === 0) return null

                    return activeGroupPaths.map((path) => {
                      const fieldState = fieldStatesByPath.get(path)
                      const templateField = caseDetail.template.schema.find((tf) => tf.path === path)
                      const fieldIssues = validation?.filter((v) => v.field_path === path) || []
                      if (!templateField) return null
                      return (
                        <FieldRow
                          key={path}
                          field={templateField}
                          state={fieldState}
                          issues={fieldIssues}
                          allEvidence={evidence || []}
                              uploadFileMutation={uploadFileMutation}
                          onConfirm={(p) => confirmFieldMutation.mutate(p)}
                          onReject={(p) => onLocalReject(p)}
                          onEdit={onEditField}
                          validationRules={validationRules}
                          isLocallyRejected={localRejectedFields.has(path)}
                          onUndoReject={onUndoLocalReject}
                        />
                      )
                    })
                  })}
                </div>
              </div>

              {/* Inline Approve, QA, or Review panel */}
              {caseDetail?.status !== 'approved' && caseDetail?.status !== 'artifact_generating' && (
                <div className={cn(
                  "p-6 border shadow-sm rounded-lg flex flex-col items-center text-center space-y-4",
                  unreviewedProposedCount > 0
                    ? "bg-marigold-soft border-marigold/30"
                    : localRejectedFields.size > 0
                      ? "bg-inkblue-soft border-inkblue/30"
                      : "bg-leaf-soft border-leaf/30"
                )}>
                  {unreviewedProposedCount > 0 ? (
                    <>
                      <div className="p-3 bg-card-warm text-marigold rounded-md">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">
                          {t('review_in_progress')}
                        </h4>
                        <p className="text-[11px] text-ink-soft mt-1 max-w-md leading-relaxed font-medium animate-none">
                          {t('review_in_progress_desc')}
                        </p>
                      </div>
                      <Button
                        className="bg-paper/60 text-ink-faint border border-line font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md h-10 px-8 cursor-not-allowed"
                        disabled
                      >
                        {t('awaiting_verification_count', { count: unreviewedProposedCount })}
                      </Button>
                    </>
                  ) : localRejectedFields.size > 0 ? (
                    <>
                      <div className="p-3 bg-card-warm text-inkblue rounded-md animate-none">
                        <Zap className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">
                          {t('rejections_pending')}
                        </h4>
                        <p className="text-[11px] text-ink-soft mt-1 max-w-md leading-relaxed font-medium">
                          {t('rejections_pending_desc')}
                        </p>
                      </div>
                      <Button
                        className="bg-pine hover:bg-pine-deep text-primary-foreground font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md h-10 px-8 transition-all shadow-sm active:scale-95 cursor-pointer"
                        onClick={() => bulkRejectMutation.mutate(Array.from(localRejectedFields))}
                        disabled={bulkRejectMutation.isPending}
                      >
                        {bulkRejectMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 mr-2" />
                        )}
                        {t('start_qa_for_rejections', { count: localRejectedFields.size })}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-card-warm text-leaf rounded-md">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">{t('final_verification_complete')}</h4>
                        <p className="text-[11px] text-ink-soft mt-1 max-w-md leading-relaxed font-medium">
                          {t('final_verification_desc')}
                        </p>
                      </div>
                      <Button
                        className={cn(
                          "bg-leaf hover:bg-leaf/90 text-primary-foreground font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md h-10 px-8 transition-all shadow-sm cursor-pointer",
                          isApproveReady && "ring-2 ring-leaf/40"
                        )}
                        onClick={() => approveCaseMutation.mutate()}
                        disabled={approveCaseMutation.isPending}
                      >
                        {approveCaseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-2" />}
                        {t('approve_and_close_case')}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Case Documents Download dashboard */}
              {(caseDetail?.status === 'approved' || caseDetail?.status === 'artifact_generating' || (artifacts && artifacts.length > 0)) && (
                <div className="space-y-4">
                  <div className="border-b border-line pb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-[11px] font-mono font-semibold text-ink-faint uppercase tracking-[0.2em]">{t('case_documents')}</h4>
                      <p className="text-[11px] text-ink-faint font-medium">{t('case_documents_desc')}</p>
                    </div>
                    {caseDetail?.template?.supported_artifacts && caseDetail.template.supported_artifacts.length > 0 && (
                      <div className="flex space-x-2">
                        {caseDetail.template.supported_artifacts.map((type) => {
                          const exists = artifacts?.some((art) => art.artifact_type === type)
                          if (exists) return null
                          return (
                            <Button
                              key={type}
                              size="xs"
                              className="bg-pine hover:bg-pine-deep text-primary-foreground font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md h-7 px-2.5 transition-all shadow-sm cursor-pointer"
                              onClick={() => generateArtifactMutation.mutate(type)}
                              disabled={generateArtifactMutation.isPending}
                            >
                              {t('generate', { type: type.toUpperCase() })}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {artifacts?.map((art) => (
                      <div key={art.artifact_id} className="card-ledger flex items-center justify-between p-4 rounded-lg hover:bg-pine-soft/40 transition-all group">
                        <div className="flex items-center space-x-3 truncate">
                          <div className="p-2.5 bg-pine-soft text-pine rounded-md group-hover:bg-pine group-hover:text-primary-foreground transition-all">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="truncate text-left">
                            <span className="block text-[11px] font-mono font-semibold text-ink uppercase tracking-[0.08em] truncate">{art.artifact_type}</span>
                            <span className="block text-[11px] text-ink-faint font-mono uppercase tracking-[0.16em] mt-0.5">{t('ready_for_download')}</span>
                          </div>
                        </div>
                        {art.status === 'generated' ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-ink-faint hover:text-pine hover:bg-pine-soft rounded-md cursor-pointer" aria-label={t('download')} onClick={() => { void downloadArtifact(caseId!, art.artifact_id).catch(() => alert(t('auth_download_failed'))) }}><Download className="w-4 h-4" /></Button>
                        ) : (
                          <div className="h-2 w-2 bg-inkblue rounded-full animate-none mr-3" />
                        )}
                      </div>
                    ))}

                    {caseDetail?.template?.supported_artifacts && caseDetail.template.supported_artifacts.length > 0 && artifacts?.length === 0 && (
                      <div className="p-4 bg-card-warm rounded-lg border border-line flex flex-col items-center justify-center text-center py-6 col-span-2">
                        <p className="text-[11px] text-ink-faint font-mono uppercase tracking-[0.16em] mb-3">{t('no_files_generated')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Sticky Bottom Input Bar (if next question outstanding) */}
      {nextQuestion && nextQuestion.kind !== 'document_upload' && (
        <div className="border-t border-line bg-card-warm/90 backdrop-blur-md px-4 py-2 shrink-0 relative">
          <div className="max-w-3xl mx-auto">
            <div className="mb-2">
              <DocumentTypeSelect value={documentType} onChange={setDocumentType} disabled={uploadFileMutation.isPending || submitTurnMutation.isPending} />
            </div>
            <div className="flex items-end gap-2 bg-card-warm border border-line rounded-lg shadow-sm p-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('attach_file')}
                className="h-9 w-9 rounded-md text-ink-faint hover:text-pine hover:bg-pine-soft shrink-0"
                onClick={() => document.getElementById('simplified-chat-file-upload')?.click()}
                disabled={uploadFileMutation.isPending || submitTurnMutation.isPending}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <input
                id="simplified-chat-file-upload"
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                onChange={(event) => {
                  setUploadError(null)
                  const file = event.target.files?.[0]
                  if (file) uploadFileMutation.mutate({ file, documentType })
                  event.target.value = ''
                }}
                disabled={uploadFileMutation.isPending || submitTurnMutation.isPending}
              />
              <textarea
                ref={composerRef}
                rows={1}
                aria-label={t('reply_placeholder')}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={uploadFileMutation.isPending ? t('upload_wait_placeholder') : t('reply_placeholder')}
                className="flex-1 min-w-0 min-h-9 max-h-32 bg-transparent border-none px-1 py-2 text-sm focus:outline-none focus:ring-0 resize-none text-ink placeholder:text-ink-faint leading-5 disabled:opacity-50"
                disabled={uploadFileMutation.isPending || submitTurnMutation.isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    if (chatInput.trim() && !submitTurnMutation.isPending && !uploadFileMutation.isPending) {
                      submitTurnMutation.mutate(chatInput)
                    }
                  }
                }}
              />
              <Button
                size="icon"
                aria-label={t('send_message')}
                className="h-9 w-9 bg-pine hover:bg-pine-deep text-primary-foreground rounded-md shrink-0 transition-all active:scale-95 disabled:bg-pine/10 disabled:text-ink-faint"
                disabled={!chatInput.trim() || submitTurnMutation.isPending || uploadFileMutation.isPending}
                onClick={() => submitTurnMutation.mutate(chatInput)}
              >
                {submitTurnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            {uploadFileMutation.isPending && (
              <p role="status" className="mt-1 text-xs text-inkblue">{t('ocr_analyzing')}</p>
            )}
            {(uploadError || submitTurnMutation.isError) && (
              <p role="alert" className="mt-1 text-xs text-terracotta">{uploadError || t('message_send_error')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
