import React from 'react'
import { ArrowRight, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TemplateDefinition } from '@/lib/api'

interface SchemaVisualizerDialogProps {
  template: TemplateDefinition | null
  isOpen: boolean
  onClose: () => void
  onLaunchCase: (templateId: string, version: number) => void
  t: (key: string, options?: any) => string
}

export const SchemaVisualizerDialog: React.FC<SchemaVisualizerDialogProps> = ({
  template,
  isOpen,
  onClose,
  onLaunchCase,
  t,
}) => {
  if (!template) return null

  // Find all fields that are in the schema but not assigned to any group
  const groupedPaths = new Set(template.field_groups?.flatMap((g) => g.field_paths) || [])
  const unassignedFields = template.schema.filter((f) => !groupedPaths.has(f.path))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl sm:max-w-2xl bg-card-warm border border-line p-6 rounded-lg">
        <div className="space-y-6">
          <DialogHeader>
            <div className="flex justify-between items-start mr-6">
              <div className="space-y-1">
                <span className="font-mono text-[11px] font-semibold text-pine uppercase tracking-[0.2em] block">
                  {template.domain}
                </span>
                <DialogTitle className="font-serif text-2xl font-semibold text-ink leading-tight">
                  {t('template_' + template.template_id + '_name', { defaultValue: template.name })}
                </DialogTitle>
              </div>
              <Badge variant="outline" className="font-mono text-[11px] font-semibold uppercase text-ink-faint bg-paper border-line px-2 py-0.5">
                Version {template.template_version}
              </Badge>
            </div>
            <DialogDescription className="text-xs text-ink-soft leading-relaxed italic pt-2">
              "{t('template_' + template.template_id + '_desc', { defaultValue: template.description })}"
            </DialogDescription>
          </DialogHeader>

          {/* Schema Outline */}
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
            {template.field_groups?.map((group) => {
              // Find fields assigned to this group
              const groupFields = template.schema.filter((f) => group.field_paths.includes(f.path))

              if (groupFields.length === 0) return null

              return (
                <div key={group.group_id} className="p-4 rounded-md bg-paper border border-line space-y-3">
                  <div>
                    <span className="font-serif font-semibold text-sm text-ink block">{group.label}</span>
                    {group.description && <span className="text-[11px] text-ink-faint font-medium block">{group.description}</span>}
                  </div>

                  <div className="divide-y divide-line space-y-2 pt-2 border-t border-line">
                    {groupFields.map((field) => (
                      <div key={field.path} className="pt-2 flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-semibold text-ink">{field.label}</span>
                            <Badge variant="outline" className="font-mono text-[11px] uppercase font-semibold text-ink-faint border-line bg-card-warm">
                              {field.type}
                            </Badge>
                            {field.required && (
                              <Badge className="font-mono text-[11px] uppercase font-semibold bg-terracotta-soft text-terracotta border border-terracotta/20 px-1 py-0 leading-none">
                                Required
                              </Badge>
                            )}
                            {field.repeated && (
                              <Badge className="font-mono text-[11px] uppercase font-semibold bg-marigold-soft text-marigold border border-marigold/20 px-1 py-0 leading-none">
                                List
                              </Badge>
                            )}
                          </div>
                          <code className="text-[11px] font-mono text-ink-soft block">{field.path}</code>
                          <span className="text-[11px] text-ink-faint block pt-1">Prompt: "{field.default_question}"</span>
                        </div>
                        {field.help_text && (
                          <span className="text-[11px] text-ink-faint italic bg-paper border border-line px-2 py-1 rounded-md max-w-[200px]">
                            {field.help_text}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {unassignedFields.length > 0 && (
              <div className="p-4 rounded-md bg-paper border border-line space-y-3">
                <div>
                  <span className="font-serif font-semibold text-sm text-ink block">General / Other Fields</span>
                  <span className="text-[11px] text-ink-faint font-medium block">Uncategorized schema fields</span>
                </div>

                <div className="divide-y divide-line space-y-2 pt-2 border-t border-line">
                  {unassignedFields.map((field) => (
                    <div key={field.path} className="pt-2 flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-ink">{field.label}</span>
                          <Badge variant="outline" className="font-mono text-[11px] uppercase font-semibold text-ink-faint border-line bg-card-warm">
                            {field.type}
                          </Badge>
                          {field.required && (
                            <Badge className="font-mono text-[11px] uppercase font-semibold bg-terracotta-soft text-terracotta border border-terracotta/20 px-1 py-0 leading-none">
                              Required
                            </Badge>
                          )}
                          {field.repeated && (
                            <Badge className="font-mono text-[11px] uppercase font-semibold bg-marigold-soft text-marigold border border-marigold/20 px-1 py-0 leading-none">
                              List
                            </Badge>
                          )}
                        </div>
                        <code className="text-[11px] font-mono text-ink-soft block">{field.path}</code>
                        <span className="text-[11px] text-ink-faint block pt-1">Prompt: "{field.default_question}"</span>
                      </div>
                      {field.help_text && (
                        <span className="text-[11px] text-ink-faint italic bg-paper border border-line px-2 py-1 rounded-md max-w-[200px]">
                          {field.help_text}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-line flex gap-2">
            <Button variant="outline" className="h-11 rounded-md font-semibold border-line-strong text-ink-soft hover:bg-paper" onClick={onClose}>
              Close Outline
            </Button>
            <Button
              className="h-11 bg-pine hover:bg-pine-deep font-semibold rounded-md shadow-none cursor-pointer text-primary-foreground"
              onClick={() => onLaunchCase(template.template_id, template.template_version)}
            >
              Launch Case Workspace <ArrowRight className="ml-1.5 w-4 h-4" />
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
