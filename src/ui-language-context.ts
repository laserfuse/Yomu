import { createContext } from 'react'
import type { UiLanguage } from '../electron/ui-language'

export interface UiLanguageContextValue {
  language: UiLanguage
  isLoading: boolean
  loadError: string
  setLanguage: (language: UiLanguage) => Promise<void>
  t: (message: string, values?: Record<string, string | number | null | undefined>) => string
}

export const UiLanguageContext = createContext<UiLanguageContextValue | null>(null)
