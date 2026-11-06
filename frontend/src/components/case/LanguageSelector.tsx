import React from 'react'
import { Globe, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export interface LanguageOption {
  code: string
  name: string
  nativeName: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  // Future languages (e.g., Marathi, Tamil, Telugu, etc.) can be added here easily!
]

interface LanguageSelectorProps {
  onLanguageChange?: (code: string) => void
  className?: string
}

export function LanguageSelector({
  onLanguageChange,
  className
}: LanguageSelectorProps) {
  const { i18n, t } = useTranslation()

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) || SUPPORTED_LANGUAGES[0]

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code)
    if (onLanguageChange) {
      onLanguageChange(code)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "group h-8 border-line bg-card-warm hover:border-line-strong hover:bg-paper rounded-md px-2.5 font-medium text-xs text-ink-soft flex items-center gap-2 cursor-pointer shadow-none transition-colors",
              className
            )}
          />
        }
      >
        <Globe className="w-3.5 h-3.5 text-ink-faint group-hover:text-ink-soft" />
        <span>{currentLang.nativeName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44 rounded-md p-1 shadow-lg border border-line bg-card-warm z-50">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint px-2.5 py-1.5 font-medium">
            {t('select_language', { defaultValue: 'Select Language' })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-line my-1" />
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === i18n.language
            return (
              <DropdownMenuItem
                key={lang.code}
                className="rounded-md text-xs font-medium px-2.5 py-2 text-ink-soft focus:bg-pine-soft focus:text-pine-deep flex items-center justify-between cursor-pointer"
                onClick={() => handleSelect(lang.code)}
              >
                <span>{lang.nativeName}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-pine" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
