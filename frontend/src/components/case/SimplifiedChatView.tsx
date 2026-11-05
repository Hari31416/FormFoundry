import React from 'react'
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
import {
  CaseDetail,
  FieldState,
  Evidence,
  getDownloadUrl
} from '@/lib/api'
import { FieldRow } from './FieldRow'
import { useTranslation } from 'react-i18next'

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
  uploadFileMutation: any
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
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50/20">
      <ScrollArea className="flex-1 min-h-0 px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-2">
          {/* Welcome Intro Card */}
          <div className="flex items-start space-x-3 w-full">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/10">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-w-[85%]">
              <p className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1">{t('assistant_name')}</p>
              <p
                className="text-sm text-slate-600 leading-relaxed font-medium"
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
                  <div className="p-2 bg-slate-100 rounded-xl text-slate-600 border border-slate-200">
                    {isLatestAssistant ? (
                      <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
                    ) : (
                      <Zap className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                )}
                <div className={cn(
                  "rounded-2xl p-4 max-w-[80%] shadow-sm transition-all duration-200 relative overflow-hidden",
                  isAssistant
                    ? isLatestAssistant
                      ? "bg-blue-50/50 text-slate-800 border border-blue-100 shadow-blue-100/30"
                      : "bg-slate-50 text-slate-800 border border-slate-100"
                    : "bg-blue-600 text-white rounded-tr-none ml-auto"
                )}>
                  {isAssistant && (
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        {isLatestAssistant ? t('active_question') : t('assistant_name')}
                      </span>
                      {msg.metadata?.reason && !isLatestAssistant && (
                        <span className="text-[8px] font-bold text-slate-300 bg-slate-100 px-1 py-0.5 rounded leading-none uppercase tracking-tighter">
                          {t('reasoned_match')}
                        </span>
                      )}
                    </div>
                  )}

                  {isAssistant ? (
                    <div className="space-y-3">
                      {isLatestAssistant && fieldLabels.length > 0 && (
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          {fieldLabels.map((lbl: string) => (
                            <Badge key={lbl} variant="outline" className="text-[8px] font-bold border-blue-200 text-blue-600 bg-blue-100/30 uppercase tracking-tighter h-4">
                              {lbl}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <p className={cn("text-[13px] leading-relaxed whitespace-pre-wrap text-left", isLatestAssistant ? "font-black text-slate-900" : "font-medium text-slate-800")}>
                          {msg.message}
                        </p>
                        {langConfig?.is_tts_enabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-7 w-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 shrink-0",
                              playingQuestion === msg.message && "text-blue-600 bg-blue-50 animate-pulse"
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
                      {playingQuestion === msg.message && audioInstance && (
                        <div className="flex items-center space-x-3 p-3 bg-blue-50/40 border border-blue-100/60 rounded-2xl mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center space-x-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-slate-500 hover:text-blue-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
                              onClick={() => handleSeekAudio(Math.max(0, audioCurrentTime - 10))}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-sm transition-all cursor-pointer flex items-center justify-center"
                              onClick={handleTogglePlayPause}
                            >
                              {isAudioPlaying ? (
                                <Pause className="w-3.5 h-3.5 fill-white text-white" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-slate-500 hover:text-blue-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
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
                              className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                            />
                            <span className="text-[10px] font-bold text-slate-500 min-w-[65px] text-right tabular-nums shrink-0">
                              {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0 cursor-pointer flex items-center justify-center"
                            onClick={handleStopAudio}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}

                      {/* Expandable Thinking */}
                      {isLatestAssistant && (
                        <div className="mt-3 border-t border-blue-100/60 pt-2.5">
                          <button
                            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                            className="text-[9px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 flex items-center space-x-1 cursor-pointer"
                          >
                            <span>{isThinkingExpanded ? t('hide_strategy') : t('show_strategy')}</span>
                            <span className="text-[8px]">{isThinkingExpanded ? '▲' : '▼'}</span>
                          </button>
                          <AnimatePresence>
                            {isThinkingExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mt-2"
                              >
                                <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100/60 italic leading-relaxed">
                                  {reason}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] leading-relaxed font-medium whitespace-pre-wrap text-left text-white">
                      {msg.message}
                    </p>
                  )}

                  <div className={cn("text-[8px] mt-2 font-medium uppercase tracking-widest leading-none text-right", isAssistant ? "text-slate-300" : "text-blue-200")}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {!isAssistant && (
                  <div className="p-2 bg-blue-100 rounded-xl text-blue-600 border border-blue-200">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            )
          })}

          {submitTurnMutation.isPending && (
            <div role="status" aria-live="polite" className="flex items-center gap-3 text-slate-500">
              <div className="p-2 bg-slate-100 rounded-xl border border-slate-200">
                <Loader2 aria-hidden="true" className="w-4 h-4 text-blue-600 animate-spin motion-reduce:animate-none" />
              </div>
              <span className="text-sm">{t('generating_response')}</span>
            </div>
          )}

          {/* Active Upload/OCR Error Alert Card */}
          {uploadError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 rounded-3xl p-5 shadow-sm flex items-start space-x-3 w-full"
            >
              <div className="p-2 bg-red-500 text-white rounded-xl shadow-lg shadow-red-500/10 shrink-0">
                <CheckCircle2 className="w-4 h-4 rotate-45 text-white" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-red-900 uppercase tracking-wider">{t('document_processing_failed')}</h4>
                  <button
                    onClick={() => setUploadError(null)}
                    className="text-[9px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest leading-none bg-red-100/50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {t('clear_error')}
                  </button>
                </div>
                <p className="text-[11px] text-red-700 font-bold leading-relaxed mt-1.5 break-words">
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
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 shadow-sm flex items-start space-x-4">
                <div className="p-2.5 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-900 uppercase tracking-wider">{t('intake_questionnaire_complete')}</h3>
                  <p className="text-xs text-emerald-700 leading-relaxed mt-1 font-medium">
                    {completionMessage}
                  </p>
                </div>
              </div>

              {/* Inline Field Verification Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('inline_field_verification')}</h4>
                    <p className="text-[10px] text-slate-400 font-bold">{t('inline_field_verification_desc')}</p>
                  </div>
                  {Array.from(activeFieldPaths).some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200 text-blue-600 font-black uppercase tracking-widest text-[9px] rounded-lg h-8 px-3 transition-all cursor-pointer"
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
                <div className="p-6 bg-white border border-slate-100 shadow-sm rounded-3xl flex flex-col items-center text-center space-y-4">
                  {unreviewedProposedCount > 0 ? (
                    <>
                      <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          {t('review_in_progress', { defaultValue: 'Review in Progress' })}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-md leading-relaxed font-bold animate-pulse">
                          {t('review_in_progress_desc', { defaultValue: 'Please approve or reject the remaining proposed fields to proceed.' })}
                        </p>
                      </div>
                      <Button
                        className="bg-slate-100 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded-xl h-10 px-8 cursor-not-allowed"
                        disabled
                      >
                        {t('awaiting_verification_count', { count: unreviewedProposedCount, defaultValue: `Review Remaining (${unreviewedProposedCount})` })}
                      </Button>
                    </>
                  ) : localRejectedFields.size > 0 ? (
                    <>
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl animate-pulse">
                        <Zap className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          {t('rejections_pending', { defaultValue: 'Review Completed with Rejections' })}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-md leading-relaxed font-bold">
                          {t('rejections_pending_desc', { defaultValue: 'You have rejected some fields. Start the intake chat again to clarify these details.' })}
                        </p>
                      </div>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl h-10 px-8 transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
                        onClick={() => bulkRejectMutation.mutate(Array.from(localRejectedFields))}
                        disabled={bulkRejectMutation.isPending}
                      >
                        {bulkRejectMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 mr-2" />
                        )}
                        {t('start_qa_for_rejections', { count: localRejectedFields.size, defaultValue: `Start QA for Rejected Fields (${localRejectedFields.size})` })}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">{t('final_verification_complete')}</h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-md leading-relaxed font-bold">
                          {t('final_verification_desc')}
                        </p>
                      </div>
                      <Button
                        className={cn(
                          "bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl h-10 px-8 transition-all shadow-lg shadow-emerald-600/10 cursor-pointer",
                          isApproveReady && "animate-bounce"
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
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('case_documents')}</h4>
                      <p className="text-[10px] text-slate-400 font-bold">{t('case_documents_desc')}</p>
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
                              className="bg-slate-900 hover:bg-blue-600 text-white font-black uppercase tracking-widest text-[8px] rounded-lg h-7 px-2.5 transition-all shadow-sm cursor-pointer"
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
                      <div key={art.artifact_id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-blue-100 transition-all group">
                        <div className="flex items-center space-x-3 truncate">
                          <div className="p-2.5 bg-blue-50 text-blue-500 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="truncate text-left">
                            <span className="block text-[11px] font-black text-slate-800 uppercase tracking-tighter truncate">{art.artifact_type}</span>
                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{t('ready_for_download')}</span>
                          </div>
                        </div>
                        {art.status === 'generated' ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer">
                            <a href={getDownloadUrl(caseId!, art.artifact_id)} target="_blank" rel="noreferrer">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        ) : (
                          <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse mr-3" />
                        )}
                      </div>
                    ))}

                    {caseDetail?.template?.supported_artifacts && caseDetail.template.supported_artifacts.length > 0 && artifacts?.length === 0 && (
                      <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center py-6 col-span-2">
                        <p className="text-[11px] text-slate-400 font-bold mb-3 uppercase tracking-wider">{t('no_files_generated')}</p>
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
      {nextQuestion && (
        <div className="border-t border-slate-200/50 bg-white/80 backdrop-blur-md px-4 py-2 shrink-0 relative">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-white border border-slate-200/70 rounded-2xl shadow-sm p-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('attach_file')}
                className="h-9 w-9 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
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
                  if (file) uploadFileMutation.mutate(file)
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
                className="flex-1 min-w-0 min-h-9 max-h-32 bg-transparent border-none px-1 py-2 text-sm focus:outline-none focus:ring-0 resize-none text-slate-800 placeholder:text-slate-400 leading-5 disabled:opacity-50"
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
                className="h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shrink-0 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!chatInput.trim() || submitTurnMutation.isPending || uploadFileMutation.isPending}
                onClick={() => submitTurnMutation.mutate(chatInput)}
              >
                {submitTurnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            {uploadFileMutation.isPending && (
              <p role="status" className="mt-1 text-xs text-blue-600">{t('ocr_analyzing')}</p>
            )}
            {(uploadError || submitTurnMutation.isError) && (
              <p role="alert" className="mt-1 text-xs text-red-600">{uploadError || t('message_send_error')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
