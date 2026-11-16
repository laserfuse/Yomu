import { useContext } from 'react'
import { UiLanguageContext } from './ui-language-context'

export function useUiLanguage() {
  const context = useContext(UiLanguageContext)
  if (!context) throw new Error('useUiLanguage doit être utilisé dans UiLanguageProvider.')
  return context
}
