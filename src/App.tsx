import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileText,
  FolderOpen,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { siGithub } from 'simple-icons'
import { version as packageVersion } from '../package.json'
import type { UpdateState } from '../electron/update-types'
import { compareChapters, getChapterNumber } from './library'
import type { ReadingPosition } from './reading-position'
import type {
  ChapterLanguage,
  CollectionKind,
  CollectionStatus,
  LibraryBook,
  LibraryCollection,
  StoredBook,
  StoredCollection,
} from './library'
import './App.css'

const Reader = lazy(() => import('./Reader'))

type LibraryView = 'all' | CollectionStatus
type SortOrder = 'recent' | 'title' | 'chapters'

const viewLabels: Record<LibraryView, string> = {
  all: 'Toutes les collections',
  'reading': 'En cours',
  'to-read': 'À lire',
  paused: 'En pause',
  completed: 'Terminées',
}

const statusLabels: Record<LibraryCollection['status'], string> = {
  'to-read': 'À lire',
  reading: 'En cours',
  paused: 'En pause',
  completed: 'Terminée',
}

function formatSize(bytes: number) {
  if (bytes <= 0) return '0 octet'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`
}

function blobFromBytes(bytes: Uint8Array, type = ''): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type })
}

function CollectionCover({ collection, className = '' }: { collection: LibraryCollection; className?: string }) {
  const [coverUrl, setCoverUrl] = useState('')

  useEffect(() => {
    if (!collection.coverPath || !window.yomu) return
    let active = true
    let url = ''
    window.yomu.readAsset(collection.coverPath)
      .then((bytes) => {
        if (active) {
          url = URL.createObjectURL(blobFromBytes(bytes))
          setCoverUrl(url)
        }
      })
      .catch(() => {
        if (active) setCoverUrl('')
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [collection.coverPath])

  return (
    <div className={`collection-cover ${className}`}>
      {collection.coverPath && coverUrl
        ? <img src={coverUrl} alt={`Couverture de ${collection.title}`} />
        : <div className="collection-cover-placeholder"><BookOpen size={36} strokeWidth={1.4} /><span>{collection.kind}</span></div>}
    </div>
  )
}

function CollectionDialog({
  collection,
  onClose,
  onSave,
}: {
  collection: LibraryCollection | null
  onClose: () => void
  onSave: (collection: LibraryCollection, coverBytes: Uint8Array | null, coverName: string | null, removeCover: boolean) => void
}) {
  const [title, setTitle] = useState(collection?.title ?? '')
  const [kind, setKind] = useState<LibraryCollection['kind']>(collection?.kind ?? 'Manga')
  const [status, setStatus] = useState<LibraryCollection['status']>(collection?.status ?? 'to-read')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [removeCover, setRemoveCover] = useState(false)
  const [coverPreview, setCoverPreview] = useState('')
  const [dialogError, setDialogError] = useState('')
  const coverInputRef = useRef<HTMLInputElement>(null)
  const coverPreviewRef = useRef('')

  useEffect(() => {
    return () => {
      if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current)
    }
  }, [])

  const handleCover = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setDialogError('Choisis un fichier image pour la couverture.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setDialogError('La couverture ne peut pas dépasser 10 Mo.')
      return
    }
    setDialogError('')
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current)
    coverPreviewRef.current = URL.createObjectURL(file)
    setCoverPreview(coverPreviewRef.current)
    setCoverFile(file)
    setRemoveCover(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextCollection: LibraryCollection = {
      id: collection?.id ?? crypto.randomUUID(),
      title: title.trim(),
      cover: null,
      coverPath: removeCover ? null : collection?.coverPath ?? null,
      folderName: collection?.folderName ?? '',
      kind,
      status,
      createdAt: collection?.createdAt ?? 0,
    }
    const coverBytes = coverFile ? new Uint8Array(await coverFile.arrayBuffer()) : null
    onSave(nextCollection, coverBytes, coverFile?.name ?? null, removeCover)
  }

  const previewCollection: LibraryCollection = {
    id: collection?.id ?? 'preview',
    title: title || 'Nouvelle collection',
    cover: null,
    coverPath: removeCover ? null : collection?.coverPath ?? null,
    folderName: collection?.folderName ?? '',
    kind,
    status,
    createdAt: collection?.createdAt ?? 0,
  }

  return (
    <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="edit-dialog collection-dialog" onSubmit={submit}>
        <div className="dialog-heading">
          <div><span className="eyebrow">{collection ? 'MODIFIER LA COLLECTION' : 'NOUVELLE COLLECTION'}</span><h2>{collection ? 'Modifier les détails' : 'Créer une collection'}</h2></div>
          <button type="button" className="icon-button dialog-close" aria-label="Fermer" onClick={onClose}><X size={19} /></button>
        </div>
        <label>Titre de la collection
          <input required autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Got a Gallery in the Wild" />
        </label>
        <div className="collection-fields">
          <label>Type
            <select value={kind} onChange={(event) => setKind(event.target.value as CollectionKind)}>
              <option value="Manga">Manga</option>
              <option value="Manhwa">Manhwa</option>
            </select>
          </label>
          <label>Statut
            <select value={status} onChange={(event) => setStatus(event.target.value as CollectionStatus)}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="cover-picker-row">
          {coverPreview
            ? <div className="collection-cover collection-cover-preview"><img src={coverPreview} alt={`Aperçu de ${title || 'la collection'}`} /></div>
            : <CollectionCover collection={previewCollection} className="collection-cover-preview" />}
          <div className="cover-picker-copy">
            <strong>Image de couverture</strong>
            <span>{coverFile?.name ?? (previewCollection.coverPath ? 'Couverture actuelle' : 'Choisis une image sur ton appareil')}</span>
            <div className="cover-picker-actions">
              <button type="button" className="button-secondary" onClick={() => coverInputRef.current?.click()}>{previewCollection.coverPath || coverFile ? 'Changer l’image' : 'Choisir une image'}</button>
              {(previewCollection.coverPath || coverFile) && <button type="button" className="remove-cover" onClick={() => { setCoverFile(null); setCoverPreview(''); setRemoveCover(true) }}>Retirer</button>}
            </div>
          </div>
          <input ref={coverInputRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => handleCover(event.target.files?.[0])} />
        </div>
        {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="button-primary"><Check size={16} />{collection ? 'Enregistrer' : 'Créer la collection'}</button>
        </div>
      </form>
    </div>
  )
}

function EditChapterDialog({
  book,
  onClose,
  onSave,
}: {
  book: LibraryBook
  onClose: () => void
  onSave: (book: LibraryBook) => void
}) {
  const [chapter, setChapter] = useState(book.chapter || book.title)
  const [progress, setProgress] = useState(book.progress)
  const [language, setLanguage] = useState<ChapterLanguage | ''>(book.language ?? '')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = chapter.trim()
    onSave({ ...book, title, chapter: title, language: language || null, progress, readingPosition: progress === book.progress ? book.readingPosition : undefined })
  }

  return (
    <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="edit-dialog" onSubmit={submit}>
        <div className="dialog-heading">
          <div><span className="eyebrow">DÉTAILS DU CHAPITRE</span><h2>Organiser votre lecture</h2></div>
          <button type="button" className="icon-button dialog-close" aria-label="Fermer" onClick={onClose}><X size={19} /></button>
        </div>
        <label>Nom du chapitre ou du tome
          <input required value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="Ex. Chapitre 12" />
        </label>
        <label>Langue
          <select value={language} onChange={(event) => {
            const value = event.target.value
            if (value === 'fr' || value === 'en' || value === '') setLanguage(value)
          }}>
            <option value="">À définir</option>
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </select>
        </label>
        <label className="progress-edit-label">Progression <span>{progress}%</span>
          <input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
        </label>
        <div className="dialog-file-info"><FileText size={15} /><span>{book.fileName}</span><b>{formatSize(book.size)}</b></div>
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="button-primary"><Check size={16} /> Enregistrer</button>
        </div>
      </form>
    </div>
  )
}

function LanguageFlag({ language }: { language: ChapterLanguage }) {
  return (
    <svg className="language-flag" viewBox="0 0 60 30" aria-hidden="true" focusable="false">
      {language === 'fr' ? (
        <>
          <rect width="60" height="30" fill="#fff" />
          <rect width="20" height="30" fill="#002395" />
          <rect x="40" width="20" height="30" fill="#ed2939" />
        </>
      ) : (
        <>
          <rect width="60" height="30" fill="#012169" />
          <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
          <path d="M0 0 L60 30 M60 0 L0 30" stroke="#c8102e" strokeWidth="2" />
          <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
          <path d="M30 0 V30 M0 15 H60" stroke="#c8102e" strokeWidth="6" />
        </>
      )}
    </svg>
  )
}

function ImportLanguageDialog({ onClose, onChoose }: {
  onClose: () => void
  onChoose: (language: ChapterLanguage) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return (
    <dialog ref={dialogRef} className="edit-dialog delete-collection-dialog" aria-labelledby="import-language-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
      <div className="dialog-heading">
        <div><span className="eyebrow">AJOUTER DES CHAPITRES</span><h2 id="import-language-title">Choisis la langue</h2></div>
        <button type="button" className="icon-button dialog-close" aria-label="Fermer" onClick={onClose}><X size={19} /></button>
      </div>
      <p className="delete-collection-copy">Tous les fichiers sélectionnés lors de cet import auront cette langue.</p>
      <div className="import-language-actions">
        <button type="button" className="button-secondary" autoFocus onClick={() => onChoose('fr')}><LanguageFlag language="fr" /> Français</button>
        <button type="button" className="button-secondary" onClick={() => onChoose('en')}><LanguageFlag language="en" /> Anglais</button>
      </div>
      <div className="dialog-actions"><button type="button" className="button-secondary" onClick={onClose}>Annuler</button></div>
    </dialog>
  )
}

function DeleteCollectionDialog({
  collection,
  chapterCount,
  onClose,
  onConfirm,
}: {
  collection: LibraryCollection
  chapterCount: number
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [dialogError, setDialogError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    cancelRef.current?.focus()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  const confirm = async () => {
    setIsDeleting(true)
    setDialogError('')
    try {
      await onConfirm()
      onClose()
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'La collection n’a pas pu être supprimée.')
      setIsDeleting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="edit-dialog delete-collection-dialog"
      aria-labelledby="delete-collection-title"
      aria-describedby="delete-collection-description"
      onCancel={(event) => { event.preventDefault(); if (!isDeleting) onClose() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (!isDeleting) onClose()
        }
      }}
    >
      <div className="dialog-heading">
        <div><span className="eyebrow">SUPPRIMER UNE COLLECTION</span><h2 id="delete-collection-title">Supprimer cette collection ?</h2></div>
        <button type="button" className="icon-button dialog-close" aria-label="Fermer" disabled={isDeleting} onClick={onClose}><X size={19} /></button>
      </div>
      <p className="delete-collection-copy" id="delete-collection-description">
        La collection <strong>« {collection.title} »</strong> et {chapterCount} chapitre{chapterCount > 1 ? 's' : ''} seront supprimés de Yomu.
      </p>
      <p className="delete-collection-warning">Le dossier de la collection, sa couverture et tous les fichiers qu’il contient seront définitivement supprimés. Les fichiers d’origine ailleurs sur ton PC ne seront pas modifiés.</p>
      {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
      <div className="dialog-actions">
        <button type="button" className="button-secondary" ref={cancelRef} disabled={isDeleting} onClick={onClose}>Annuler</button>
        <button type="button" className="button-danger" disabled={isDeleting} onClick={() => void confirm()}><Trash2 size={15} />{isDeleting ? 'Suppression…' : 'Supprimer la collection'}</button>
      </div>
    </dialog>
  )
}

function hydrateBook(book: StoredBook): LibraryBook {
  return { ...book, file: new Blob() }
}

function storeCollection(collection: LibraryCollection): StoredCollection {
  return {
    id: collection.id,
    title: collection.title,
    coverPath: collection.coverPath,
    folderName: collection.folderName,
    kind: collection.kind,
    status: collection.status,
    createdAt: collection.createdAt,
  }
}

function chapterOrderLabel(book: LibraryBook, index: number): string {
  const number = getChapterNumber(book.chapter || book.title)
  return number === null ? String(index + 1).padStart(2, '0') : String(number)
}

function App() {
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [collections, setCollections] = useState<LibraryCollection[]>([])
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(true)
  const [desktopUnavailable, setDesktopUnavailable] = useState(false)
  const [activeView, setActiveView] = useState<LibraryView>('all')
  const [activeCollectionId, setActiveCollectionId] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent')
  const [query, setQuery] = useState('')
  const [readerBook, setReaderBook] = useState<{ book: LibraryBook; kind: CollectionKind } | null>(null)
  const [editingBook, setEditingBook] = useState<LibraryBook | null>(null)
  const [editingCollection, setEditingCollection] = useState<LibraryCollection | null>(null)
  const [deletingCollection, setDeletingCollection] = useState<LibraryCollection | null>(null)
  const [showCollectionDialog, setShowCollectionDialog] = useState(false)
  const [showImportLanguage, setShowImportLanguage] = useState(false)
  const [languageSelections, setLanguageSelections] = useState<Record<string, ChapterLanguage | 'unassigned'>>({})
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isExportingCollection, setIsExportingCollection] = useState(false)
  const [isImportingCollection, setIsImportingCollection] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [updateActionPending, setUpdateActionPending] = useState(false)
  const booksRef = useRef<LibraryBook[]>([])
  const openRequestRef = useRef(0)
  const activeCollection = collections.find((collection) => collection.id === activeCollectionId)

  useLayoutEffect(() => {
    booksRef.current = books
  }, [books])

  useEffect(() => {
    if (!window.yomu?.getUpdateState || !window.yomu.onUpdateState) return
    let active = true
    const unsubscribe = window.yomu.onUpdateState((state) => { if (active) setUpdateState(state) })
    window.yomu.getUpdateState()
      .then((state) => { if (active) setUpdateState(state) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Impossible de charger les mises à jour.') })
    return () => { active = false; unsubscribe() }
  }, [])

  async function updateAction(action: () => Promise<void>) {
    setUpdateActionPending(true)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’opération de mise à jour a échoué.')
    } finally {
      setUpdateActionPending(false)
    }
  }

  const refreshLibrary = useCallback(async () => {
    if (!window.yomu) throw new Error('L’application Windows Yomu est nécessaire pour accéder à ton dossier.')
    const stored = await window.yomu.loadLibrary()
    setBooks(stored.books.map(hydrateBook))
    setCollections(stored.collections.map((collection) => ({ ...collection, cover: null })))
  }, [])

  useEffect(() => {
    let active = true
    if (!window.yomu) {
      Promise.resolve().then(() => {
        if (active) {
          setDesktopUnavailable(true)
          setIsStarting(false)
        }
      })
      return () => { active = false }
    }
    window.yomu.getLibraryRoot()
      .then(async (root) => {
        if (!active) return
        setLibraryRoot(root)
        if (root) {
          const stored = await window.yomu?.loadLibrary()
          if (active && stored) {
            setBooks(stored.books.map(hydrateBook))
            setCollections(stored.collections.map((collection) => ({ ...collection, cover: null })))
          }
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'La bibliothèque locale est inaccessible.')
      })
      .finally(() => { if (active) setIsStarting(false) })
    return () => { active = false }
  }, [])

  const chapterCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const book of books) counts.set(book.collectionId, (counts.get(book.collectionId) ?? 0) + 1)
    return counts
  }, [books])

  const collectionSizes = useMemo(() => {
    const sizes = new Map<string, number>()
    for (const book of books) sizes.set(book.collectionId, (sizes.get(book.collectionId) ?? 0) + book.size)
    return sizes
  }, [books])
  const totalLibrarySize = useMemo(
    () => books.reduce((total, book) => total + book.size, 0),
    [books],
  )

  const counts = useMemo(() => {
    const result: Record<LibraryView, number> = {
      all: collections.length,
      'to-read': 0,
      reading: 0,
      paused: 0,
      completed: 0,
    }
    for (const collection of collections) result[collection.status]++
    return result
  }, [collections])

  const visibleCollections = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    return collections
      .filter((collection) => activeView === 'all' || collection.status === activeView)
      .filter((collection) => !normalizedQuery || `${collection.title} ${collection.kind} ${statusLabels[collection.status]}`.toLocaleLowerCase('fr').includes(normalizedQuery))
      .sort((a, b) => {
        if (sortOrder === 'title') return a.title.localeCompare(b.title, 'fr')
        if (sortOrder === 'chapters') return (chapterCounts.get(b.id) ?? 0) - (chapterCounts.get(a.id) ?? 0)
        return b.createdAt - a.createdAt
      })
  }, [activeView, chapterCounts, collections, query, sortOrder])

  const allCollectionBooks = useMemo(
    () => books.filter((book) => book.collectionId === activeCollectionId)
      .sort((a, b) => sortOrder === 'recent'
        ? b.addedAt - a.addedAt
        : compareChapters(a, b)),
    [activeCollectionId, books, sortOrder],
  )
  const selectedLanguage = languageSelections[activeCollectionId]
    ?? (allCollectionBooks.some((book) => book.language === 'fr') ? 'fr'
      : allCollectionBooks.some((book) => book.language === 'en') ? 'en'
        : allCollectionBooks.some((book) => book.language === null) ? 'unassigned' : 'fr')
  const collectionBooks = allCollectionBooks.filter((book) => selectedLanguage === 'unassigned' ? book.language === null : book.language === selectedLanguage)

  const readerChapters = useMemo(
    () => readerBook
      ? books.filter((book) => book.collectionId === readerBook.book.collectionId && book.language === readerBook.book.language)
        .sort((a, b) => compareChapters(a, b) || a.addedAt - b.addedAt || a.id.localeCompare(b.id))
      : [],
    [books, readerBook],
  )
  const readerChapterIndex = readerBook ? readerChapters.findIndex((book) => book.id === readerBook.book.id) : -1
  const previousReaderChapter = readerChapterIndex > 0 ? readerChapters[readerChapterIndex - 1] : null
  const nextReaderChapter = readerChapterIndex >= 0 ? readerChapters[readerChapterIndex + 1] ?? null : null

  const continueBook = useMemo(
    () => books.filter((book) => book.progress < 100 && (book.progress > 0 || (book.lastOpenedAt !== null && book.readingPosition !== undefined)))
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0],
    [books],
  )
  const continueCollection = collections.find((collection) => collection.id === continueBook?.collectionId)

  const importFiles = async (language: ChapterLanguage) => {
    if (!activeCollection || !window.yomu) {
      setError('Ouvre une collection dans l’application Windows avant d’y ajouter des chapitres.')
      return
    }
    setError('')
    setIsImporting(true)
    try {
      const imported = await window.yomu.addChapters(activeCollection.id, language)
      if (imported.length > 0) {
        await refreshLibrary()
        setLanguageSelections((current) => ({ ...current, [activeCollection.id]: language }))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’import des chapitres a échoué.')
    } finally {
      setIsImporting(false)
    }
  }

  const saveCollectionDetails = async (
    collection: LibraryCollection,
    coverBytes: Uint8Array | null,
    coverName: string | null,
    removeCover: boolean,
  ) => {
    if (!window.yomu) return
    try {
      await window.yomu.saveCollection(storeCollection(collection), coverBytes, coverName, removeCover)
      setLibraryRoot(await window.yomu.getLibraryRoot())
      await refreshLibrary()
      setActiveCollectionId(collection.id)
      setActiveView('all')
      setQuery('')
      setEditingCollection(null)
      setShowCollectionDialog(false)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La collection n’a pas pu être enregistrée.')
    }
  }

  const saveChapterDetails = async (book: LibraryBook) => {
    if (!window.yomu) return
    try {
      await window.yomu.updateBook(book)
      await refreshLibrary()
      if (readerBook?.book.id === book.id) setReaderBook({ ...readerBook, book })
      setEditingBook(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Les modifications du chapitre n’ont pas pu être enregistrées.')
    }
  }

  const removeChapter = async (book: LibraryBook) => {
    if (!window.confirm(`Retirer « ${book.chapter || book.title} » de cette collection ? Le fichier stocké dans Yomu sera supprimé.`)) return
    if (!window.yomu) return
    try {
      await window.yomu.deleteBook(book.id)
      setBooks((current) => current.filter((entry) => entry.id !== book.id))
      if (readerBook?.book.id === book.id) setReaderBook(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Le chapitre n’a pas pu être supprimé.')
    }
  }

  const removeCollection = async (collection: LibraryCollection) => {
    if (!window.yomu) throw new Error('L’application Windows Yomu est nécessaire pour supprimer une collection.')
    await window.yomu.deleteCollection(collection.id)
    setCollections((current) => current.filter((entry) => entry.id !== collection.id))
    setBooks((current) => current.filter((book) => book.collectionId !== collection.id))
    setActiveCollectionId('')
    setReaderBook(null)
  }

  const exportCollection = async (collection: LibraryCollection) => {
    if (!window.yomu) return
    setError('')
    setNotice('')
    setIsExportingCollection(true)
    try {
      const archivePath = await window.yomu.exportCollection(collection.id)
      if (archivePath) setNotice(`Collection exportée : ${archivePath}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La collection n’a pas pu être exportée.')
    } finally {
      setIsExportingCollection(false)
    }
  }

  const importCollection = async () => {
    if (!window.yomu) return
    setError('')
    setNotice('')
    setIsImportingCollection(true)
    try {
      const imported = await window.yomu.importCollection()
      if (!imported) return
      await refreshLibrary()
      setActiveCollectionId(imported.id)
      setActiveView('all')
      setIsSettingsOpen(false)
      setNotice(`« ${imported.title} » a été ajoutée à ta bibliothèque.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La collection n’a pas pu être importée.')
    } finally {
      setIsImportingCollection(false)
    }
  }

  const openBook = async (book: LibraryBook) => {
    if (!window.yomu) {
      setError('Lance l’application Windows Yomu pour lire les chapitres.')
      return
    }
    const collection = collections.find((entry) => entry.id === book.collectionId)
    if (!collection) {
      setError('La collection de ce chapitre est introuvable.')
      return
    }
    const request = ++openRequestRef.current
    setError('')
    try {
      const bytes = await window.yomu.readAsset(book.relativePath)
      if (request !== openRequestRef.current) return
      const mimeType = book.format === 'PDF' ? 'application/pdf' : book.format === 'EPUB' ? 'application/epub+zip' : 'application/zip'
      const currentBook = booksRef.current.find((entry) => entry.id === book.id) ?? book
      const updated = { ...currentBook, file: blobFromBytes(bytes, mimeType), lastOpenedAt: Date.now() }
      await window.yomu.updateBook(updated)
      if (request !== openRequestRef.current) return
      const nextBooks = booksRef.current.map((entry) => entry.id === book.id ? updated : entry)
      booksRef.current = nextBooks
      setBooks(nextBooks)
      setReaderBook({ book: updated, kind: collection.kind })
      if (updated.progress < 100) {
        if (collection.status === 'to-read') {
          const nextCollection = { ...collection, status: 'reading' as const }
          await window.yomu.saveCollection(storeCollection(nextCollection), null, null, false)
          setCollections((current) => current.map((entry) => entry.id === collection.id ? nextCollection : entry))
        }
      }
    } catch (reason) {
      if (request === openRequestRef.current) setError(reason instanceof Error ? reason.message : 'Le chapitre n’a pas pu être ouvert.')
    }
  }

  const updateProgress = useCallback((bookId: string, progress: number, readingPosition: ReadingPosition) => {
    const book = booksRef.current.find((entry) => entry.id === bookId)
    if (!book || (book.progress === progress && JSON.stringify(book.readingPosition) === JSON.stringify(readingPosition))) return
    const updated = { ...book, progress, readingPosition }
    const nextBooks = booksRef.current.map((entry) => entry.id === bookId ? updated : entry)
    booksRef.current = nextBooks
    setBooks(nextBooks)
    if (!window.yomu) return
    window.yomu.updateBook(updated).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'La progression n’a pas pu être enregistrée.')
    })
  }, [])

  const chooseLibraryFolder = async (isChanging = false) => {
    if (!window.yomu) return
    if (isChanging && !window.confirm('Changer de dossier ne déplace pas les collections existantes. Elles resteront dans leur dossier actuel. Continuer ?')) return
    try {
      const selected = await window.yomu.chooseLibraryRoot()
      if (!selected) return
      setIsStarting(true)
      setLibraryRoot(selected)
      setActiveCollectionId('')
      setBooks([])
      setCollections([])
      await refreshLibrary()
      setQuery('')
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Le dossier de bibliothèque n’a pas pu être ouvert.')
    } finally {
      setIsStarting(false)
    }
  }

  const openLibraryFolder = async () => {
    if (!window.yomu) return
    try {
      await window.yomu.openLibraryRoot()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Le dossier de bibliothèque n’a pas pu être ouvert.')
    }
  }

  const openGitHub = async () => {
    if (!window.yomu) {
      setError('L’application Windows Yomu est nécessaire pour ouvrir GitHub.')
      return
    }
    try {
      await window.yomu.openGitHub()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Le dépôt GitHub n’a pas pu être ouvert.')
    }
  }

  const navItems: { id: LibraryView; icon: typeof Library }[] = [
    { id: 'all', icon: Library },
    { id: 'reading', icon: Clock3 },
    { id: 'to-read', icon: Bookmark },
    { id: 'paused', icon: MoreHorizontal },
    { id: 'completed', icon: CircleCheck },
  ]

  if (readerBook) {
    return <Suspense fallback={<div className="reader-loading full-screen"><span>Ouverture du lecteur…</span></div>}><Reader book={readerBook.book} collectionKind={readerBook.kind} previousChapter={previousReaderChapter} nextChapter={nextReaderChapter} onNavigateChapter={(book) => void openBook(book)} onClose={() => { openRequestRef.current++; setReaderBook(null) }} onProgress={updateProgress} error={error} /></Suspense>
  }

  const openCreateCollection = () => {
    setError('')
    setShowCollectionDialog(true)
  }

  if (desktopUnavailable) {
    return (
      <main className="folder-setup">
        <div className="folder-setup-card">
          <div className="folder-setup-mark"><BookOpen size={24} /></div>
          <span className="eyebrow">YOMU POUR WINDOWS</span>
          <h1>Une application Windows est nécessaire.</h1>
          <p>Cette version lit et enregistre tes fichiers directement dans un dossier de ton PC. Lance Yomu depuis son application Windows pour continuer.</p>
        </div>
      </main>
    )
  }

  if (isStarting) {
    return <main className="folder-setup"><div className="reader-loading"><span>Ouverture de ta bibliothèque…</span></div></main>
  }

  if (!libraryRoot) {
    return (
      <main className="folder-setup">
        <div className="folder-setup-card">
          <div className="folder-setup-mark"><BookOpen size={24} /></div>
          <span className="eyebrow">BIBLIOTHÈQUE INDISPONIBLE</span>
          <h1>Choisis ton dossier de bibliothèque.</h1>
          <p>Le dossier enregistré est introuvable. Reconnecte-le ou choisis un autre dossier ; les collections existantes ne seront pas déplacées.</p>
          {error && <p className="dialog-error" role="alert">{error}</p>}
          <button className="button-primary" onClick={() => void chooseLibraryFolder()}><Plus size={17} /> Choisir un dossier sur mon PC</button>
          <span className="folder-setup-note">Tes anciennes données du navigateur ne seront pas importées.</span>
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-placeholder" href="#" aria-label="Retour à la bibliothèque" onClick={(event) => { event.preventDefault(); setActiveCollectionId(''); setActiveView('all'); setIsSettingsOpen(false) }} />
        <div className="sidebar-label">BIBLIOTHÈQUE</div>
        <nav className="main-nav" aria-label="Bibliothèque">
          {navItems.map(({ id, icon: Icon }) => (
            <button key={id} className={`nav-item ${activeView === id && !activeCollectionId && !isSettingsOpen ? 'active' : ''}`} onClick={() => { setActiveView(id); setActiveCollectionId(''); setIsSettingsOpen(false) }}>
              <Icon size={17} strokeWidth={1.8} /><span>{viewLabels[id]}</span><span className="nav-count">{counts[id]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-label series-label">MES COLLECTIONS <span>{collections.length}</span></div>
        <nav className="series-nav" aria-label="Collections">
          {collections.length === 0 && <p className="sidebar-empty">Vos collections apparaîtront ici.</p>}
          {collections.map((collection) => (
            <button key={collection.id} className={`series-item ${activeCollectionId === collection.id ? 'active' : ''}`} title={collection.title} onClick={() => { setActiveCollectionId(collection.id); setIsSettingsOpen(false) }}>
              <span className="series-dot" /><span className="series-name">{collection.title}</span><span className="nav-count">{chapterCounts.get(collection.id) ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-storage" title="Taille totale des chapitres de toutes les collections">
            <span>Espace utilisé</span><strong>{formatSize(totalLibrarySize)}</strong>
          </div>
          <button
            className="nav-item sidebar-import"
            title="Importer une collection depuis un fichier ZIP"
            onClick={() => void importCollection()}
            disabled={isImportingCollection}
          >
            <ArchiveRestore size={17} strokeWidth={1.8} /><span>{isImportingCollection ? 'Importation…' : 'Importer un ZIP'}</span>
          </button>
          <button
            className={`nav-item sidebar-settings${isSettingsOpen ? ' active' : ''}`}
            aria-current={isSettingsOpen ? 'page' : undefined}
            onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(true) }}
          >
            <Settings size={17} strokeWidth={1.8} /><span>Paramètres</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(false); setActiveView('all') }}>Bibliothèque</button>
            <span className="breadcrumb-slash">/</span>
            <strong>{isSettingsOpen ? 'Paramètres' : activeCollection?.title ?? viewLabels[activeView]}</strong>
          </div>
          <div className="topbar-right">
            {!isSettingsOpen && <div className="search-box">
              <Search size={16} />
              <input aria-label="Rechercher une collection" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une collection..." />
              <kbd>⌘ K</kbd>
              {query && <button className="search-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche"><X size={14} /></button>}
            </div>}
          </div>
        </header>

        <div className={`content-inner ${collections.length === 0 && !isSettingsOpen ? 'empty-library' : ''}`}>
          {error && <div role="alert" className="error-banner"><span>{error}</span><button aria-label="Fermer" onClick={() => setError('')}><X size={17} /></button></div>}
          {notice && <div role="status" className="success-banner"><span>{notice}</span><button aria-label="Fermer" onClick={() => setNotice('')}><X size={17} /></button></div>}
          {!isSettingsOpen && (updateState?.phase === 'available' || updateState?.phase === 'downloaded') && (
            <div role="status" className="success-banner">
              <span>Une mise à jour de Yomu est {updateState.phase === 'downloaded' ? 'prête à être installée' : 'disponible'}.</span>
              <button onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(true) }}>Voir les paramètres</button>
            </div>
          )}
          {!isSettingsOpen && updateState?.phase === 'error' && (
            <div role="alert" className="error-banner">
              <span>Erreur de mise à jour : {updateState.message}</span>
              <button onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(true) }}>Voir les paramètres</button>
            </div>
          )}
          {isSettingsOpen ? (
            <section className="settings-page">
              <h1>Paramètres</h1>
              <div className="settings-card settings-version-card">
                <div className="settings-card-copy">
                  <strong>Informations</strong>
                  <span>Yomu est une application pour organiser et lire tes mangas et manhwas directement sur ton PC.</span>
                  <span>Créé par laserfuse</span>
                  <code className="settings-version" aria-label={`Version de l’application : v${updateState?.version ?? packageVersion}`}>v{updateState?.version ?? packageVersion}</code>
                </div>
                <button className="button-secondary settings-github" onClick={() => void openGitHub()}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={siGithub.path} /></svg> Voir le projet sur GitHub
                </button>
              </div>
              <div className="settings-card settings-updates">
                <div className="settings-card-copy">
                  <strong>Mises à jour</strong>
                  <span>Vérifier sur GitHub au démarrage. Aucun téléchargement ni installation sans ton accord.</span>
                  <label className="settings-update-toggle">
                    <input type="checkbox" checked={updateState?.automatic ?? false}
                      disabled={!updateState?.supported || updateActionPending}
                      onChange={(event) => {
                        const automatic = event.target.checked
                        if (window.yomu) void updateAction(() => window.yomu!.setAutomaticUpdates(automatic))
                      }} />
                    Vérification automatique
                  </label>
                  <span role={updateState?.phase === 'error' ? 'alert' : 'status'}>
                    {!updateState && 'Chargement des informations de mise à jour…'}
                    {updateState?.phase === 'unsupported' && 'Disponible uniquement dans l’application Windows installée.'}
                    {updateState?.phase === 'idle' && 'Aucune vérification effectuée.'}
                    {updateState?.phase === 'checking' && 'Vérification en cours…'}
                    {updateState?.phase === 'current' && 'Yomu est à jour.'}
                    {updateState?.phase === 'available' && `Version ${updateState.availableVersion} disponible.`}
                    {updateState?.phase === 'downloading' && `Téléchargement en cours : ${updateState.progress ?? 0} %`}
                    {updateState?.phase === 'downloaded' && `Version ${updateState.availableVersion} prête à être installée.`}
                    {updateState?.phase === 'error' && `Impossible de mettre à jour Yomu : ${updateState.message}`}
                  </span>
                </div>
                <div className="settings-update-actions">
                  <button className="button-secondary" disabled={!updateState?.supported || updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'downloaded' || updateActionPending}
                    onClick={() => { if (window.yomu) void updateAction(() => window.yomu!.checkForUpdates()) }}>Vérifier les mises à jour</button>
                  {updateState?.phase === 'available' && <button className="button-primary" disabled={updateActionPending}
                    onClick={() => { if (window.yomu) void updateAction(() => window.yomu!.downloadUpdate()) }}>Télécharger la mise à jour</button>}
                  {updateState?.phase === 'downloaded' && <button className="button-primary" disabled={updateActionPending}
                    onClick={() => { if (window.yomu) void updateAction(() => window.yomu!.installUpdate()) }}>Installer et redémarrer</button>}
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-copy">
                  <strong>Dossier de bibliothèque</strong>
                  <span>Emplacement actuel de tes collections et chapitres</span>
                  <code title={libraryRoot}>{libraryRoot}</code>
                </div>
                <button className="button-secondary" onClick={() => void chooseLibraryFolder(true)}>
                  <Pencil size={15} /> Changer de dossier
                </button>
                <button className="button-secondary settings-open-folder" onClick={() => void openLibraryFolder()}>
                  <FolderOpen size={15} /> Ouvrir dans l’Explorateur
                </button>
                <p className="settings-note">Changer de dossier ne déplace pas les collections déjà enregistrées.</p>
              </div>
            </section>
          ) : activeCollection ? (
            <section className="collection-detail">
              <button className="back-to-collections" onClick={() => setActiveCollectionId('')}><ArrowLeft size={15} /> Toutes les collections</button>
              <div className="collection-detail-header">
                <CollectionCover collection={activeCollection} className="detail-cover" />
                <div className="collection-detail-info">
                  <div className="collection-badges"><span>{activeCollection.kind}</span><span className={`status-pill status-${activeCollection.status}`}>{statusLabels[activeCollection.status]}</span></div>
                  <h1>{activeCollection.title}</h1>
                  <p>{allCollectionBooks.length} chapitre{allCollectionBooks.length > 1 ? 's' : ''} · {formatSize(collectionSizes.get(activeCollection.id) ?? 0)}</p>
                  <div className="detail-actions">
                    <button className="button-primary" onClick={() => setShowImportLanguage(true)} disabled={isImporting}><Plus size={16} />{isImporting ? 'Import en cours…' : 'Ajouter des chapitres'}</button>
                    <button className="button-secondary" onClick={() => void exportCollection(activeCollection)} disabled={isExportingCollection}><Archive size={15} />{isExportingCollection ? 'Exportation…' : 'Exporter'}</button>
                    <button className="button-secondary" onClick={() => setEditingCollection(activeCollection)}><Pencil size={15} /> Modifier</button>
                    <button className="icon-button delete-action" aria-label={`Supprimer ${activeCollection.title}`} onClick={() => setDeletingCollection(activeCollection)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>

              <div className="chapter-section">
                <div className="language-filters" role="group" aria-label="Langue des chapitres">
                  {(['fr', 'en'] as const).map((language) => (
                    <button key={language} type="button" className={`language-filter${selectedLanguage === language ? ' active' : ''}`}
                      aria-pressed={selectedLanguage === language} onClick={() => setLanguageSelections((current) => ({ ...current, [activeCollection.id]: language }))}>
                      <LanguageFlag language={language} /> {language === 'fr' ? 'Français' : 'Anglais'} <span>{allCollectionBooks.filter((book) => book.language === language).length}</span>
                    </button>
                  ))}
                  {allCollectionBooks.some((book) => book.language === null) && (
                    <button type="button" className={`language-filter${selectedLanguage === 'unassigned' ? ' active' : ''}`}
                      aria-pressed={selectedLanguage === 'unassigned'} onClick={() => setLanguageSelections((current) => ({ ...current, [activeCollection.id]: 'unassigned' }))}>
                      À définir <span>{allCollectionBooks.filter((book) => book.language === null).length}</span>
                    </button>
                  )}
                </div>
                <div className="section-heading chapter-heading">
                  <div><span className="eyebrow">DANS CETTE COLLECTION</span><h2>Chapitres <span className="heading-count">{collectionBooks.length}</span></h2></div>
                  {collectionBooks.length > 0 && <label className="sort-control"><ArrowDownWideNarrow size={15} /><select aria-label="Trier les chapitres" value={sortOrder === 'chapters' ? 'title' : sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}><option value="title">Nom</option><option value="recent">Ajout récent</option></select><ChevronDown size={14} /></label>}
                </div>
                {collectionBooks.length === 0 ? (
                  <div className="empty-chapters">
                    <div className="empty-chapters-icon"><FileText size={24} /></div>
                    <h2>Pas encore de chapitres dans cette langue</h2>
                    <p>Ajoute tes fichiers PDF, CBZ ou EPUB à cette collection.</p>
                    <button className="button-primary" onClick={() => setShowImportLanguage(true)} disabled={isImporting}><Plus size={16} /> Ajouter des chapitres</button>
                  </div>
                ) : (
                  <div className="chapter-list">
                    {collectionBooks.map((book, index) => (
                      <article className="chapter-row" key={book.id}>
                        <button className="chapter-number" onClick={() => void openBook(book)} aria-label={`Lire ${book.chapter || book.title}`}>{chapterOrderLabel(book, index)}</button>
                        <button className="chapter-title" onClick={() => void openBook(book)}><strong>{book.chapter || book.title}</strong><span>{book.format} · {formatSize(book.size)}</span></button>
                        <div className="chapter-progress"><span className={book.progress > 0 ? 'chapter-progress-fill' : ''} style={{ width: `${book.progress}%` }} /></div>
                        <span className="chapter-progress-label">{book.progress ? `${book.progress}%` : 'À lire'}</span>
                        <div className="chapter-actions">
                          <button className="icon-button" aria-label={`Modifier ${book.chapter || book.title}`} onClick={() => setEditingBook(book)}><Pencil size={14} /></button>
                          <button className="icon-button delete-action" aria-label={`Supprimer ${book.chapter || book.title}`} onClick={() => void removeChapter(book)}><Trash2 size={14} /></button>
                        </div>
                      </article>
                    ))}
                    <button className="add-chapter-row" onClick={() => setShowImportLanguage(true)} disabled={isImporting}><Plus size={16} /> Ajouter des chapitres à cette collection</button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <>
              {collections.length === 0 ? (
                <section className="empty-state collection-empty">
                  <div className="empty-art">
                    <div className="empty-orbit orbit-one" /><div className="empty-orbit orbit-two" />
                    <div className="empty-book"><BookOpen size={33} strokeWidth={1.4} /></div>
                    <span className="empty-sparkle sparkle-one">✳</span><span className="empty-sparkle sparkle-two">✦</span>
                  </div>
                  <span className="eyebrow"><Sparkles size={13} /> COMMENCE PAR CRÉER UNE COLLECTION</span>
                  <h2>Un univers à la fois.</h2>
                  <p>Crée une collection pour ton manga ou manhwa,<br />puis ajoute ses chapitres.</p>
                  <button className="button-primary empty-import" onClick={openCreateCollection}><Plus size={17} /> Créer ma première collection</button>
                  <div className="supported-formats"><span>MANGA</span><i /><span>MANHWA</span></div>
                </section>
              ) : (
                <>
                  {!query && activeView === 'all' && continueBook && (
                    <section className="continue-section">
                      <div className="section-heading">
                        <div><span className="eyebrow">REPRENDRE LÀ OÙ VOUS EN ÊTES</span><h2>Continuer la lecture</h2></div>
                        <span className="section-caption">Votre histoire vous attend</span>
                      </div>
                      <div className="continue-card">
                        {continueCollection
                          ? <CollectionCover collection={continueCollection} className="continue-cover" />
                          : <div className={`continue-cover cover-${continueBook.format.toLowerCase()}`}><span className="cover-format">{continueBook.format}</span><BookOpen size={40} strokeWidth={1.2} /></div>}
                        <div className="continue-info">
                          <span className="eyebrow">{continueBook.series}</span><h3>{continueBook.chapter || continueBook.title}</h3>
                          <p>{continueBook.format}</p>
                          <div className="progress-line"><span style={{ width: `${continueBook.progress}%` }} /></div>
                          <div className="continue-meta"><span>{continueBook.progress}% terminé</span><button onClick={() => void openBook(continueBook)}>Continuer <span>→</span></button></div>
                        </div>
                      </div>
                    </section>
                  )}
                  <section className="library-section">
                    <div className="section-heading library-heading">
                      <div><span className="eyebrow">{activeView === 'all' ? 'VOTRE BIBLIOTHÈQUE' : 'COLLECTIONS FILTRÉES'}</span><h2>{viewLabels[activeView]} <span className="heading-count">{visibleCollections.length}</span></h2></div>
                      <label className="sort-control"><ArrowDownWideNarrow size={15} /><select aria-label="Trier les collections" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}><option value="recent">Ajout récent</option><option value="title">Titre</option><option value="chapters">Nombre de chapitres</option></select><ChevronDown size={14} /></label>
                    </div>
                    {visibleCollections.length === 0 ? (
                      <div className="no-results"><Search size={20} /><span>Aucune collection ne correspond à cette recherche.</span><button onClick={() => { setQuery(''); setActiveView('all') }}>Réinitialiser</button></div>
                    ) : (
                      <div className="collection-grid">
                        {visibleCollections.map((collection) => {
                          const chapterCount = chapterCounts.get(collection.id) ?? 0
                          return (
                            <article className="collection-card" key={collection.id}>
                              <button className="collection-card-open" onClick={() => setActiveCollectionId(collection.id)} aria-label={`Ouvrir la collection ${collection.title}`}>
                                <CollectionCover collection={collection} />
                                <div className="collection-card-info">
                                  <div className="collection-card-kicker">{collection.kind}<span>·</span>{statusLabels[collection.status]}</div>
                                  <strong>{collection.title}</strong>
                                  <span>{chapterCount} chapitre{chapterCount > 1 ? 's' : ''} · {formatSize(collectionSizes.get(collection.id) ?? 0)}</span>
                                </div>
                              </button>
                              <button className="icon-button collection-card-edit" aria-label={`Modifier ${collection.title}`} onClick={() => setEditingCollection(collection)}><Pencil size={14} /></button>
                            </article>
                          )
                        })}
                        <button className="add-collection-card" onClick={openCreateCollection}><span className="add-book-icon"><Plus size={20} /></span><strong>Créer une collection</strong><span>Manga ou manhwa</span></button>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {showCollectionDialog && <CollectionDialog collection={null} onClose={() => setShowCollectionDialog(false)} onSave={(collection, cover, coverName, removeCover) => void saveCollectionDetails(collection, cover, coverName, removeCover)} />}
      {editingCollection && <CollectionDialog collection={editingCollection} onClose={() => setEditingCollection(null)} onSave={(collection, cover, coverName, removeCover) => void saveCollectionDetails(collection, cover, coverName, removeCover)} />}
      {editingBook && <EditChapterDialog book={editingBook} onClose={() => setEditingBook(null)} onSave={(book) => void saveChapterDetails(book)} />}
      {showImportLanguage && <ImportLanguageDialog onClose={() => setShowImportLanguage(false)} onChoose={(language) => { setShowImportLanguage(false); void importFiles(language) }} />}
      {deletingCollection && <DeleteCollectionDialog collection={deletingCollection} chapterCount={chapterCounts.get(deletingCollection.id) ?? 0} onClose={() => setDeletingCollection(null)} onConfirm={() => removeCollection(deletingCollection)} />}
    </div>
  )
}

export default App
