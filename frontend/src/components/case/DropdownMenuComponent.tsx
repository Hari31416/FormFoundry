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
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            className="bg-pine text-paper hover:bg-pine-deep font-semibold rounded-md shadow-none cursor-pointer h-9 px-4"
          />
        }
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
        {t('generate_artifact')}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 rounded-md p-1 shadow-lg border border-line bg-card-warm">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint px-2 py-1.5">
            {t('select_format')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-line" />
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt}
              className="rounded-md text-xs font-semibold uppercase tracking-tight text-ink-soft focus:bg-pine-soft focus:text-pine-deep cursor-pointer"
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
