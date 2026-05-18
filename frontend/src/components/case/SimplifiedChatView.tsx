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
  Send
} from 'lucide-react'

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
  caseId
}: SimplifiedChatViewProps) {
  // Find the index of the latest assistant message to attach active question decorations
  const lastAssistantIdx = React.useMemo(() => {
    for (let i = mergedMessages.length - 1; i >= 0; i--) {
      if (mergedMessages[i].role === 'assistant') {
        return i
      }
    }
    return -1
  }, [mergedMessages])

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50/20">
      <ScrollArea className="flex-1 min-h-0 px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-28">
          {/* Welcome Intro Card */}
          <div className="flex items-start space-x-3 w-full">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/10">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-w-[85%]">
              <p className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1">FormFoundry Assistant</p>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Welcome to the simplified intake experience for <strong>{caseDetail?.template.name}</strong>.
                I will ask a few quick questions to gather all necessary details. You can reply in the chat or upload files (images/PDFs) as evidence at any time.
              </p>
            </div>
          </div>

          {/* Merged Conversation History */}
          {mergedMessages.map((msg, idx) => {
            const isAssistant = msg.role === 'assistant'
            const isLatestAssistant = isAssistant && idx === lastAssistantIdx && !!nextQuestion

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
                        {isLatestAssistant ? "Active Question" : "Assistant"}
                      </span>
                      {msg.metadata?.reason && !isLatestAssistant && (
                        <span className="text-[8px] font-bold text-slate-300 bg-slate-100 px-1 py-0.5 rounded leading-none uppercase tracking-tighter">
                          Reasoned Match
                        </span>
                      )}
                    </div>
                  )}

                  {isLatestAssistant ? (
                    <div className="space-y-3">
                      {nextQuestion.field_labels && nextQuestion.field_labels.length > 0 && (
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          {nextQuestion.field_labels.map((lbl: string) => (
                            <Badge key={lbl} variant="outline" className="text-[8px] font-bold border-blue-200 text-blue-600 bg-blue-100/30 uppercase tracking-tighter h-4">
                              {lbl}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[13px] leading-relaxed font-black text-slate-900 whitespace-pre-wrap text-left">
                          {nextQuestion.question}
                        </p>
                        {langConfig?.is_tts_enabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-7 w-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 shrink-0",
                              playingQuestion === nextQuestion.question && "text-blue-600 bg-blue-50 animate-pulse"
                            )}
                            onClick={() => handlePlayTTS(nextQuestion.question, caseDetail?.metadata?.preferred_language || 'en')}
                            disabled={!!loadingAudio && loadingAudio !== nextQuestion.question}
                          >
                            {loadingAudio === nextQuestion.question ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : playingQuestion === nextQuestion.question ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Expandable Thinking */}
                      <div className="mt-3 border-t border-blue-100/60 pt-2.5">
                        <button
                          onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                          className="text-[9px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                        >
                          <span>{isThinkingExpanded ? 'Hide Strategy' : 'Show Strategy'}</span>
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
                                {nextQuestion.reason}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : (
                    <p className={cn("text-[13px] leading-relaxed font-medium whitespace-pre-wrap text-left", isAssistant ? "text-slate-800" : "text-white")}>
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
                  <h4 className="text-xs font-black text-red-900 uppercase tracking-wider">Document Processing Failed</h4>
                  <button
                    onClick={() => setUploadError(null)}
                    className="text-[9px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest leading-none bg-red-100/50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors"
                  >
                    Clear Error
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
                  <h3 className="text-sm font-black text-emerald-900 uppercase tracking-wider">Intake Questionnaire Complete</h3>
                  <p className="text-xs text-emerald-700 leading-relaxed mt-1 font-medium">
                    {completionMessage}. All schema values have been proposed with satisfactory certitude.
                  </p>
                </div>
              </div>

              {/* Inline Field Verification Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Inline Field Verification</h4>
                    <p className="text-[10px] text-slate-400 font-bold">Review and confirm all details directly in your chat</p>
                  </div>
                  {Array.from(activeFieldPaths).some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200 text-blue-600 font-black uppercase tracking-widest text-[9px] rounded-lg h-8 px-3 transition-all"
                      onClick={() => {
                        const proposedPaths = Array.from(activeFieldPaths).filter(p => fieldStatesByPath.get(p)?.status === 'proposed')
                        bulkConfirmMutation.mutate(proposedPaths)
                      }}
                      disabled={bulkConfirmMutation.isPending}
                    >
                      {bulkConfirmMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                      Confirm All Fields
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
                          onReject={(p) => rejectFieldMutation.mutate(p)}
                        />
                      )
                    })
                  })}
                </div>
              </div>

              {/* Inline Approve & Close panel */}
              {caseDetail?.status !== 'approved' && caseDetail?.status !== 'artifact_generating' && (
                <div className="p-6 bg-white border border-slate-100 shadow-sm rounded-3xl flex flex-col items-center text-center space-y-4">
                  <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Final Verification Complete?</h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-md leading-relaxed font-bold">
                      Once all values are verified, approve the intake to generate required regulatory documents and artifacts.
                    </p>
                  </div>
                  <Button
                    className={cn(
                      "bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl h-10 px-8 transition-all shadow-lg shadow-emerald-600/10",
                      isApproveReady && "animate-bounce"
                    )}
                    onClick={() => approveCaseMutation.mutate()}
                    disabled={approveCaseMutation.isPending}
                  >
                    {approveCaseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-2" />}
                    Approve & Close Case
                  </Button>
                </div>
              )}

              {/* Case Documents Download dashboard */}
              {(caseDetail?.status === 'approved' || caseDetail?.status === 'artifact_generating' || (artifacts && artifacts.length > 0)) && (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Case Documents</h4>
                      <p className="text-[10px] text-slate-400 font-bold">Download generated case artifacts and compliance records</p>
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
                              className="bg-slate-900 hover:bg-blue-600 text-white font-black uppercase tracking-widest text-[8px] rounded-lg h-7 px-2.5 transition-all shadow-sm"
                              onClick={() => generateArtifactMutation.mutate(type)}
                              disabled={generateArtifactMutation.isPending}
                            >
                              Generate {type}
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
                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">READY FOR DOWNLOAD</span>
                          </div>
                        </div>
                        {art.status === 'generated' ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
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
                        <p className="text-[11px] text-slate-400 font-bold mb-3 uppercase tracking-wider">No files generated yet</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Sticky Bottom Input Bar (if next question outstanding) */}
      {nextQuestion && (
        <div className="border-t border-slate-200/50 bg-white/80 backdrop-blur-md p-4 shrink-0 relative">
          <div className="max-w-3xl mx-auto bg-white border border-slate-200/70 rounded-2xl shadow-lg shadow-slate-900/5 p-2 space-y-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={uploadFileMutation.isPending ? "Please wait while your document is being analyzed..." : "Reply to the question or paste case evidence details..."}
              className="w-full bg-transparent border-none p-3 pb-0 text-sm focus:outline-none focus:ring-0 resize-none h-16 text-slate-800 placeholder:text-slate-400 leading-relaxed disabled:opacity-50"
              disabled={uploadFileMutation.isPending || submitTurnMutation.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    // allows new line
                  } else {
                    e.preventDefault()
                    if (chatInput.trim() && !submitTurnMutation.isPending && !uploadFileMutation.isPending) {
                      submitTurnMutation.mutate(chatInput)
                    }
                  }
                }
              }}
            />

            <div className="flex items-center justify-between border-t border-slate-100/50 pt-2 px-2">
              <div className="flex items-center space-x-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0",
                    uploadFileMutation.isPending && "bg-blue-50 text-blue-600"
                  )}
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
                    if (file) {
                      uploadFileMutation.mutate(file)
                    }
                  }}
                  disabled={uploadFileMutation.isPending || submitTurnMutation.isPending}
                />
                {uploadFileMutation.isPending && (
                  <div className="flex items-center space-x-1 text-[10px] font-black text-blue-600 uppercase tracking-wider animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>OCR Analyzing...</span>
                  </div>
                )}
                {uploadError && (
                  <span className="text-[10px] font-semibold text-red-500 max-w-[200px] truncate">
                    {uploadError}
                  </span>
                )}
              </div>

              <Button
                size="icon"
                className="h-8 w-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 shrink-0 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                disabled={!chatInput.trim() || submitTurnMutation.isPending || uploadFileMutation.isPending}
                onClick={() => submitTurnMutation.mutate(chatInput)}
              >
                {submitTurnMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
