import React from 'react'
import { Globe, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
            className="h-8 border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl px-3 font-bold text-xs text-slate-700 flex items-center gap-2 cursor-pointer shadow-sm"
          />
        }
      >
        <Globe className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
        <span>{currentLang.nativeName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40 rounded-2xl p-1 shadow-xl border border-slate-100 bg-white z-50">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[9px] uppercase tracking-widest text-slate-400 px-2.5 py-1.5 font-black">
            {t('select_language', { defaultValue: 'Select Language' })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-100/85 my-1" />
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === i18n.language
            return (
              <DropdownMenuItem
                key={lang.code}
                className="rounded-xl text-xs font-bold px-2.5 py-2 text-slate-700 focus:bg-slate-50 focus:text-blue-600 flex items-center justify-between cursor-pointer"
                onClick={() => handleSelect(lang.code)}
              >
                <span>{lang.nativeName}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
