import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCase,
  getEvidence,
  getValidationIssues,
  getArtifacts,
  getNextQuestion,
  addTextEvidence,
  submitTurn,
  editField,
  confirmField,
  approveCase,
  generateArtifact,
  getDownloadUrl,
  CaseDetail,
  FieldStatus,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  MessageSquare,
  FileText,
  ShieldCheck,
  Zap,
  ChevronRight,
  Download,
  AlertCircle,
  Plus,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('review')
  const [chatInput, setChatInput] = useState('')

  // Queries
  const { data: caseDetail, isLoading: isLoadingCase } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCase(caseId!),
    enabled: !!caseId,
    refetchInterval: (query) => {
      // Poll more frequently if status is 'extracting' or 'generating'
      const status = query.state.data?.status
      return status === 'extracting' || status === 'resolving' || status === 'artifact_generating' ? 3000 : 15000
    },
  })

  const { data: evidence } = useQuery({
    queryKey: ['evidence', caseId],
    queryFn: () => getEvidence(caseId!),
    enabled: !!caseId,
  })

  const { data: validation } = useQuery({
    queryKey: ['validation', caseId],
    queryFn: () => getValidationIssues(caseId!),
    enabled: !!caseId,
  })

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts', caseId],
    queryFn: () => getArtifacts(caseId!),
    enabled: !!caseId,
  })

  const { data: nextQuestion } = useQuery({
    queryKey: ['next-question', caseId],
    queryFn: () => getNextQuestion(caseId!),
    enabled: !!caseId,
  })

  // Mutations
  const submitTurnMutation = useMutation({
    mutationFn: (msg: string) => submitTurn(caseId!, msg),
    onSuccess: () => {
      setChatInput('')
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
      queryClient.invalidateQueries({ queryKey: ['next-question', caseId] })
    },
  })

  const addTextMutation = useMutation({
    mutationFn: (text: string) => addTextEvidence(caseId!, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] })
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
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
    },
  })

  if (isLoadingCase) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-200'
      case 'failed': return 'bg-red-100 text-red-700 border-red-200'
      case 'extracting':
      case 'resolving': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'awaiting_user': return 'bg-amber-100 text-amber-700 border-amber-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  const getFieldBadge = (status: FieldStatus) => {
    switch (status) {
      case 'confirmed': return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-200/50">Confirmed</Badge>
      case 'proposed': return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-blue-200/50">Proposed</Badge>
      case 'conflicted': return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-200/50">Conflicted</Badge>
      case 'missing': return <Badge variant="outline" className="text-slate-400 border-slate-200">Missing</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-200/60 bg-white px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-4">
          <div className="p-1.5 bg-slate-900 rounded-lg cursor-pointer" onClick={() => navigate('/')}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-slate-900">{caseDetail?.template.name}</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-widest">{caseId?.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Badge className={cn('px-3 py-1 font-bold text-[10px] uppercase tracking-wider border', getStatusColor(caseDetail?.status || ''))}>
            {caseDetail?.status.replace('_', ' ')}
          </Badge>

          {caseDetail?.status === 'ready_for_review' && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-sm"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || validation?.some(v => v.blocking)}
            >
              Approve Case
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

      {/* Main Content Area */}
      <main className="flex-grow flex overflow-hidden">
        {/* Left Panel: Conversation/Assistant */}
        <section className="w-[320px] border-r border-slate-200/60 bg-white flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100 flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Assistant</h2>
          </div>

          <ScrollArea className="flex-grow p-4">
            <div className="space-y-4">
              {/* Question from system */}
              {nextQuestion ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl shadow-sm"
                >
                  <p className="text-sm font-semibold text-blue-900 mb-2">{nextQuestion.question}</p>
                  <p className="text-[11px] text-blue-600/80 italic">Context: {nextQuestion.reason}</p>
                </motion.div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-400 font-medium">No pending questions.</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 bg-slate-50/50 border-t border-slate-100">
            <div className="relative">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your response..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none h-20 shadow-inner"
              />
              <Button
                size="icon"
                className="absolute bottom-3 right-3 h-7 w-7 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                disabled={!chatInput || submitTurnMutation.isPending}
                onClick={() => submitTurnMutation.mutate(chatInput)}
              >
                {submitTurnMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        </section>

        {/* Middle Panel: Workspace */}
        <section className="flex-grow flex flex-col bg-slate-50/50 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 bg-white border-b border-slate-100 flex items-center justify-between">
              <TabsList className="bg-transparent border-none p-0 h-12 space-x-6">
                <TabsTrigger value="review" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none h-full px-0 font-bold text-xs uppercase tracking-widest text-slate-500 data-[state=active]:text-slate-900 transition-all">
                  Field Review
                </TabsTrigger>
                <TabsTrigger value="evidence" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none h-full px-0 font-bold text-xs uppercase tracking-widest text-slate-500 data-[state=active]:text-slate-900 transition-all">
                  Source Evidence
                </TabsTrigger>
              </TabsList>

              {validation && validation.length > 0 && (
                <div className="flex items-center space-x-1 text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">{validation.length} Issues</span>
                </div>
              )}
            </div>

            <ScrollArea className="flex-grow p-6">
              <TabsContent value="review" className="m-0 space-y-8">
                {caseDetail?.template.field_groups.map((group) => (
                  <div key={group.group_id}>
                    <div className="mb-4">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{group.label}</h3>
                      <p className="text-xs text-slate-500">{group.description}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {group.field_paths.map((path) => {
                        const fieldState = caseDetail.field_states.find(fs => fs.field_path === path)
                        const templateField = caseDetail.template.schema.find(tf => tf.path === path)
                        return (
                          <FieldRow
                            key={path}
                            field={templateField}
                            state={fieldState}
                            onConfirm={(p) => confirmFieldMutation.mutate(p)}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="evidence" className="m-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {evidence?.map((ev) => (
                    <Card key={ev.evidence_id} className="border-slate-200/60 shadow-sm overflow-hidden bg-white hover:border-slate-300 transition-colors">
                      <CardHeader className="p-4 bg-slate-50/50 border-b border-slate-100 flex-row items-center justify-between space-y-0">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-tight">{ev.source_type}</CardTitle>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">{new Date(ev.created_at).toLocaleDateString()}</span>
                      </CardHeader>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-600 line-clamp-4 leading-relaxed italic">
                          "{ev.raw_text}"
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                  <Dialog>
                    <DialogTrigger render={
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors bg-white/50"
                      />
                    }>
                        <Plus className="w-6 h-6 mb-1" />
                        <span className="text-xs font-bold uppercase tracking-widest">Add Evidence</span>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-white rounded-2xl">
                      <div className="p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Add Text Evidence</h3>
                        <textarea
                          id="evidence-text"
                          placeholder="Paste or type evidence here..."
                          className="w-full h-40 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none resize-none mb-4"
                        />
                        <div className="flex justify-end space-x-3">
                          <Button variant="outline" className="rounded-lg">Cancel</Button>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                            onClick={() => {
                              const el = document.getElementById('evidence-text') as HTMLTextAreaElement
                              if (el?.value) {
                                addTextMutation.mutate(el.value)
                                // Close dialog logic would go here,
                                // usually handled by Controlled Dialog state or close button
                              }
                            }}
                            disabled={addTextMutation.isPending}
                          >
                            {addTextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ingest Evidence'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </section>

        {/* Right Panel: Artifacts & Validation */}
        <section className="w-[280px] border-l border-slate-200/60 bg-white p-4 shrink-0 flex flex-col space-y-6">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Artifacts</h2>
            </div>
            <div className="space-y-3">
              {artifacts && artifacts.length > 0 ? (
                artifacts.map(art => (
                  <Card key={art.artifact_id} className="border-slate-100 bg-slate-50/50">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tighter truncate">
                          {art.artifact_type}
                        </span>
                      </div>
                      {art.status === 'generated' ? (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-blue-600">
                          <a href={getDownloadUrl(caseId!, art.artifact_id)} target="_blank" rel="noreferrer">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-[11px] text-slate-400 text-center py-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  No artifacts generated yet.
                </p>
              )}
            </div>
          </div>

          <div>
             <div className="flex items-center space-x-2 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Validations</h2>
            </div>
            <div className="space-y-2">
              {validation && validation.length > 0 ? (
                validation.map(issue => (
                  <div key={issue.issue_id} className={cn("p-2 rounded-lg border text-[11px] leading-tight",
                    issue.blocking ? "bg-red-50/50 border-red-100 text-red-700" : "bg-amber-50/50 border-amber-100 text-amber-700")}>
                    <div className="font-bold uppercase tracking-tighter mb-1">{issue.field_path}</div>
                    {issue.message}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-4 text-slate-300">
                  <CheckCircle2 className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">No Issues Found</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function FieldRow({ field, state, onConfirm }: { field: any, state: any, onConfirm: (p: string) => void }) {
  if (!field) return null

  return (
    <Card className="border-slate-200/60 shadow-sm hover:border-slate-300 transition-colors bg-white overflow-hidden group">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex-grow">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{field.label}</span>
            {state && getFieldBadge(state.status)}
          </div>
          <div className="text-sm font-medium text-slate-900">
            {state?.resolved_value ? (
              String(state.resolved_value)
            ) : (
              <span className="text-slate-300 italic">Not extracted yet...</span>
            )}
          </div>
          {state?.confidence > 0 && (
            <div className="mt-2 flex items-center space-x-2">
              <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", state.confidence > 0.8 ? "bg-green-500" : state.confidence > 0.5 ? "bg-amber-500" : "bg-red-500")}
                  style={{ width: `${state.confidence * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-400">{(state.confidence * 100).toFixed(0)}% Confidence</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
           {state?.status === 'proposed' && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-green-200 text-green-600 hover:bg-green-50 text-[11px] font-bold uppercase tracking-tight px-3"
              onClick={() => onConfirm(state.field_path)}
            >
              Confirm
            </Button>
           )}
           <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-4 h-4" />
           </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function getFieldBadge(status: string) {
  switch (status) {
    case 'confirmed': return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-200/50 text-[9px] uppercase font-black px-1.5 h-4">Confirmed</Badge>
    case 'proposed': return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-blue-200/50 text-[9px] uppercase font-black px-1.5 h-4">Proposed</Badge>
    case 'conflicted': return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-200/50 text-[9px] uppercase font-black px-1.5 h-4">Conflicted</Badge>
    case 'missing': return <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] uppercase font-black px-1.5 h-4">Missing</Badge>
    default: return null
  }
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function DropdownMenuComponent({ options, onSelect, isLoading }: { options: string[], onSelect: (t: string) => void, isLoading: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm" />
      }>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          Generate Artifact
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 rounded-xl p-1 shadow-xl border-slate-100">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 py-1.5">Select Format</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-100" />
        {options.map(opt => (
          <DropdownMenuItem
            key={opt}
            className="rounded-lg text-xs font-bold uppercase tracking-tight text-slate-700 focus:bg-slate-50 focus:text-blue-600 cursor-pointer"
            onClick={() => onSelect(opt)}
          >
            {opt}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
