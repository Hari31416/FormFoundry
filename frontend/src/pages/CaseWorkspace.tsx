import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Check,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Zap,
  Quote,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  CaseDetail,
  FieldState,
  FieldStatus,
  TemplateField,
  addTextEvidence,
  approveCase,
  confirmField,
  generateArtifact,
  getArtifacts,
  getCase,
  getDownloadUrl,
  getEvidence,
  getNextQuestion,
  getValidationIssues,
  submitTurn,
  Evidence,
} from '@/lib/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  const [activeTab, setActiveTab] = useState('review')
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')

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

  const { data: nextQuestion } = useQuery({
    queryKey: ['next-question', caseId],
    queryFn: () => getNextQuestion(caseId!),
    enabled: !!caseId,
    refetchInterval: () => {
      const status = caseDetail?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const submitTurnMutation = useMutation({
    mutationFn: (msg: string) => submitTurn(caseId!, msg),
    onSuccess: () => {
      setChatInput('')
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
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
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
      setIsEvidenceModalOpen(false)
      const el = document.getElementById('evidence-text') as HTMLTextAreaElement
      if (el) el.value = ''
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
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
    },
  })

  const bulkConfirmMutation = useMutation({
    mutationFn: async (fieldPaths: string[]) => {
      await Promise.all(fieldPaths.map((path) => confirmField(caseId!, path)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['validation', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
    },
  })

  if (isLoadingCase) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

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
                          <div className="flex items-center space-x-2">
                            <div className="p-1 px-1.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black uppercase tracking-tighter">
                              {ev.source_type}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">{new Date(ev.created_at).toLocaleString()}</span>
                          </div>
                        </CardHeader>
                        <CardContent className="p-5">
                          <p className="text-[13px] text-slate-600 leading-relaxed font-medium italic">"{ev.raw_text}"</p>
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
                          <div className="flex justify-end space-x-3 mt-8">
                            <Button variant="ghost" className="rounded-xl font-bold text-slate-500 hover:bg-slate-100" onClick={() => setIsEvidenceModalOpen(false)}>Cancel</Button>
                            <Button
                              className="bg-slate-900 hover:bg-blue-600 text-white rounded-xl font-bold px-6 shadow-xl shadow-slate-900/10"
                              onClick={() => {
                                const el = document.getElementById('evidence-text') as HTMLTextAreaElement
                                if (el?.value) {
                                  addTextMutation.mutate(el.value)
                                }
                              }}
                              disabled={addTextMutation.isPending}
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
                    <p className="text-[15px] font-bold text-slate-900 leading-snug">{nextQuestion.question}</p>
                    {nextQuestion.field_labels.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {nextQuestion.field_labels.map((label) => (
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
      </main>
    </div>
  )
}

function FieldRow({
  field,
  state,
  issues,
  allEvidence,
  onConfirm
}: {
  field: TemplateField
  state: FieldState | undefined
  issues: any[]
  allEvidence: Evidence[]
  onConfirm: (p: string) => void
}) {
  if (!field) return null
  const confidence = state?.confidence ?? 0
  const proposedState = state?.status === 'proposed' ? state : undefined

  // Resolve source evidence
  const sourceEvidence = (state?.source_evidence_ids || [])
    .map((id) => allEvidence.find((ev) => ev.evidence_id === id))
    .filter((ev): ev is Evidence => !!ev && !!ev.raw_text)

  return (
    <div className="group relative flex flex-col space-y-2">
      <Card className={cn(
        "border-slate-200/60 shadow-sm transition-all duration-200 bg-white overflow-hidden rounded-2xl",
        issues.some(i => i.blocking) ? "border-red-200 bg-red-50/10" : "hover:border-blue-200 hover:shadow-md"
      )}>
        <CardContent className="p-0 flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <div className="flex-grow min-w-0 pr-4">
              <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-y-1">
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{field.label}</span>
                {state && getFieldBadge(state.status)}
                {field.required && (
                  <span className="text-[9px] font-bold text-red-500/60 px-1 border border-red-100 rounded leading-none pt-0.5">REQ</span>
                )}
              </div>
              <div className="text-[15px] font-bold text-slate-900 tabular-nums truncate">
                {state?.resolved_value ? String(state.resolved_value) : <span className="text-slate-300 font-medium italic">Awaiting data...</span>}
              </div>

              {confidence > 0 && state?.status !== 'confirmed' && (
                <div className="mt-3 flex items-center space-x-3">
                  <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-1000',
                        confidence > 0.8 ? 'bg-emerald-500' : confidence > 0.5 ? 'bg-blue-500' : 'bg-red-500',
                      )}
                      style={{ width: `${confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{(confidence * 100).toFixed(0)}% Certainty</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {proposedState && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                  onClick={() => onConfirm(proposedState.field_path)}
                >
                  Confirm Match
                </Button>
              )}
              {state?.status === 'confirmed' && (
                <div className="p-1 px-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Source Evidence Provenance */}
          {sourceEvidence.length > 0 && (
            <div className="px-4 pb-4">
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center space-x-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <Quote className="w-2.5 h-2.5" />
                  <span>Source Provenance</span>
                </div>
                {sourceEvidence.map((ev) => (
                  <EvidenceQuote key={ev.evidence_id} ev={ev} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline Issues */}
      {issues.length > 0 && (
        <div className="px-4 space-y-1">
          {issues.map((issue) => (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={issue.issue_id}
              className={cn(
                "flex items-center space-x-2 text-[10px] font-bold p-1 px-2 rounded-lg w-fit",
                issue.blocking ? "bg-red-50 text-red-600 border border-red-100" : "bg-amber-50 text-amber-600 border border-amber-100"
              )}
            >
              <AlertCircle className="w-3 h-3" />
              <span>{issue.message}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function getFieldBadge(status: FieldStatus) {
  switch (status) {
    case 'confirmed':
      return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-200/50 text-[9px] uppercase font-black px-1.5 h-4">Confirmed</Badge>
    case 'proposed':
      return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-blue-200/50 text-[9px] uppercase font-black px-1.5 h-4">Proposed</Badge>
    case 'conflicted':
      return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-200/50 text-[9px] uppercase font-black px-1.5 h-4">Conflicted</Badge>
    case 'missing':
      return <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] uppercase font-black px-1.5 h-4">Missing</Badge>
    default:
      return null
  }
}

function EvidenceQuote({ ev }: { ev: Evidence }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLongText = (ev.raw_text?.length || 0) > 120

  return (
    <div className="relative pl-3 border-l-2 border-slate-100 hover:border-blue-200 transition-colors group/evidence">
      <p className={cn(
        "text-[11px] text-slate-500 italic leading-relaxed transition-all",
        !isExpanded && "line-clamp-2"
      )}>
        “{ev.raw_text}”
      </p>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">
          via {ev.source_type.replace('_', ' ')}
        </div>
        {isLongText && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[9px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest transition-colors"
          >
            {isExpanded ? 'Show Less' : 'Show More'}
          </button>
        )}
      </div>
    </div>
  )
}

function DropdownMenuComponent({ options, onSelect, isLoading }: { options: string[]; onSelect: (t: string) => void; isLoading: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm" />}>
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
        Generate Artifact
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 rounded-xl p-1 shadow-xl border-slate-100">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 py-1.5">Select Format</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-100" />
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt}
              className="rounded-lg text-xs font-bold uppercase tracking-tight text-slate-700 focus:bg-slate-50 focus:text-blue-600 cursor-pointer"
              onClick={() => onSelect(opt)}
            >
              {opt}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
