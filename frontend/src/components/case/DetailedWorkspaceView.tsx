import React from 'react'
import { motion } from 'framer-motion'
import {
  Check,
  Loader2,
  Plus,
  Clock,
  VolumeX,
  Volume2,
  Send,
  FileText,
  Download,
  Zap,
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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  CaseDetail,
  FieldState,
  Evidence,
  getDownloadUrl
} from '@/lib/api'
import { FieldRow } from './FieldRow'
import { useTranslation } from 'react-i18next'

interface DetailedWorkspaceViewProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  activeFieldPaths: Set<string>
  fieldStatesByPath: Map<string, FieldState>
  caseDetail: CaseDetail | undefined
  validation: any[] | undefined
  evidence: Evidence[] | undefined
  confirmFieldMutation: any
  rejectFieldMutation: any
  bulkConfirmMutation: any
  onEditField: (path: string, value: any) => Promise<void>
  isEvidenceModalOpen: boolean
  setIsEvidenceModalOpen: (open: boolean) => void
  uploadFileMutation: any
  uploadError: string | null
  setUploadError: (err: string | null) => void
  addTextMutation: any
  nextQuestion: any
  langConfig: any
  playingQuestion: string | null
  loadingAudio: string | null
  handlePlayTTS: (text: string, lang: string) => void
  isConversationComplete: boolean
  completionMessage: string
  hiddenConditionalFieldCount: number
  chatInput: string
  setChatInput: (input: string) => void
  submitTurnMutation: any
  artifacts: any[] | undefined
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

