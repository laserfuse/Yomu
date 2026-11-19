export interface ReaderShortcuts {
  mangaPreviousPage: string
  mangaNextPage: string
  manhwaPreviousPage: string
  manhwaNextPage: string
  closeReader: string
}

export type ReaderShortcutAction = keyof ReaderShortcuts

export const DEFAULT_READER_SHORTCUTS: ReaderShortcuts = {
  mangaPreviousPage: 'ArrowLeft',
  mangaNextPage: 'ArrowRight',
  manhwaPreviousPage: 'ArrowUp',
  manhwaNextPage: 'ArrowDown',
  closeReader: 'Escape',
}

export function isBindableReaderShortcut(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32) return false
  if (value.length === 1) return !/\s/.test(value) && value.charCodeAt(0) >= 32
  return /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Escape|Home|End|PageUp|PageDown|Insert|Delete|Backspace|F([1-9]|1[0-2]))$/.test(value)
}

export function isReaderShortcuts(value: unknown): value is ReaderShortcuts {
  if (typeof value !== 'object' || value === null) return false
  const shortcuts = value as Record<string, unknown>
  const actions = Object.keys(DEFAULT_READER_SHORTCUTS) as ReaderShortcutAction[]
  const keys = actions.map((action) => shortcuts[action])
  return keys.every(isBindableReaderShortcut)
    && new Set(keys).size === keys.length
}
