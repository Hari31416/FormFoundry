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
      <DialogContent className="max-w-xl sm:max-w-2xl bg-white border border-slate-200 p-6 rounded-3xl">
        <div className="space-y-6">
          <DialogHeader>
            <div className="flex justify-between items-start mr-6">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-indigo-655 uppercase tracking-widest block text-indigo-600">
                  {template.domain}
                </span>
                <DialogTitle className="text-2xl font-black text-slate-900 leading-tight">
                  {t('template_' + template.template_id + '_name', { defaultValue: template.name })}
                </DialogTitle>
              </div>
              <Badge variant="outline" className="text-[10px] font-black uppercase text-indigo-500 bg-indigo-50/20 border-indigo-150 px-2 py-0.5">
                Version {template.template_version}
              </Badge>
            </div>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed italic pt-2">
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
                <div key={group.group_id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                  <div>
                    <span className="font-extrabold text-sm text-slate-800 block">{group.label}</span>
                    {group.description && <span className="text-[10px] text-slate-400 font-medium block">{group.description}</span>}
                  </div>

                  <div className="divide-y divide-slate-200/60 space-y-2 pt-2 border-t border-slate-200/50">
                    {groupFields.map((field) => (
                      <div key={field.path} className="pt-2 flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-bold text-slate-700">{field.label}</span>
                            <Badge variant="outline" className="text-[8px] uppercase font-bold text-slate-400 border-slate-200 bg-white">
                              {field.type}
                            </Badge>
                            {field.required && (
                              <Badge className="text-[8px] uppercase font-black bg-red-50 text-red-500 border border-red-100/50 px-1 py-0 leading-none">
                                Required
                              </Badge>
                            )}
                            {field.repeated && (
                              <Badge className="text-[8px] uppercase font-black bg-purple-50 text-purple-500 border border-purple-100/50 px-1 py-0 leading-none">
                                List
                              </Badge>
                            )}
                          </div>
                          <code className="text-[10px] text-slate-450 font-mono block text-slate-500">{field.path}</code>
                          <span className="text-[10px] text-slate-400 block pt-1">Prompt: "{field.default_question}"</span>
                        </div>
                        {field.help_text && (
                          <span className="text-[10px] text-slate-400 italic bg-white border border-slate-150 px-2 py-1 rounded-lg max-w-[200px]">
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
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                <div>
                  <span className="font-extrabold text-sm text-slate-800 block">General / Other Fields</span>
                  <span className="text-[10px] text-slate-400 font-medium block">Uncategorized schema fields</span>
                </div>

                <div className="divide-y divide-slate-200/60 space-y-2 pt-2 border-t border-slate-200/50">
                  {unassignedFields.map((field) => (
                    <div key={field.path} className="pt-2 flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold text-slate-700">{field.label}</span>
                          <Badge variant="outline" className="text-[8px] uppercase font-bold text-slate-400 border-slate-200 bg-white">
                            {field.type}
                          </Badge>
                          {field.required && (
                            <Badge className="text-[8px] uppercase font-black bg-red-50 text-red-500 border border-red-100/50 px-1 py-0 leading-none">
                              Required
                            </Badge>
                          )}
                          {field.repeated && (
                            <Badge className="text-[8px] uppercase font-black bg-purple-50 text-purple-500 border border-purple-100/50 px-1 py-0 leading-none">
                              List
                            </Badge>
                          )}
                        </div>
                        <code className="text-[10px] text-slate-450 font-mono block text-slate-500">{field.path}</code>
                        <span className="text-[10px] text-slate-400 block pt-1">Prompt: "{field.default_question}"</span>
                      </div>
                      {field.help_text && (
                        <span className="text-[10px] text-slate-400 italic bg-white border border-slate-150 px-2 py-1 rounded-lg max-w-[200px]">
                          {field.help_text}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex gap-2">
            <Button variant="outline" className="h-11 rounded-xl font-bold border-slate-200" onClick={onClose}>
              Close Outline
            </Button>
            <Button
              className="h-11 bg-slate-900 hover:bg-indigo-600 font-bold rounded-xl shadow-lg cursor-pointer text-white"
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
