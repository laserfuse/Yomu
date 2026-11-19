import type { ChapterImportResult, ChapterLanguage, CollectionImportResult, LibraryBook, LibraryCollection, StoredBook, StoredCollection } from './library'
import type { LanguageVisibility } from '../electron/language-settings'
import type { UiLanguage } from '../electron/ui-language'
import type { UpdateState } from '../electron/update-types'
import type { ReaderShortcuts } from '../electron/reader-shortcuts'

interface YomuDesktopApi {
  openGitHub(): Promise<void>
  getUpdateState(): Promise<UpdateState>
  setAutomaticUpdates(automatic: boolean): Promise<void>
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  getLanguageVisibility(): Promise<LanguageVisibility>
  setLanguageVisibility(visibility: LanguageVisibility): Promise<void>
  getUiLanguage(): Promise<UiLanguage>
  setUiLanguage(language: UiLanguage): Promise<void>
  getReaderShortcuts(): Promise<ReaderShortcuts>
  setReaderShortcuts(shortcuts: ReaderShortcuts): Promise<void>
  onUpdateState(callback: (state: UpdateState) => void): () => void
  getLibraryRoot(): Promise<string | null>
  chooseLibraryRoot(): Promise<string | null>
  retryLibraryRoot(): Promise<string | null>
  openLibraryRoot(): Promise<void>
  backupLibrary(): Promise<string | null>
  restoreLibraryBackup(): Promise<string | null>
  exportCollection(collectionId: string): Promise<string | null>
  importCollection(): Promise<CollectionImportResult | null>
  loadLibrary(): Promise<{ collections: StoredCollection[]; books: StoredBook[] }>
  getPdfZoom(collectionId: string): Promise<number | null>
  setPdfZoom(collectionId: string, zoom: number | null): Promise<void>
  saveCollection(
    collection: StoredCollection,
    coverBytes: Uint8Array | null,
    coverName: string | null,
    removeCover: boolean,
  ): Promise<StoredCollection>
  deleteCollection(id: string): Promise<void>
  addChapters(collectionId: string, language: ChapterLanguage): Promise<ChapterImportResult>
  addChapterFolder(collectionId: string, language: ChapterLanguage): Promise<ChapterImportResult>
  addDroppedChapters(collectionId: string, language: ChapterLanguage, files: File[]): Promise<ChapterImportResult>
  updateBook(book: StoredBook): Promise<void>
  deleteBook(id: string): Promise<void>
  readAsset(relativePath: string): Promise<Uint8Array>
}

declare global {
  interface Window {
    yomu?: YomuDesktopApi
  }
}

export {}
