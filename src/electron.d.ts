import type { ChapterLanguage, CollectionImportResult, LibraryBook, LibraryCollection, StoredBook, StoredCollection } from './library'
import type { LanguageVisibility } from '../electron/language-settings'
import type { UiLanguage } from '../electron/ui-language'
import type { UpdateState } from '../electron/update-types'

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
  onUpdateState(callback: (state: UpdateState) => void): () => void
  getLibraryRoot(): Promise<string | null>
  chooseLibraryRoot(): Promise<string | null>
  retryLibraryRoot(): Promise<string | null>
  openLibraryRoot(): Promise<void>
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
  addChapters(collectionId: string, language: ChapterLanguage): Promise<StoredBook[]>
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
