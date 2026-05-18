import React from 'react'
import { Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

interface DropdownMenuComponentProps {
  options: string[]
  onSelect: (option: string) => void
  isLoading: boolean
}

export function DropdownMenuComponent({
  options,
  onSelect,
  isLoading
}: DropdownMenuComponentProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm"
          />
        }
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
        Generate Artifact
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 rounded-xl p-1 shadow-xl border-slate-100 bg-white">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 py-1.5">
            Select Format
          </DropdownMenuLabel>
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