export function DetailedWorkspaceView({
  activeTab,
  setActiveTab,
  activeFieldPaths,
  fieldStatesByPath,
  caseDetail,
  validation,
  evidence,
  confirmFieldMutation,
  rejectFieldMutation,
  bulkConfirmMutation,
  onEditField,
  isEvidenceModalOpen,
  setIsEvidenceModalOpen,
  uploadFileMutation,
  uploadError,
  setUploadError,
  addTextMutation,
  nextQuestion,
  langConfig,
  playingQuestion,
  loadingAudio,
  handlePlayTTS,
  isConversationComplete,
  completionMessage,
  hiddenConditionalFieldCount,
  chatInput,
  setChatInput,
  submitTurnMutation,
  artifacts,
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
}: DetailedWorkspaceViewProps) {
  const { t } = useTranslation()
  const validationRules = caseDetail?.template.validation_rules ?? []
  return (
    <>
      <section className="flex-1 min-h-0 flex flex-col bg-paper overflow-visible lg:overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full min-h-0 flex flex-col">
          <div className="px-8 bg-card-warm border-b border-line flex items-center justify-between h-12">
            <TabsList className="bg-transparent border-none p-0 h-full space-x-8">
              <TabsTrigger value="review" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-pine rounded-none h-full px-0 font-semibold text-[11px] uppercase tracking-[0.18em] text-ink-faint data-[state=active]:text-pine transition-all cursor-pointer">
                {t('field_verification')}
              </TabsTrigger>
              <TabsTrigger value="evidence" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-pine rounded-none h-full px-0 font-semibold text-[11px] uppercase tracking-[0.18em] text-ink-faint data-[state=active]:text-pine transition-all cursor-pointer">
                {t('raw_evidence')}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="max-w-4xl mx-auto p-4 sm:p-8">
              <TabsContent value="review" className="m-0 space-y-8 sm:space-y-12 pb-20">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 card-ledger p-4 rounded-lg">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="p-2 bg-pine rounded-md shrink-0">
                      <Check className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-serif font-semibold text-ink tracking-normal">{t('global_verification')}</h3>
                      <p className="text-[11px] text-ink-faint font-medium">{t('global_verification_desc')}</p>
                    </div>
                  </div>
                  {Array.from(activeFieldPaths).some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto shrink-0 bg-pine hover:bg-pine-deep border-pine text-primary-foreground font-semibold text-[11px] rounded-md h-9 px-4 transition-all shadow-sm cursor-pointer"
                      aria-label={t('confirm_all_fields')}
                      onClick={() => {
                        const proposedPaths = Array.from(activeFieldPaths).filter(p => fieldStatesByPath.get(p)?.status === 'proposed')
                        bulkConfirmMutation.mutate(proposedPaths)
                      }}
                      disabled={bulkConfirmMutation.isPending}
                    >
                      {bulkConfirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                      <span className="whitespace-normal text-left">{t('confirm_all_fields')}</span>
                    </Button>
                  )}
                </div>
                {caseDetail?.template.field_groups.map((group) => {
                  const activeGroupPaths = group.field_paths.filter((path) => activeFieldPaths.has(path))
                  if (activeGroupPaths.length === 0) {
                    return null
                  }

                  return (
                    <div key={group.group_id} className="space-y-4">
                      <div className="flex items-center justify-between border-l-2 border-pine pl-4 py-1">
                        <div className="flex flex-col">
                          <h3 className="text-xs font-semibold text-ink uppercase tracking-[0.2em]">{group.label}</h3>
                          <p className="text-[11px] text-ink-faint font-medium">{group.description}</p>
                        </div>
                        {activeGroupPaths.some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-pine hover:bg-pine-soft font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md px-2 h-7 cursor-pointer"
                            onClick={() => {
                              const groupProposed = activeGroupPaths.filter(p => fieldStatesByPath.get(p)?.status === 'proposed')
                              bulkConfirmMutation.mutate(groupProposed)
                            }}
                            disabled={bulkConfirmMutation.isPending}
                          >
                            {bulkConfirmMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin mr-1.5" /> : <Check className="w-3 h-3 mr-1.5" />}
                            {t('confirm_section')}
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {activeGroupPaths.map((path) => {
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
                        })}
                      </div>
                    </div>
                  )
                })}
              </TabsContent>

              <TabsContent value="evidence" className="m-0 pb-20">
                <div className="grid grid-cols-1 gap-4">
                  {evidence?.map((ev) => (
                    <Card key={ev.evidence_id} className="card-ledger rounded-lg overflow-hidden hover:border-line-strong transition-colors group">
                      <CardHeader className="p-4 bg-paper/60 border-b border-line flex-row items-center justify-between space-y-0">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="p-1 px-1.5 bg-pine-soft text-pine font-mono rounded text-[11px] font-medium uppercase tracking-[0.14em]">
                            {ev.source_type}
                          </div>
                          {ev.source_subtype && (
                            <span className="max-w-[220px] truncate text-[11px] font-mono text-ink-soft">
                              {ev.source_subtype}
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-ink-faint tabular-nums">{new Date(ev.created_at).toLocaleString()}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5">
                        <p className="text-[13px] text-ink-soft leading-relaxed font-medium italic">
                          "
                          {ev.raw_text || ev.parsed_payload?.extracted_text || 'Extraction pending or no text detected yet.'}
                          "
                        </p>
                        {typeof ev.parsed_payload?.page_count === 'number' && (
                          <p className="mt-3 text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-ink-faint">
                            {t(ev.parsed_payload.page_count === 1 ? 'pdf_page' : 'pdf_page_plural', { count: ev.parsed_payload.page_count })}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  <Dialog open={isEvidenceModalOpen} onOpenChange={setIsEvidenceModalOpen}>
                    <DialogTrigger
                      render={
                        <motion.button
                          whileHover={{ scale: 1.005 }}
                          whileTap={{ scale: 0.995 }}
                          className="h-24 border-2 border-dashed border-line-strong rounded-lg flex flex-col items-center justify-center text-ink-faint hover:border-pine hover:bg-pine-soft/30 hover:text-pine transition-all bg-card-warm cursor-pointer"
                        />
                      }
                    >
                      <Plus className="w-5 h-5 mb-1.5" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t('inject_new_evidence')}</span>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-card-warm rounded-lg p-0 overflow-hidden border-line shadow-2xl">
                      <div className="p-8">
                        <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-pine-soft rounded-md">
                            <Plus className="w-5 h-5 text-pine" />
                          </div>
                          <h3 className="text-xl font-serif font-semibold text-ink tracking-tight">{t('new_intake_evidence')}</h3>
                        </div>
                        <textarea
                          id="evidence-text"
                          placeholder={t('paste_notes_placeholder')}
                          className="w-full h-48 p-5 bg-paper border border-line rounded-md focus:ring-2 focus:ring-pine/25 focus:outline-none resize-none text-ink placeholder:text-ink-faint transition-all"
                        />
                        <div className="mt-4 rounded-md border border-line bg-paper p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">{t('upload_image_or_pdf')}</p>
                              <p className="mt-1 text-[11px] text-ink-soft">
                                {t('vision_ocr_desc')}
                              </p>
                            </div>
                          </div>
                          <input
                            id="evidence-file"
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            className="mt-4 block w-full text-sm text-ink-soft file:mr-4 file:rounded-md file:border-0 file:bg-pine file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-pine-deep"
                            onChange={(event) => {
                              setUploadError(null)
                              const file = event.target.files?.[0]
                              if (file) {
                                uploadFileMutation.mutate(file)
                              }
                            }}
                            disabled={uploadFileMutation.isPending}
                          />
                          {uploadFileMutation.isPending && (
                            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-pine">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t('uploading_ocr')}
                            </div>
                          )}
                          {uploadError && (
                            <div className="mt-3 rounded-md border border-terracotta/30 bg-terracotta-soft px-3 py-2 text-[11px] font-semibold text-terracotta">
                              {uploadError}
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end space-x-3 mt-8">
                          <Button
                            variant="ghost"
                            className="rounded-md font-semibold text-ink-soft hover:bg-paper cursor-pointer"
                            onClick={() => {
                              setUploadError(null)
                              setIsEvidenceModalOpen(false)
                            }}
                          >
                            {t('cancel')}
                          </Button>
                          <Button
                            className="bg-pine hover:bg-pine-deep text-primary-foreground rounded-md font-semibold px-6 shadow-sm cursor-pointer"
                            onClick={() => {
                              const el = document.getElementById('evidence-text') as HTMLTextAreaElement
                              if (el?.value) {
                                addTextMutation.mutate(el.value)
                              }
                            }}
                            disabled={addTextMutation.isPending || uploadFileMutation.isPending}
                          >
                            {addTextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('confirm_ingestion')}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </section>

      <section className="w-full lg:w-[500px] border-t lg:border-t-0 lg:border-l border-line bg-paper flex flex-col shrink-0 lg:max-h-none max-h-[60dvh] lg:overflow-visible overflow-y-auto">
        <div className="flex-1 min-h-0 flex flex-col p-6 space-y-8 overflow-y-auto">
          <div className="card-ledger rounded-lg border-t-2 border-t-pine p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-1 px-1.5 bg-pine rounded font-mono text-primary-foreground font-medium text-[11px] uppercase tracking-[0.18em]">
                AI
              </div>
              <h2 className="text-[11px] font-semibold text-ink uppercase tracking-[0.2em]">{t('ai_intake_intelligence')}</h2>
            </div>

            <div className="space-y-4 min-h-[120px]">
              {nextQuestion ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[15px] font-semibold text-ink leading-snug flex-1">{nextQuestion.question}</p>
                    {langConfig?.is_tts_enabled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-9 w-9 rounded-md text-ink-faint hover:text-pine hover:bg-pine-soft shrink-0",
                          playingQuestion === nextQuestion.question && "text-pine bg-pine-soft"
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
                  {playingQuestion === nextQuestion.question && audioInstance && (
                    <div className="flex items-center space-x-3 p-3 bg-paper border border-line rounded-md mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center space-x-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-md text-ink-faint hover:text-pine hover:bg-pine-soft flex items-center justify-center transition-all cursor-pointer"
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
                          className="h-9 w-9 rounded-md text-ink-faint hover:text-pine hover:bg-pine-soft flex items-center justify-center transition-all cursor-pointer"
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
                          className="flex-1 h-1 bg-line rounded-sm appearance-none cursor-pointer accent-pine focus:outline-none"
                        />
                        <span className="text-[11px] font-mono text-ink-faint min-w-[65px] text-right tabular-nums shrink-0">
                          {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-md text-ink-faint hover:text-ink hover:bg-paper shrink-0 cursor-pointer flex items-center justify-center"
                        onClick={handleStopAudio}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                  {nextQuestion.field_labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {nextQuestion.field_labels.map((label: string) => (
                        <Badge key={label} variant="outline" className="font-mono text-[11px] font-medium border-line-strong text-ink-soft bg-transparent uppercase tracking-[0.08em] rounded-md">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="p-3 bg-paper rounded-md border border-line">
                    <p className="text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.2em] mb-1">{t('strategist_thinking')}</p>
                    <p className="text-[11px] text-ink-soft italic leading-relaxed">{nextQuestion.reason}</p>
                  </div>
                </motion.div>
              ) : isConversationComplete ? (
                unreviewedProposedCount > 0 ? (
                  <div className="bg-marigold-soft/60 border border-marigold/30 p-4 rounded-md">
                    <div className="flex items-center gap-2 mb-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-marigold" />
                      <p className="text-[13px] font-semibold text-marigold leading-tight">
                        {t('review_in_progress', { defaultValue: 'Review in Progress' })}
                      </p>
                    </div>
                    <p className="text-[11px] text-marigold/80 font-medium leading-relaxed">
                      {t('review_in_progress_side_desc', { defaultValue: `Please approve or reject all proposed fields. ${unreviewedProposedCount} fields remaining.` })}
                    </p>
                  </div>
                ) : localRejectedFields.size > 0 ? (
                  <div className="bg-inkblue-soft/60 border border-inkblue/25 p-4 rounded-md space-y-3">
                    <p className="text-[13px] font-semibold text-inkblue leading-tight">
                      {t('rejections_pending', { defaultValue: 'Review Completed with Rejections' })}
                    </p>
                    <p className="text-[11px] text-inkblue/80 font-medium leading-relaxed">
                      {t('rejections_pending_desc', { defaultValue: 'You have rejected some fields. Start the intake chat again to clarify these details.' })}
                    </p>
                    <Button
                      size="sm"
                      className="w-full bg-pine hover:bg-pine-deep text-primary-foreground font-semibold uppercase tracking-[0.16em] text-[11px] rounded-md h-8 shadow-sm cursor-pointer mt-2"
                      onClick={() => bulkRejectMutation.mutate(Array.from(localRejectedFields))}
                      disabled={bulkRejectMutation.isPending}
                    >
                      {bulkRejectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Zap className="w-3 h-3 mr-1.5" />}
                      {t('start_qa_for_rejections', { count: localRejectedFields.size, defaultValue: `Start QA (${localRejectedFields.size})` })}
                    </Button>
                  </div>
                ) : (
                  <div className="bg-leaf-soft/60 border border-leaf/25 p-4 rounded-md">
                    <p className="text-[13px] font-semibold text-leaf mb-1 leading-tight">{completionMessage}</p>
                    <p className="text-[11px] text-leaf/80 font-medium">{t('auto_extraction_complete')}</p>
                      {hiddenConditionalFieldCount > 0 && (
                      <p className="text-[11px] text-leaf/60 mt-3 font-mono font-medium uppercase tracking-[0.14em] italic">
                        {t(hiddenConditionalFieldCount === 1 ? 'conditional_paths_skipped' : 'conditional_paths_skipped_plural', { count: hiddenConditionalFieldCount })}
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-10 opacity-60">
                  <Clock className="w-10 h-10 text-line-strong mb-2" />
                  <p className="text-[11px] font-mono font-medium uppercase tracking-[0.2em] text-ink-faint">{t('processing_insights')}</p>
                </div>
              )}
            </div>

            <div className="pt-2">
              <div className="relative">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t('add_conversation_details')}
                  className="w-full bg-paper border border-line rounded-md p-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-pine/25 resize-none h-16 text-ink placeholder:text-ink-faint"
                />
                <Button
                  size="icon"
                  className="absolute bottom-3 right-3 h-9 w-9 bg-pine hover:bg-pine-deep text-primary-foreground rounded-md shadow-sm cursor-pointer"
                  disabled={!chatInput || submitTurnMutation.isPending}
                  onClick={() => submitTurnMutation.mutate(chatInput)}
                >
                  {submitTurnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {submitTurnMutation.isPending && (
                <p role="status" className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  {t('generating_response')}
                </p>
              )}
              {submitTurnMutation.isError && (
                <p role="alert" className="mt-2 text-xs text-terracotta">{t('message_send_error')}</p>
              )}
            </div>
          </div>

          <div className="space-y-4 px-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.2em]">{t('required_artifacts')}</h2>
              {artifacts && artifacts.length > 0 && <span className="text-[11px] font-mono font-medium text-pine bg-pine-soft px-1.5 py-0.5 rounded leading-none">{artifacts.length}</span>}
            </div>
            <div className="space-y-2.5">
              {artifacts && artifacts.length > 0 ? (
                artifacts.map((art) => (
                  <div key={art.artifact_id} className="flex items-center justify-between p-3 bg-card-warm border border-line rounded-md shadow-sm hover:border-line-strong transition-colors">
                    <div className="flex items-center space-x-3 truncate">
                      <div className="p-2 bg-pine-soft rounded-md">
                        <FileText className="w-4 h-4 text-pine" />
                      </div>
                      <span className="text-[11px] font-mono font-medium text-ink uppercase tracking-[0.08em] truncate">{art.artifact_type}</span>
                    </div>
                    {art.status === 'generated' ? (
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-ink-faint hover:text-pine hover:bg-pine-soft rounded-md cursor-pointer">
                        <a href={getDownloadUrl(caseId!, art.artifact_id)} target="_blank" rel="noreferrer">
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    ) : (
                      <div className="h-2 w-2 bg-inkblue rounded-full mr-3" />
                    )}
                  </div>
                ))
              ) : (
                <div className="py-8 text-center bg-card-warm border border-dashed border-line-strong rounded-lg">
                  <p className="text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.2em]">{t('no_documents_yet')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
