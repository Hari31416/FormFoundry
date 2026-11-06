import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Trash2, Search, ChevronLeft, ChevronRight, Inbox, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TemplateDefinition, CaseFile } from '@/lib/api'

interface TemplateCasesDialogProps {
  template: TemplateDefinition | null
  isOpen: boolean
  onClose: () => void
  cases: CaseFile[]
  onDeleteCase: (caseId: string) => void
  t: (key: string, options?: any) => string
}

export const TemplateCasesDialog: React.FC<TemplateCasesDialogProps> = ({
  template,
  isOpen,
  onClose,
  cases,
  onDeleteCase,
  t
}) => {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [currentPage, setCurrentPage] = React.useState(1)
  const pageSize = 5

  // Reset page when search or template changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, template])

  if (!template) return null

  // Filter cases
  const filteredCases = cases.filter((c) => {
    const subject = (c.metadata?.subject_name || '').toLowerCase()
    const caseId = c.case_id.toLowerCase()
    const query = searchQuery.toLowerCase()
    return subject.includes(query) || caseId.includes(query)
  })

  // Paginated cases
  const totalCases = filteredCases.length
  const totalPages = Math.ceil(totalCases / pageSize) || 1
  const startIndex = (currentPage - 1) * pageSize
  const paginatedCases = filteredCases.slice(startIndex, startIndex + pageSize)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl sm:max-w-2xl bg-card-warm border border-line p-6 rounded-lg">
        <div className="space-y-6">
          <DialogHeader>
            <div className="flex justify-between items-start mr-6">
              <div className="space-y-1">
                <span className="font-mono text-[11px] font-semibold text-pine uppercase tracking-[0.2em] block">
                  {template.domain} Cases
                </span>
                <DialogTitle className="font-serif text-2xl font-semibold text-ink leading-tight">
                  {t('template_' + template.template_id + '_name', { defaultValue: template.name })}
                </DialogTitle>
              </div>
              <Badge variant="outline" className="font-mono text-[11px] font-semibold uppercase text-ink-faint bg-paper border-line px-2 py-0.5">
                {cases.length} Total Cases
              </Badge>
            </div>
            <DialogDescription className="text-xs text-ink-soft leading-relaxed pt-1">
              Browse, search, open, or delete existing cases started under this template.
            </DialogDescription>
          </DialogHeader>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by case ID or subject name..."
              className="pl-10 h-11 bg-paper border-line rounded-md focus-visible:ring-pine/25"
            />
          </div>

          {/* Cases List */}
          <div className="space-y-2 min-h-[300px]">
            {paginatedCases.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {paginatedCases.map((c) => (
                  <div
                    key={c.case_id}
                    className="py-3.5 transition-colors flex items-center justify-between gap-4 group/case hover:bg-paper"
                  >
                    <div className="space-y-1 min-w-0 flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-ink truncate max-w-[200px]">
                          {c.metadata?.subject_name || "Untitled Case"}
                        </span>
                        <Badge variant="outline" className="font-mono text-[11px] font-semibold uppercase text-ink-faint border-line bg-card-warm">
                          {t('case_status_' + c.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-ink-faint font-medium">
                        <span className="font-mono text-[11px] bg-paper border border-line px-1.5 py-0.5 rounded text-ink-soft">
                          ID: #{c.case_id.slice(-8)}
                        </span>
                        <span className="flex items-center gap-1 text-ink-faint">
                          <Clock className="w-3 h-3 text-ink-faint" />
                          {formatDistanceToNow(new Date(c.created_at))} ago
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link to={`/cases/${c.case_id}`} onClick={onClose}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 border-line-strong hover:border-pine hover:bg-pine-soft text-ink-soft hover:text-pine-deep font-semibold text-xs rounded-md transition-colors"
                        >
                          Open Workspace <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onDeleteCase(c.case_id)}
                        className="h-9 w-9 border-transparent bg-transparent text-ink-faint hover:text-terracotta hover:bg-terracotta-soft rounded-md transition-colors cursor-pointer"
                        title="Delete Case"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 min-h-[300px]">
                <div className="p-4 border border-dashed border-line rounded-lg text-ink-faint">
                  <Inbox className="w-8 h-8 text-ink-faint" />
                </div>
                <div className="space-y-1">
                  <span className="font-serif font-semibold text-ink text-sm block">No Cases Found</span>
                  <span className="text-xs text-ink-faint block max-w-[280px]">
                    {searchQuery ? "No cases match your active search terms." : "No cases have been created for this template yet."}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="pt-4 border-t border-line flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                Page {currentPage} of {totalPages} ({totalCases} cases)
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md border-line text-ink-soft font-semibold text-xs"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-0.5" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md border-line text-ink-soft font-semibold text-xs"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next <ChevronRight className="w-4 h-4 ml-0.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
