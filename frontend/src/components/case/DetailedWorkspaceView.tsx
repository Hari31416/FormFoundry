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
  Download
} from 'lucide-react'

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
  caseId
}: DetailedWorkspaceViewProps) {
  return (
    <>
      <section className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full min-h-0 flex flex-col">
          <div className="px-8 bg-slate-50/50 border-b border-slate-200/50 flex items-center justify-between h-12">
            <TabsList className="bg-transparent border-none p-0 h-full space-x-8">
              <TabsTrigger value="review" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none h-full px-0 font-bold text-[10px] uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">
                Field Verification
              </TabsTrigger>
              <TabsTrigger value="evidence" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none h-full px-0 font-bold text-[10px] uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">
                Raw Evidence
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="max-w-4xl mx-auto p-8">
              <TabsContent value="review" className="m-0 space-y-12 pb-20">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-600 rounded-xl">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Global Verification</h3>
                      <p className="text-[10px] text-slate-400 font-bold">Review and finalize all proposed data points.</p>
                    </div>
                  </div>
                  {Array.from(activeFieldPaths).some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200 text-blue-600 font-black uppercase tracking-widest text-[10px] rounded-xl h-9 px-4 transition-all shadow-sm"
                      onClick={() => {
                        const proposedPaths = Array.from(activeFieldPaths).filter(p => fieldStatesByPath.get(p)?.status === 'proposed')
                        bulkConfirmMutation.mutate(proposedPaths)
                      }}
                      disabled={bulkConfirmMutation.isPending}
                    >
                      {bulkConfirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                      Confirm All Fields
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
                      <div className="flex items-center justify-between border-l-2 border-blue-600 pl-4 py-1">
                        <div className="flex flex-col">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">{group.label}</h3>
                          <p className="text-[11px] text-slate-400 font-medium">{group.description}</p>
                        </div>
                        {activeGroupPaths.some(p => fieldStatesByPath.get(p)?.status === 'proposed') && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-blue-600 hover:bg-blue-50 font-black uppercase tracking-widest text-[9px] rounded-lg px-2 h-7"
                            onClick={() => {
                              const groupProposed = activeGroupPaths.filter(p => fieldStatesByPath.get(p)?.status === 'proposed')
                              bulkConfirmMutation.mutate(groupProposed)
                            }}
                            disabled={bulkConfirmMutation.isPending}
                          >
                            {bulkConfirmMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin mr-1.5" /> : <Check className="w-3 h-3 mr-1.5" />}
                            Confirm Section
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
                              onReject={(p) => rejectFieldMutation.mutate(p)}
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
                    <Card key={ev.evidence_id} className="border-slate-200/60 shadow-sm overflow-hidden bg-white hover:border-blue-200 transition-colors group">
                      <CardHeader className="p-4 bg-slate-50/50 border-b border-slate-100 flex-row items-center justify-between space-y-0">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="p-1 px-1.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black uppercase tracking-tighter">
                            {ev.source_type}
                          </div>
                          {ev.source_subtype && (
                            <span className="max-w-[220px] truncate text-[10px] font-bold text-slate-500">
                              {ev.source_subtype}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{new Date(ev.created_at).toLocaleString()}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5">
                        <p className="text-[13px] text-slate-600 leading-relaxed font-medium italic">
                          "
                          {ev.raw_text || ev.parsed_payload?.extracted_text || 'Extraction pending or no text detected yet.'}
                          "
                        </p>
                        {typeof ev.parsed_payload?.page_count === 'number' && (
                          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {ev.parsed_payload.page_count} PDF page{ev.parsed_payload.page_count === 1 ? '' : 's'}
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
                          className="h-24 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-500 transition-all bg-white"
                        />
                      }
                    >
                      <Plus className="w-5 h-5 mb-1.5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Inject New Evidence</span>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                      <div className="p-8">
                        <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-blue-50 rounded-xl">
                            <Plus className="w-5 h-5 text-blue-600" />
                          </div>
                          <h3 className="text-xl font-black text-slate-900 tracking-tight">New Intake Evidence</h3>
                        </div>
                        <textarea
                          id="evidence-text"
                          placeholder="Paste notes, transcripts, or complaint details here..."
                          className="w-full h-48 p-5 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none resize-none text-slate-700 placeholder:text-slate-400 transition-all"
                        />
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">Upload image or PDF</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                Vision OCR will read the file and extract key details. PDFs are limited to 10 pages.
                              </p>
                            </div>
                          </div>
                          <input
                            id="evidence-file"
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-blue-600"
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
                            <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-blue-600">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Uploading and running OCR...
                            </div>
                          )}
                          {uploadError && (
                            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                              {uploadError}
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end space-x-3 mt-8">
                          <Button
                            variant="ghost"
                            className="rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                            onClick={() => {
                              setUploadError(null)
                              setIsEvidenceModalOpen(false)
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="bg-slate-900 hover:bg-blue-600 text-white rounded-xl font-bold px-6 shadow-xl shadow-slate-900/10"
                            onClick={() => {
                              const el = document.getElementById('evidence-text') as HTMLTextAreaElement
                              if (el?.value) {
                                addTextMutation.mutate(el.value)
                              }
                            }}
                            disabled={addTextMutation.isPending || uploadFileMutation.isPending}
                          >
                            {addTextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Ingestion'}
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

      <section className="w-full lg:w-[500px] border-l border-slate-200/50 bg-slate-50/30 flex flex-col shrink-0">
        <div className="flex-1 min-h-0 flex flex-col p-6 space-y-8 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-1 px-1.5 bg-blue-600 rounded text-white font-black text-[9px] uppercase tracking-widest">
                AI
              </div>
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Intake Intelligence</h2>
            </div>

            <div className="space-y-4 min-h-[120px]">
              {nextQuestion ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[15px] font-bold text-slate-900 leading-snug flex-1">{nextQuestion.question}</p>
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
                  {nextQuestion.field_labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {nextQuestion.field_labels.map((label: string) => (
                        <Badge key={label} variant="outline" className="text-[9px] font-black border-blue-100 text-blue-600 bg-blue-50/30 uppercase tracking-tighter">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Strategist Thinking</p>
                    <p className="text-[11px] text-slate-500 italic leading-relaxed">{nextQuestion.reason}</p>
                  </div>
                </motion.div>
              ) : isConversationComplete ? (
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl">
                  <p className="text-[13px] font-bold text-emerald-900 mb-1 leading-tight">{completionMessage}</p>
                  <p className="text-[11px] text-emerald-600/70 font-medium">Auto-extraction logic has satisfied the schema requirements.</p>
                  {hiddenConditionalFieldCount > 0 && (
                    <p className="text-[10px] text-emerald-600/50 mt-3 font-bold uppercase tracking-tighter italic">
                      {hiddenConditionalFieldCount} conditional path{hiddenConditionalFieldCount > 1 ? 's' : ''} skipped
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 opacity-40">
                  <Clock className="w-10 h-10 text-slate-200 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Processing Insights...</p>
                </div>
              )}
            </div>

            <div className="pt-2">
              <div className="relative">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Add conversation details..."
                  className="w-full bg-slate-50/80 border-none rounded-2xl p-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 resize-none h-28 text-slate-800 placeholder:text-slate-400"
                />
                <Button
                  size="icon"
                  className="absolute bottom-3 right-3 h-8 w-8 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20"
                  disabled={!chatInput || submitTurnMutation.isPending}
                  onClick={() => submitTurnMutation.mutate(chatInput)}
                >
                  {submitTurnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Required Artifacts</h2>
              {artifacts && artifacts.length > 0 && <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded leading-none">{artifacts.length}</span>}
            </div>
            <div className="space-y-2.5">
              {artifacts && artifacts.length > 0 ? (
                artifacts.map((art) => (
                  <div key={art.artifact_id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-blue-100 transition-colors">
                    <div className="flex items-center space-x-3 truncate">
                      <div className="p-2 bg-blue-50 rounded-xl">
                        <FileText className="w-4 h-4 text-blue-500" />
                      </div>
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-tighter truncate">{art.artifact_type}</span>
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
                ))
              ) : (
                <div className="py-8 text-center bg-white border border-dashed border-slate-200 rounded-3xl">
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No Documents Yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
