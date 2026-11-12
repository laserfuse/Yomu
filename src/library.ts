import type { ReadingPosition } from './reading-position'

export type BookFormat = 'PDF' | 'CBZ' | 'EPUB'
export type CollectionKind = 'Manga' | 'Manhwa'
export type CollectionStatus = 'to-read' | 'reading' | 'paused' | 'completed'
export type ChapterLanguage = 'fr' | 'en'

export interface LibraryCollection {
  id: string
  title: string
  cover: Blob | null
  coverPath: string | null
  folderName: string
  kind: CollectionKind
  status: CollectionStatus
  createdAt: number
}

export interface LibraryBook {
  id: string
  collectionId: string
  title: string
  series: string
  chapter: string
  language: ChapterLanguage | null
  format: BookFormat
  fileName: string
  relativePath: string
  file: Blob
  size: number
  addedAt: number
  lastOpenedAt: number | null
  progress: number
  readingPosition?: ReadingPosition
}

export type StoredBook = Omit<LibraryBook, 'file'>
export type StoredCollection = Omit<LibraryCollection, 'cover'>

export function getChapterNumber(chapter: string): number | null {
  const match = chapter.match(/(?:chapter|chapitre|ch\.?|episode|ep\.?|tome|volume|vol\.?)\s*[-_#.]?\s*(\d+(?:[.,]\d+)?)/i)
    ?? chapter.match(/^\s*(\d+(?:[.,]\d+)?)(?:\s|$)/)
  if (!match) return null
  const number = Number(match[1].replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

export function compareChapters(a: LibraryBook, b: LibraryBook): number {
  const aNumber = getChapterNumber(a.chapter || a.title)
  const bNumber = getChapterNumber(b.chapter || b.title)
  if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber - bNumber
  if (aNumber !== null && bNumber === null) return -1
  if (aNumber === null && bNumber !== null) return 1
  return (a.chapter || a.title).localeCompare(b.chapter || b.title, 'fr', { numeric: true, sensitivity: 'base' })
}
