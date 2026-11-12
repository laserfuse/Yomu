export type ReadingPosition = { page: number } | { cfi: string }

export function validReadingPosition(value: unknown, format: unknown): value is ReadingPosition | undefined {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  if (format === 'PDF' || format === 'CBZ') {
    return 'page' in value && typeof value.page === 'number' && Number.isSafeInteger(value.page) && value.page > 0
  }
  return format === 'EPUB' && 'cfi' in value && typeof value.cfi === 'string' && value.cfi.length > 0
}
