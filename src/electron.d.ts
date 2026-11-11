import type { ChapterLanguage, LibraryBook, LibraryCollection, StoredBook, StoredCollection } from './library'

interface YomuDesktopApi {
  getLibraryRoot(): Promise<string | null>
  chooseLibraryRoot(): Promise<string | null>
  openLibraryRoot(): Promise<void>
  exportCollection(collectionId: string): Promise<string | null>
  importCollection(): Promise<StoredCollection | null>
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
