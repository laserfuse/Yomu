export type ReadingPosition = { page: number } | { cfi: string }

export function validReadingPosition(value: unknown, format: unknown): value is ReadingPosition | undefined {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  if (format === 'PDF' || format === 'CBZ') {
    if (!('page' in value) || typeof value.page !== 'number' || !Number.isSafeInteger(value.page) || value.page <= 0) return false
    if (!('offset' in value)) return true
    return format === 'PDF' && typeof value.offset === 'number' && Number.isFinite(value.offset) && value.offset >= 0 && value.offset <= 1
  }
  return format === 'EPUB' && 'cfi' in value && typeof value.cfi === 'string' && value.cfi.length > 0
}
