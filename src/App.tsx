import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
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
  RotateCw,
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
import sidebarLogo from './assets/yomu-sidebar-logo.png'
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
import type { LanguageVisibility } from '../electron/language-settings'
import type { UiLanguage } from '../electron/ui-language'
import { DEFAULT_READER_SHORTCUTS, isBindableReaderShortcut } from '../electron/reader-shortcuts'
import type { ReaderShortcutAction, ReaderShortcuts } from '../electron/reader-shortcuts'
import { UiLanguageProvider } from './ui-language'
import { useUiLanguage } from './use-ui-language'
import { countChapterPages } from './chapter-page-count'
import './App.css'

const Reader = lazy(() => import('./Reader'))

type LibraryView = 'all' | CollectionStatus
type CollectionSortOrder = 'recent' | 'title' | 'chapters' | 'progress'
type ChapterSortOrder = 'recent' | 'title'
type ChapterImportSource = { type: 'files' } | { type: 'folder' } | { type: 'drop'; files: File[] }
type ChapterPageCount = { count: number } | { error: string }

function chapterPageCountKey(book: LibraryBook, libraryRoot: string | null): string {
  return `${libraryRoot ?? ''}\u0000${book.id}\u0000${book.relativePath}\u0000${book.size}\u0000${book.format}`
}

const readerShortcutLabels: Record<ReaderShortcutAction, string> = {
  mangaPreviousPage: 'Page précédente (manga)',
  mangaNextPage: 'Page suivante (manga)',
  manhwaPreviousPage: 'Page précédente (manhwa)',
  manhwaNextPage: 'Page suivante (manhwa)',
  closeReader: 'Retour à la bibliothèque',
}

function displayReaderShortcut(key: string, language: UiLanguage): string {
  const labels: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: language === 'fr' ? 'Échap' : 'Escape',
    PageUp: language === 'fr' ? 'Page précédente' : 'Page Up',
    PageDown: language === 'fr' ? 'Page suivante' : 'Page Down',
    Backspace: language === 'fr' ? 'Retour arrière' : 'Backspace',
  }
  return labels[key] ?? (key.length === 1 ? key.toLocaleUpperCase(language) : key)
}

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

function formatSize(bytes: number, language: UiLanguage) {
  const unit = (value: string) => language === 'en'
    ? ({ octet: 'bytes', Ko: 'KB', Mo: 'MB', Go: 'GB' }[value] ?? value)
    : value
  if (bytes <= 0) return `0 ${unit('octet')}`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${unit('Ko')}`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${unit('Mo')}`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ${unit('Go')}`
}

function blobFromBytes(bytes: Uint8Array, type = ''): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type })
}

function CollectionCover({ collection, className = '' }: { collection: LibraryCollection; className?: string }) {
  const { t } = useUiLanguage()
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
        ? <img src={coverUrl} alt={t('Couverture de {title}', { title: collection.title })} />
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
  const { t } = useUiLanguage()
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
      setDialogError(t('Choisis un fichier image pour la couverture.'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setDialogError(t('La couverture ne peut pas dépasser 10 Mo.'))
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
    title: title || t('Nouvelle collection'),
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
          <div><span className="eyebrow">{t(collection ? 'MODIFIER LA COLLECTION' : 'NOUVELLE COLLECTION')}</span><h2>{t(collection ? 'Modifier les détails' : 'Créer une collection')}</h2></div>
          <button type="button" className="icon-button dialog-close" aria-label={t('Fermer')} onClick={onClose}><X size={19} /></button>
        </div>
        <label>{t('Titre de la collection')}
          <input required autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('Ex. Got a Gallery in the Wild')} />
        </label>
        <div className="collection-fields">
          <label>{t('Type')}
            <select value={kind} onChange={(event) => setKind(event.target.value as CollectionKind)}>
              <option value="Manga">Manga</option>
              <option value="Manhwa">Manhwa</option>
            </select>
          </label>
          <label>{t('Statut')}
            <select value={status} onChange={(event) => setStatus(event.target.value as CollectionStatus)}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
        </div>
        <div className="cover-picker-row">
          {coverPreview
            ? <div className="collection-cover collection-cover-preview"><img src={coverPreview} alt={t('Aperçu de {title}', { title: title || t('la collection') })} /></div>
            : <CollectionCover collection={previewCollection} className="collection-cover-preview" />}
          <div className="cover-picker-copy">
            <strong>{t('Image de couverture')}</strong>
            <span>{coverFile?.name ?? (previewCollection.coverPath ? t('Couverture actuelle') : t('Choisis une image sur ton appareil'))}</span>
            <div className="cover-picker-actions">
              <button type="button" className="button-secondary" onClick={() => coverInputRef.current?.click()}>{t(previewCollection.coverPath || coverFile ? 'Changer l’image' : 'Choisir une image')}</button>
              {(previewCollection.coverPath || coverFile) && <button type="button" className="remove-cover" onClick={() => { setCoverFile(null); setCoverPreview(''); setRemoveCover(true) }}>{t('Retirer')}</button>}
            </div>
          </div>
          <input ref={coverInputRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => handleCover(event.target.files?.[0])} />
        </div>
        {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onClose}>{t('Annuler')}</button>
          <button type="submit" className="button-primary"><Check size={16} />{t(collection ? 'Enregistrer' : 'Créer la collection')}</button>
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
  const { language: uiLanguage, t } = useUiLanguage()
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
          <div><span className="eyebrow">{t('DÉTAILS DU CHAPITRE')}</span><h2>{t('Organiser votre lecture')}</h2></div>
          <button type="button" className="icon-button dialog-close" aria-label={t('Fermer')} onClick={onClose}><X size={19} /></button>
        </div>
        <label>{t('Nom du chapitre ou du tome')}
          <input required value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder={t('Ex. Chapitre 12')} />
        </label>
        <label>{t('Langue')}
          <select value={language} onChange={(event) => {
            const value = event.target.value
            if (value === 'fr' || value === 'en' || value === '') setLanguage(value)
          }}>
            <option value="">{t('À définir')}</option>
            <option value="fr">{t('Français')}</option>
            <option value="en">{t('Anglais')}</option>
          </select>
        </label>
        <label className="progress-edit-label">{t('Progression')} <span>{progress}%</span>
          <input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
        </label>
        <div className="dialog-file-info"><FileText size={15} /><span>{book.fileName}</span><b>{formatSize(book.size, uiLanguage)}</b></div>
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onClose}>{t('Annuler')}</button>
          <button type="submit" className="button-primary"><Check size={16} /> {t('Enregistrer')}</button>
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
  const { t } = useUiLanguage()
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
        <div><span className="eyebrow">{t('AJOUTER DES CHAPITRES')}</span><h2 id="import-language-title">{t('Choisis la langue')}</h2></div>
        <button type="button" className="icon-button dialog-close" aria-label={t('Fermer')} onClick={onClose}><X size={19} /></button>
      </div>
      <p className="delete-collection-copy">{t('Tous les fichiers sélectionnés lors de cet import auront cette langue.')}</p>
      <div className="import-language-actions">
        <button type="button" className="button-secondary" autoFocus onClick={() => onChoose('fr')}><LanguageFlag language="fr" /> {t('Français')}</button>
        <button type="button" className="button-secondary" onClick={() => onChoose('en')}><LanguageFlag language="en" /> {t('Anglais')}</button>
      </div>
      <div className="dialog-actions"><button type="button" className="button-secondary" onClick={onClose}>{t('Annuler')}</button></div>
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
  const { t } = useUiLanguage()
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
      setDialogError(t(reason instanceof Error ? reason.message : 'La collection n’a pas pu être supprimée.'))
      setIsDeleting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="edit-dialog delete-collection-dialog"
      aria-labelledby="delete-collection-title"
      aria-describedby="delete-collection-description delete-collection-warning"
      onCancel={(event) => { event.preventDefault(); if (!isDeleting) onClose() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (!isDeleting) onClose()
        }
      }}
    >
      <div className="dialog-heading">
        <div><span className="eyebrow">{t('SUPPRESSION DÉFINITIVE')}</span><h2 id="delete-collection-title">{t('Supprimer définitivement cette collection ?')}</h2></div>
        <button type="button" className="icon-button dialog-close" aria-label={t('Fermer')} disabled={isDeleting} onClick={onClose}><X size={19} /></button>
      </div>
      <p className="delete-collection-copy" id="delete-collection-description">
        {t('La collection « {title} » et {count} {chapters} seront supprimés de Yomu.', {
          title: collection.title,
          count: chapterCount,
          chapters: t(chapterCount === 1 ? 'chapitre' : 'chapitres'),
        })}
      </p>
      <p className="delete-collection-warning" id="delete-collection-warning">{t('Cette action est irréversible : le dossier de la collection, sa couverture et tous les fichiers qu’il contient seront définitivement supprimés. Les fichiers d’origine ailleurs sur ton PC ne seront pas modifiés.')}</p>
      {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
      <div className="dialog-actions">
        <button type="button" className="button-secondary" ref={cancelRef} disabled={isDeleting} onClick={onClose}>{t('Annuler')}</button>
        <button type="button" className="button-danger" disabled={isDeleting} onClick={() => void confirm()}><Trash2 size={15} />{t(isDeleting ? 'Suppression…' : 'Supprimer définitivement')}</button>
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

function AppContent() {
  const { language, t, setLanguage, isLoading: isUiLanguageLoading, loadError: uiLanguageLoadError } = useUiLanguage()
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [collections, setCollections] = useState<LibraryCollection[]>([])
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(true)
  const [desktopUnavailable, setDesktopUnavailable] = useState(false)
  const [activeView, setActiveView] = useState<LibraryView>('all')
  const [activeCollectionId, setActiveCollectionId] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [collectionSortOrder, setCollectionSortOrder] = useState<CollectionSortOrder>('recent')
  const [chapterSortOrder, setChapterSortOrder] = useState<ChapterSortOrder>('recent')
  const [languageVisibility, setLanguageVisibility] = useState<LanguageVisibility>('both')
  const [isSavingLanguageVisibility, setIsSavingLanguageVisibility] = useState(false)
  const [isSavingUiLanguage, setIsSavingUiLanguage] = useState(false)
  const [readerShortcuts, setReaderShortcuts] = useState<ReaderShortcuts>(DEFAULT_READER_SHORTCUTS)
  const [isSavingReaderShortcuts, setIsSavingReaderShortcuts] = useState(false)
  const [capturingShortcut, setCapturingShortcut] = useState<ReaderShortcutAction | null>(null)
  const [query, setQuery] = useState('')
  const [readerBook, setReaderBook] = useState<{ book: LibraryBook; kind: CollectionKind } | null>(null)
  const [editingBook, setEditingBook] = useState<LibraryBook | null>(null)
  const [editingCollection, setEditingCollection] = useState<LibraryCollection | null>(null)
  const [deletingCollection, setDeletingCollection] = useState<LibraryCollection | null>(null)
  const [showCollectionDialog, setShowCollectionDialog] = useState(false)
  const [showImportLanguage, setShowImportLanguage] = useState(false)
  const [chapterImportSource, setChapterImportSource] = useState<ChapterImportSource>({ type: 'files' })
  const [isDragActive, setIsDragActive] = useState(false)
  const [languageSelections, setLanguageSelections] = useState<Record<string, ChapterLanguage | 'unassigned'>>({})
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isExportingCollection, setIsExportingCollection] = useState(false)
  const [isImportingCollection, setIsImportingCollection] = useState(false)
  const [isBackingUpLibrary, setIsBackingUpLibrary] = useState(false)
  const [isRestoringLibrary, setIsRestoringLibrary] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [updateActionPending, setUpdateActionPending] = useState(false)
  const [chapterPageCounts, setChapterPageCounts] = useState<Record<string, ChapterPageCount>>({})
  const booksRef = useRef<LibraryBook[]>([])
  const chapterPageCountCacheRef = useRef(new Map<string, Promise<ChapterPageCount>>())
  const openRequestRef = useRef(0)
  const dragDepthRef = useRef(0)
  const activeCollection = collections.find((collection) => collection.id === activeCollectionId)
  const visibleError = error || (uiLanguageLoadError ? t(uiLanguageLoadError) : '')

  useLayoutEffect(() => {
    booksRef.current = books
  }, [books])

  useEffect(() => {
    if (!window.yomu?.getUpdateState || !window.yomu.onUpdateState) return
    let active = true
    const unsubscribe = window.yomu.onUpdateState((state) => { if (active) setUpdateState(state) })
    window.yomu.getUpdateState()
      .then((state) => { if (active) setUpdateState(state) })
      .catch((reason: unknown) => { if (active) setError(t(reason instanceof Error ? reason.message : 'Impossible de charger les mises à jour.')) })
    return () => { active = false; unsubscribe() }
  }, [t])

  async function updateAction(action: () => Promise<void>) {
    setUpdateActionPending(true)
    try {
      await action()
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'L’opération de mise à jour a échoué.'))
    } finally {
      setUpdateActionPending(false)
    }
  }

  const saveLanguageVisibility = async (visibility: LanguageVisibility) => {
    if (!window.yomu) return
    setIsSavingLanguageVisibility(true)
    setError('')
    try {
      await window.yomu.setLanguageVisibility(visibility)
      setLanguageVisibility(visibility)
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Le réglage des langues visibles n’a pas pu être enregistré.'))
    } finally {
      setIsSavingLanguageVisibility(false)
    }
  }

  const saveUiLanguage = async (nextLanguage: UiLanguage) => {
    setIsSavingUiLanguage(true)
    setError('')
    try {
      await setLanguage(nextLanguage)
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Le réglage de langue de l’application n’a pas pu être enregistré.'))
    } finally {
      setIsSavingUiLanguage(false)
    }
  }

  const saveReaderShortcut = async (action: ReaderShortcutAction, key: string) => {
    if (!window.yomu) return
    const updated = { ...readerShortcuts, [action]: key }
    if (new Set(Object.values(updated)).size !== Object.keys(updated).length) {
      setError(t('Chaque raccourci doit utiliser une touche différente.'))
      return
    }
    setIsSavingReaderShortcuts(true)
    setError('')
    try {
      await window.yomu.setReaderShortcuts(updated)
      setReaderShortcuts(updated)
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Les raccourcis clavier n’ont pas pu être enregistrés.'))
    } finally {
      setIsSavingReaderShortcuts(false)
    }
  }

  const resetReaderShortcuts = async () => {
    setCapturingShortcut(null)
    if (!window.yomu) return
    setIsSavingReaderShortcuts(true)
    setError('')
    try {
      await window.yomu.setReaderShortcuts(DEFAULT_READER_SHORTCUTS)
      setReaderShortcuts(DEFAULT_READER_SHORTCUTS)
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Les raccourcis clavier n’ont pas pu être enregistrés.'))
    } finally {
      setIsSavingReaderShortcuts(false)
    }
  }

  const refreshLibrary = useCallback(async () => {
    if (!window.yomu) throw new Error(t('L’application Windows Yomu est nécessaire pour accéder à ton dossier.'))
    const stored = await window.yomu.loadLibrary()
    setBooks(stored.books.map(hydrateBook))
    setCollections(stored.collections.map((collection) => ({ ...collection, cover: null })))
  }, [t])

  useEffect(() => {
    let active = true
    const api = window.yomu
    if (!api) {
      Promise.resolve().then(() => {
        if (active) {
          setDesktopUnavailable(true)
          setIsStarting(false)
        }
      })
      return () => { active = false }
    }
    Promise.all([
      api.getLibraryRoot(),
      api.getLanguageVisibility().catch((reason: unknown) => {
        if (active) setError(t(reason instanceof Error ? reason.message : 'Les catégories de langue n’ont pas pu être chargées.'))
        return 'both' as const
      }),
      api.getReaderShortcuts().catch((reason: unknown) => {
        if (active) setError(t(reason instanceof Error ? reason.message : 'Les raccourcis clavier n’ont pas pu être chargés.'))
        return DEFAULT_READER_SHORTCUTS
      }),
    ])
      .then(async ([root, visibility, shortcuts]) => {
        if (!active) return
        setLanguageVisibility(visibility)
        setReaderShortcuts(shortcuts)
        setLibraryRoot(root)
        if (root) {
          const stored = await api.loadLibrary()
          if (active) {
            setBooks(stored.books.map(hydrateBook))
            setCollections(stored.collections.map((collection) => ({ ...collection, cover: null })))
          }
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(t(reason instanceof Error ? reason.message : 'La bibliothèque locale est inaccessible.'))
      })
      .finally(() => { if (active) setIsStarting(false) })
    return () => { active = false }
  }, [t])

  const chapterCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const book of books) counts.set(book.collectionId, (counts.get(book.collectionId) ?? 0) + 1)
    return counts
  }, [books])

  const collectionProgress = useMemo(() => {
    const totals = new Map<string, number>()
    for (const book of books) totals.set(book.collectionId, (totals.get(book.collectionId) ?? 0) + book.progress)
    return new Map([...totals].map(([collectionId, total]) => [
      collectionId,
      Math.round(total / (chapterCounts.get(collectionId) ?? 1)),
    ]))
  }, [books, chapterCounts])

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
    const normalizedQuery = query.trim().toLocaleLowerCase(language)
    return collections
      .filter((collection) => activeView === 'all' || collection.status === activeView)
      .filter((collection) => !normalizedQuery || `${collection.title} ${collection.kind} ${t(statusLabels[collection.status])}`.toLocaleLowerCase(language).includes(normalizedQuery))
      .sort((a, b) => {
        if (collectionSortOrder === 'title') return a.title.localeCompare(b.title, language)
        if (collectionSortOrder === 'chapters') return (chapterCounts.get(b.id) ?? 0) - (chapterCounts.get(a.id) ?? 0)
        if (collectionSortOrder === 'progress') {
          return (collectionProgress.get(b.id) ?? 0) - (collectionProgress.get(a.id) ?? 0)
            || a.title.localeCompare(b.title, language)
        }
        return b.createdAt - a.createdAt
      })
  }, [activeView, chapterCounts, collectionProgress, collections, language, query, collectionSortOrder, t])

  const allCollectionBooks = useMemo(
    () => books.filter((book) => book.collectionId === activeCollectionId)
      .sort((a, b) => chapterSortOrder === 'recent'
        ? b.addedAt - a.addedAt
        : compareChapters(a, b)),
    [activeCollectionId, books, chapterSortOrder],
  )
  const visibleLanguages: ChapterLanguage[] = languageVisibility === 'both' ? ['fr', 'en'] : [languageVisibility]
  const preferredLanguage = languageSelections[activeCollectionId]
  const hasUnassignedBooks = allCollectionBooks.some((book) => book.language === null)
  const selectedLanguage: ChapterLanguage | 'unassigned' =
    preferredLanguage === 'unassigned' && hasUnassignedBooks
      ? 'unassigned'
      : preferredLanguage && preferredLanguage !== 'unassigned'
          && (languageVisibility === 'both' || preferredLanguage === languageVisibility)
        ? preferredLanguage
        : languageVisibility === 'both'
          ? allCollectionBooks.some((book) => book.language === 'fr') ? 'fr'
            : allCollectionBooks.some((book) => book.language === 'en') ? 'en'
              : hasUnassignedBooks ? 'unassigned' : 'fr'
          : allCollectionBooks.some((book) => book.language === languageVisibility)
            ? languageVisibility
            : hasUnassignedBooks ? 'unassigned' : languageVisibility
  const collectionBooks = allCollectionBooks.filter((book) => selectedLanguage === 'unassigned' ? book.language === null : book.language === selectedLanguage)

  useEffect(() => {
    const api = window.yomu
    if (activeCollection?.kind !== 'Manga' || !api) return
    let active = true
    const loadPageCounts = async () => {
      for (const book of allCollectionBooks) {
        const format = book.format
        if (format === 'EPUB') continue
        const key = chapterPageCountKey(book, libraryRoot)
        let resultPromise = chapterPageCountCacheRef.current.get(key)
        if (!resultPromise) {
          resultPromise = (async () => {
            try {
              const bytes = await api.readAsset(book.relativePath)
              return { count: await countChapterPages(format, bytes) }
            } catch (reason) {
              console.error(`Impossible de compter les pages du chapitre « ${book.chapter || book.title} ».`, reason)
              return { error: reason instanceof Error ? reason.message : String(reason) }
            }
          })()
          chapterPageCountCacheRef.current.set(key, resultPromise)
        }
        const result = await resultPromise
        if (!active) return
        setChapterPageCounts((current) => current[key] ? current : { ...current, [key]: result })
      }
    }
    void loadPageCounts()
    return () => { active = false }
  }, [activeCollection?.id, activeCollection?.kind, allCollectionBooks, libraryRoot])

  const countableChapters = activeCollection?.kind === 'Manga'
    ? allCollectionBooks.filter((book) => book.format !== 'EPUB')
    : []
  const pendingPageCounts = countableChapters.some((book) => !chapterPageCounts[chapterPageCountKey(book, libraryRoot)])
  const unavailablePageCount = countableChapters.filter((book) => {
    const pageCount = chapterPageCounts[chapterPageCountKey(book, libraryRoot)]
    return pageCount !== undefined && 'error' in pageCount
  }).length
  const totalCountedPages = countableChapters.reduce((total, book) => {
    const pageCount = chapterPageCounts[chapterPageCountKey(book, libraryRoot)]
    return pageCount && 'count' in pageCount ? total + pageCount.count : total
  }, 0)
  const pageCountSummary = countableChapters.length === 0
    ? ''
    : pendingPageCounts
      ? t('Calcul du total des pages…')
      : `${t(totalCountedPages === 1 ? 'Total : {count} page' : 'Total : {count} pages', { count: totalCountedPages })}${unavailablePageCount ? ` · ${unavailablePageCount} ${t(unavailablePageCount === 1 ? 'chapitre non compté' : 'chapitres non comptés')}` : ''}`

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
    () => books.filter((book) => (book.language === null || languageVisibility === 'both' || book.language === languageVisibility)
      && book.progress < 100 && (book.progress > 0 || (book.lastOpenedAt !== null && book.readingPosition !== undefined)))
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0],
    [books, languageVisibility],
  )
  const continueCollection = collections.find((collection) => collection.id === continueBook?.collectionId)

  const importFiles = async (language: ChapterLanguage, source: ChapterImportSource) => {
    if (!activeCollection || !window.yomu) {
      setError(t('Ouvre une collection dans l’application Windows avant d’y ajouter des chapitres.'))
      return
    }
    setError('')
    setNotice('')
    setIsImporting(true)
    try {
      const imported = source.type === 'folder'
        ? await window.yomu.addChapterFolder(activeCollection.id, language)
        : source.type === 'drop'
          ? await window.yomu.addDroppedChapters(activeCollection.id, language, source.files)
          : await window.yomu.addChapters(activeCollection.id, language)
      if (imported.books.length > 0) {
        await refreshLibrary()
        setLanguageSelections((current) => ({ ...current, [activeCollection.id]: language }))
      }
      if (imported.books.length > 0 || imported.duplicatesSkipped > 0) {
        const addedSummary = imported.books.length === 0
          ? t('aucun chapitre ajouté')
          : t(imported.books.length === 1 ? '{count} chapitre ajouté' : '{count} chapitres ajoutés', { count: imported.books.length })
        const duplicatesSummary = imported.duplicatesSkipped === 0
          ? t('aucun doublon détecté')
          : t(imported.duplicatesSkipped === 1 ? '{count} doublon ignoré' : '{count} doublons ignorés', { count: imported.duplicatesSkipped })
        setNotice(t('Import terminé : {added}, {duplicates}.', { added: addedSummary, duplicates: duplicatesSummary }))
      }
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'L’import des chapitres a échoué.'))
    } finally {
      setIsImporting(false)
    }
  }

  const chooseChapterImportSource = (source: ChapterImportSource) => {
    setChapterImportSource(source)
    setShowImportLanguage(true)
  }

  const handleCollectionDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files') || isImporting) return
    event.preventDefault()
    dragDepthRef.current++
    setIsDragActive(true)
  }

  const handleCollectionDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragActive(false)
  }

  const handleCollectionDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files') || isImporting) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleCollectionDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0 && !isImporting && !showImportLanguage) {
      chooseChapterImportSource({ type: 'drop', files })
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
      setError(t(reason instanceof Error ? reason.message : 'La collection n’a pas pu être enregistrée.'))
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
      setError(t(reason instanceof Error ? reason.message : 'Les modifications du chapitre n’ont pas pu être enregistrées.'))
    }
  }

  const removeChapter = async (book: LibraryBook) => {
    if (!window.confirm(t('Retirer « {chapter} » de cette collection ? Le fichier stocké dans Yomu sera supprimé.', { chapter: book.chapter || book.title }))) return
    if (!window.yomu) return
    try {
      await window.yomu.deleteBook(book.id)
      setBooks((current) => current.filter((entry) => entry.id !== book.id))
      if (readerBook?.book.id === book.id) setReaderBook(null)
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Le chapitre n’a pas pu être supprimé.'))
    }
  }

  const removeCollection = async (collection: LibraryCollection) => {
    if (!window.yomu) throw new Error(t('L’application Windows Yomu est nécessaire pour supprimer une collection.'))
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
      if (archivePath) setNotice(t('Collection exportée : {path}', { path: archivePath }))
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'La collection n’a pas pu être exportée.'))
    } finally {
      setIsExportingCollection(false)
    }
  }

  const backupLibrary = async () => {
    if (!window.yomu) return
    setError('')
    setNotice('')
    setIsBackingUpLibrary(true)
    try {
      const archivePath = await window.yomu.backupLibrary()
      if (archivePath) setNotice(t('Sauvegarde créée : {path}', { path: archivePath }))
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'La bibliothèque n’a pas pu être sauvegardée.'))
    } finally {
      setIsBackingUpLibrary(false)
    }
  }

  const restoreLibraryBackup = async () => {
    if (!window.yomu) return
    setError('')
    setNotice('')
    setIsRestoringLibrary(true)
    try {
      const restoredRoot = await window.yomu.restoreLibraryBackup()
      if (!restoredRoot) return
      setIsStarting(true)
      setLibraryRoot(restoredRoot)
      setActiveCollectionId('')
      setBooks([])
      setCollections([])
      await refreshLibrary()
      setActiveView('all')
      setNotice(t('Sauvegarde restaurée dans : {path}', { path: restoredRoot }))
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'La bibliothèque n’a pas pu être restaurée.'))
    } finally {
      setIsStarting(false)
      setIsRestoringLibrary(false)
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
      try {
        await refreshLibrary()
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : String(reason)
        setError(t('La collection a été importée, mais la bibliothèque n’a pas pu être actualisée : {detail}', { detail }))
        return
      }
      setActiveCollectionId(imported.id)
      setActiveView('all')
      setIsSettingsOpen(false)
      const chaptersSummary = imported.chaptersAdded === 0
        ? t('aucun chapitre')
        : t(imported.chaptersAdded === 1 ? '{count} chapitre ajouté' : '{count} chapitres ajoutés', { count: imported.chaptersAdded })
      setNotice(t('Import terminé : 1 collection ajoutée, {chapters}, 0 élément ignoré, 0 erreur.', { chapters: chaptersSummary }))
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setError(t('Import ZIP échoué : 0 élément ajouté, 0 ignoré, 1 erreur. {detail}', { detail }))
    } finally {
      setIsImportingCollection(false)
    }
  }

  const openBook = async (book: LibraryBook) => {
    if (!window.yomu) {
      setError(t('Lance l’application Windows Yomu pour lire les chapitres.'))
      return
    }
    const collection = collections.find((entry) => entry.id === book.collectionId)
    if (!collection) {
      setError(t('La collection de ce chapitre est introuvable.'))
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
      if (request === openRequestRef.current) setError(t(reason instanceof Error ? reason.message : 'Le chapitre n’a pas pu être ouvert.'))
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
      setError(t(reason instanceof Error ? reason.message : 'La progression n’a pas pu être enregistrée.'))
    })
  }, [t])

  const chooseLibraryFolder = async () => {
    if (!window.yomu) return
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
      setError(t(reason instanceof Error ? reason.message : 'Le dossier de bibliothèque n’a pas pu être ouvert.'))
    } finally {
      setIsStarting(false)
    }
  }

  const retryLibraryFolder = async () => {
    if (!window.yomu) return
    setIsStarting(true)
    setError('')
    try {
      const root = await window.yomu.retryLibraryRoot()
      if (!root) {
        setError(t('Le dossier enregistré est toujours introuvable. Vérifie que le disque est connecté, puis réessaie ou choisis un autre dossier.'))
        return
      }
      const stored = await window.yomu.loadLibrary()
      setLibraryRoot(root)
      setBooks(stored.books.map(hydrateBook))
      setCollections(stored.collections.map((collection) => ({ ...collection, cover: null })))
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'La bibliothèque n’a pas pu être reconnectée.'))
    } finally {
      setIsStarting(false)
    }
  }

  const openLibraryFolder = async () => {
    if (!window.yomu) return
    try {
      await window.yomu.openLibraryRoot()
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Le dossier de bibliothèque n’a pas pu être ouvert.'))
    }
  }

  const openGitHub = async () => {
    if (!window.yomu) {
      setError(t('L’application Windows Yomu est nécessaire pour ouvrir GitHub.'))
      return
    }
    try {
      await window.yomu.openGitHub()
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : 'Le dépôt GitHub n’a pas pu être ouvert.'))
    }
  }

  const navItems: { id: LibraryView; icon: typeof Library }[] = [
    { id: 'all', icon: Library },
    { id: 'reading', icon: Clock3 },
    { id: 'to-read', icon: Bookmark },
    { id: 'paused', icon: MoreHorizontal },
    { id: 'completed', icon: CircleCheck },
  ]

  if (isUiLanguageLoading) {
    return <main className="folder-setup"><div className="reader-loading"><span>{t('Chargement de Yomu…')}</span></div></main>
  }

  if (readerBook) {
    return <Suspense fallback={<div className="reader-loading full-screen"><span>{t('Ouverture du lecteur…')}</span></div>}><Reader book={readerBook.book} collectionKind={readerBook.kind} previousChapter={previousReaderChapter} nextChapter={nextReaderChapter} onNavigateChapter={(book) => void openBook(book)} onClose={() => { openRequestRef.current++; setReaderBook(null) }} onProgress={updateProgress} error={visibleError} shortcuts={readerShortcuts} /></Suspense>
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
          <span className="eyebrow">{t('YOMU POUR WINDOWS')}</span>
          <h1>{t('Une application Windows est nécessaire.')}</h1>
          <p>{t('Cette version lit et enregistre tes fichiers directement dans un dossier de ton PC. Lance Yomu depuis son application Windows pour continuer.')}</p>
        </div>
      </main>
    )
  }

  if (isStarting) {
    return <main className="folder-setup"><div className="reader-loading"><span>{t('Ouverture de ta bibliothèque…')}</span></div></main>
  }

  if (!libraryRoot) {
    return (
      <main className="folder-setup">
        <div className="folder-setup-card">
          <div className="folder-setup-mark"><BookOpen size={24} /></div>
          <span className="eyebrow">{t('BIBLIOTHÈQUE INDISPONIBLE')}</span>
          <h1>{t('Ta bibliothèque est introuvable.')}</h1>
          <p>{t('Reconnecte le disque ou le support qui contient ta bibliothèque, puis réessaie. Tu peux aussi choisir un autre dossier et déplacer ou copier ta bibliothèque.')}</p>
          {visibleError && <p className="dialog-error" role="alert">{visibleError}</p>}
          <div className="folder-setup-actions">
            <button className="button-primary" onClick={() => void retryLibraryFolder()}><RotateCw size={16} /> {t('Réessayer la connexion')}</button>
            <button className="button-secondary" onClick={() => void chooseLibraryFolder()}><FolderOpen size={16} /> {t('Choisir un autre dossier')}</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-logo" href="#" aria-label={t('Retour à la bibliothèque')} onClick={(event) => { event.preventDefault(); setActiveCollectionId(''); setActiveView('all'); setIsSettingsOpen(false) }}>
          <img src={sidebarLogo} alt="" />
        </a>
        <div className="sidebar-label">{t('BIBLIOTHÈQUE')}</div>
        <nav className="main-nav" aria-label={t('Bibliothèque')}>
          {navItems.map(({ id, icon: Icon }) => (
            <button key={id} className={`nav-item ${activeView === id && !activeCollectionId && !isSettingsOpen ? 'active' : ''}`} onClick={() => { setActiveView(id); setActiveCollectionId(''); setIsSettingsOpen(false) }}>
              <Icon size={17} strokeWidth={1.8} /><span>{t(viewLabels[id])}</span><span className="nav-count">{counts[id]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-label series-label">{t('MES COLLECTIONS')} <span>{collections.length}</span></div>
        <nav className="series-nav" aria-label={t('Collections')}>
          {collections.length === 0 && <p className="sidebar-empty">{t('Vos collections apparaîtront ici.')}</p>}
          {collections.map((collection) => (
            <button key={collection.id} className={`series-item ${activeCollectionId === collection.id ? 'active' : ''}`} title={collection.title} onClick={() => { setActiveCollectionId(collection.id); setIsSettingsOpen(false) }}>
              <span className="series-dot" /><span className="series-name">{collection.title}</span><span className="nav-count">{chapterCounts.get(collection.id) ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-storage" title={t('Taille totale des chapitres de toutes les collections')}>
            <span>{t('Espace utilisé')}</span><strong>{formatSize(totalLibrarySize, language)}</strong>
          </div>
          <button
            className="nav-item sidebar-import"
            title={t('Importer une collection depuis un fichier ZIP')}
            onClick={() => void importCollection()}
            disabled={isImportingCollection}
          >
            <ArchiveRestore size={17} strokeWidth={1.8} /><span>{t(isImportingCollection ? 'Importation…' : 'Importer un ZIP')}</span>
          </button>
          <button
            className={`nav-item sidebar-settings${isSettingsOpen ? ' active' : ''}`}
            aria-current={isSettingsOpen ? 'page' : undefined}
            onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(true) }}
          >
            <Settings size={17} strokeWidth={1.8} /><span>{t('Paramètres')}</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(false); setActiveView('all') }}>{t('Bibliothèque')}</button>
            <span className="breadcrumb-slash">/</span>
            <strong>{isSettingsOpen ? t('Paramètres') : activeCollection?.title ?? t(viewLabels[activeView])}</strong>
          </div>
          <div className="topbar-right">
            {!isSettingsOpen && <div className="search-box">
              <Search size={16} />
              <input aria-label={t('Rechercher une collection')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Rechercher une collection...')} />
              <kbd>⌘ K</kbd>
              {query && <button className="search-clear" onClick={() => setQuery('')} aria-label={t('Effacer la recherche')}><X size={14} /></button>}
            </div>}
          </div>
        </header>

        <div className={`content-inner ${collections.length === 0 && !isSettingsOpen ? 'empty-library' : ''}`}>
          {visibleError && <div role="alert" className="error-banner"><span>{t(visibleError)}</span><button aria-label={t('Fermer')} onClick={() => setError('')}><X size={17} /></button></div>}
          {notice && <div role="status" className="success-banner"><span>{t(notice)}</span><button aria-label={t('Fermer')} onClick={() => setNotice('')}><X size={17} /></button></div>}
          {!isSettingsOpen && (updateState?.phase === 'available' || updateState?.phase === 'downloaded') && (
            <div role="status" className="success-banner">
              <span>{t(updateState.phase === 'downloaded' ? 'Une mise à jour de Yomu est prête à être installée.' : 'Une mise à jour de Yomu est disponible.')}</span>
              <button onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(true) }}>{t('Voir les paramètres')}</button>
            </div>
          )}
          {!isSettingsOpen && updateState?.phase === 'error' && (
            <div role="alert" className="error-banner">
              <span>{t('Erreur de mise à jour : {message}', { message: updateState.message })}</span>
              <button onClick={() => { setActiveCollectionId(''); setIsSettingsOpen(true) }}>{t('Voir les paramètres')}</button>
            </div>
          )}
          {isSettingsOpen ? (
            <section className="settings-page">
              <h1>{t('Paramètres')}</h1>
              <div className="settings-card settings-info-card">
                <div className="settings-card-copy">
                  <strong>{t('Informations')}</strong>
                  <span>{t('Yomu est une application pour organiser et lire tes mangas et manhwas directement sur ton PC.')}</span>
                  <span>{t('Créé par laserfuse')}</span>
                </div>
                <button className="button-secondary settings-github" onClick={() => void openGitHub()}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={siGithub.path} /></svg> {t('Voir le projet sur GitHub')}
                </button>
              </div>
              <div className="settings-card settings-updates">
                <div className="settings-update-heading">
                  <strong>{t('Mises à jour')}</strong>
                </div>
                <div className="settings-update-status">
                  <span className="settings-update-status-text" role={updateState?.phase === 'error' ? 'alert' : 'status'}>
                    {!updateState && t('Chargement des informations de mise à jour…')}
                    {updateState?.phase === 'unsupported' && t('Disponible uniquement dans l’application Windows installée.')}
                    {updateState?.phase === 'idle' && t('Aucune vérification effectuée.')}
                    {updateState?.phase === 'checking' && t('Vérification en cours…')}
                    {updateState?.phase === 'current' && t('Yomu est à jour.')}
                    {updateState?.phase === 'available' && t('Version {version} disponible.', { version: updateState.availableVersion })}
                    {updateState?.phase === 'downloading' && t('Téléchargement en cours : {progress} %', { progress: updateState.progress ?? 0 })}
                    {updateState?.phase === 'downloaded' && t('Version {version} prête à être installée.', { version: updateState.availableVersion })}
                    {updateState?.phase === 'error' && t('Impossible de mettre à jour Yomu : {message}', { message: updateState.message })}
                  </span>
                  {updateState?.phase === 'downloading' && (
                    <progress className="settings-update-progress" max={100} value={updateState.progress ?? 0} aria-label={t('Progression du téléchargement de la mise à jour')} />
                  )}
                  {['available', 'downloading', 'downloaded'].includes(updateState?.phase ?? '') && (
                    <details className="settings-update-notes">
                      <summary>{t('Notes de version')}</summary>
                      <p>{updateState?.releaseNotes ?? t('Aucune note de version fournie.')}</p>
                    </details>
                  )}
                  <div className="settings-update-actions">
                    <button className="button-secondary" disabled={!updateState?.supported || updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'downloaded' || updateActionPending}
                      onClick={() => { if (window.yomu) void updateAction(() => window.yomu!.checkForUpdates()) }}>{t('Vérifier les mises à jour')}</button>
                    {updateState?.phase === 'available' && <button className="button-primary" disabled={updateActionPending}
                      onClick={() => { if (window.yomu) void updateAction(() => window.yomu!.downloadUpdate()) }}>{t('Télécharger la mise à jour')}</button>}
                    {updateState?.phase === 'downloaded' && <button className="button-primary" disabled={updateActionPending}
                      onClick={() => { if (window.yomu) void updateAction(() => window.yomu!.installUpdate()) }}>{t('Installer et redémarrer')}</button>}
                  </div>
                </div>
                <div className="settings-update-preference">
                  <div className="settings-update-preference-copy">
                    <label className="settings-update-toggle">
                      <input type="checkbox" checked={updateState?.automatic ?? false}
                        disabled={!updateState?.supported || updateActionPending}
                        onChange={(event) => {
                          const automatic = event.target.checked
                          if (window.yomu) void updateAction(() => window.yomu!.setAutomaticUpdates(automatic))
                        }} />
                      {t('Vérification automatique au démarrage')}
                    </label>
                    <span>{t('Le téléchargement et l’installation nécessitent toujours ton accord.')}</span>
                  </div>
                  <code className="settings-version">{t('Version actuelle : v{version}', { version: updateState?.version ?? packageVersion })}</code>
                </div>
              </div>
              <div className="settings-card settings-language-preferences">
                <div className="settings-card-copy">
                  <strong>{t('Langue de l’application')}</strong>
                  <span>{t('Choisis la langue de l’interface de Yomu.')}</span>
                </div>
                <label className="settings-language-select">
                  <span>{t('Langue de l’application')}</span>
                  <select
                    aria-label={t('Langue de l’application')}
                    value={language}
                    disabled={isSavingUiLanguage}
                    onChange={(event) => void saveUiLanguage(event.target.value as UiLanguage)}
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
              <div className="settings-card settings-reader-shortcuts">
                <div className="settings-card-copy">
                  <strong>{t('Raccourcis clavier')}</strong>
                  <span>{t('Clique sur une touche puis appuie sur une touche du clavier pour modifier le raccourci. Les touches doivent être distinctes.')}</span>
                </div>
                <div className="settings-shortcut-list" role="group" aria-label={t('Raccourcis clavier')}>
                  {(Object.keys(readerShortcutLabels) as ReaderShortcutAction[]).map((action) => (
                    <div className="settings-shortcut-row" key={action}>
                      <span>{t(readerShortcutLabels[action])}</span>
                      <button
                        type="button"
                        className={`settings-shortcut-key${capturingShortcut === action ? ' capturing' : ''}`}
                        aria-label={t(capturingShortcut === action ? 'Appuie sur une touche pour {action}' : 'Modifier le raccourci : {action}', { action: t(readerShortcutLabels[action]) })}
                        disabled={isSavingReaderShortcuts}
                        onClick={() => setCapturingShortcut(capturingShortcut === action ? null : action)}
                        onKeyDown={(event) => {
                          if (capturingShortcut !== action || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
                          if (!isBindableReaderShortcut(event.key)) return
                          event.preventDefault()
                          event.stopPropagation()
                          setCapturingShortcut(null)
                          void saveReaderShortcut(action, event.key)
                        }}
                      >
                        {capturingShortcut === action
                          ? t('Appuie sur une touche…')
                          : displayReaderShortcut(readerShortcuts[action], language)}
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="button-secondary settings-shortcut-reset" disabled={isSavingReaderShortcuts}
                  onClick={() => void resetReaderShortcuts()}>{t('Rétablir les raccourcis par défaut')}</button>
              </div>
              <div className="settings-card settings-language-preferences">
                <div className="settings-card-copy">
                  <strong>{t('Catégories de langue')}</strong>
                  <span>{t('Choisis les langues visibles dans toutes les collections. Masquer une catégorie ne supprime aucun chapitre.')}</span>
                </div>
                <label className="settings-language-select">
                  <span>{t('Langues visibles')}</span>
                  <select
                    aria-label={t('Langues visibles dans les collections')}
                    value={languageVisibility}
                    disabled={isSavingLanguageVisibility}
                    onChange={(event) => void saveLanguageVisibility(event.target.value as LanguageVisibility)}
                  >
                    <option value="both">{t('Français et anglais')}</option>
                    <option value="fr">{t('Français seulement')}</option>
                    <option value="en">{t('Anglais seulement')}</option>
                  </select>
                </label>
              </div>
              <div className="settings-card">
                <div className="settings-card-copy">
                  <strong>{t('Dossier de bibliothèque')}</strong>
                  <span>{t('Emplacement actuel de tes collections et chapitres')}</span>
                  <code title={libraryRoot}>{libraryRoot}</code>
                </div>
                <button className="button-secondary" onClick={() => void chooseLibraryFolder()}>
                  <Pencil size={15} /> {t('Changer de dossier')}
                </button>
                <button className="button-secondary settings-open-folder" onClick={() => void openLibraryFolder()}>
                  <FolderOpen size={15} /> {t('Ouvrir dans l’Explorateur')}
                </button>
                <p className="settings-note">{t('Lors d’un changement, tu peux déplacer ou copier la bibliothèque, ou changer le chemin sans transfert.')}</p>
              </div>
              <div className="settings-card">
                <div className="settings-card-copy">
                  <strong>{t('Sauvegarde complète')}</strong>
                  <span>{t('Sauvegarde toutes les collections, leurs fichiers et les positions de lecture dans une archive ZIP.')}</span>
                  <span>{t('La restauration utilise un nouveau dossier vide et conserve la bibliothèque actuelle.')}</span>
                </div>
                <button className="button-secondary" onClick={() => void backupLibrary()} disabled={isBackingUpLibrary || isRestoringLibrary}>
                  <Archive size={15} /> {t(isBackingUpLibrary ? 'Sauvegarde en cours…' : 'Sauvegarder la bibliothèque')}
                </button>
                <button className="button-secondary" onClick={() => void restoreLibraryBackup()} disabled={isBackingUpLibrary || isRestoringLibrary}>
                  <ArchiveRestore size={15} /> {t(isRestoringLibrary ? 'Restauration en cours…' : 'Restaurer une sauvegarde')}
                </button>
              </div>
            </section>
          ) : activeCollection ? (
            <section
              className={`collection-detail${isDragActive ? ' collection-drop-active' : ''}`}
              onDragEnter={handleCollectionDragEnter}
              onDragLeave={handleCollectionDragLeave}
              onDragOver={handleCollectionDragOver}
              onDrop={handleCollectionDrop}
            >
              {isDragActive && <div className="collection-drop-overlay" role="status">{t('Dépose des fichiers PDF, CBZ ou EPUB ici pour les ajouter à cette collection.')}</div>}
              <button className="back-to-collections" onClick={() => setActiveCollectionId('')}><ArrowLeft size={15} /> {t('Toutes les collections')}</button>
              <div className="collection-detail-header">
                <CollectionCover collection={activeCollection} className="detail-cover" />
                <div className="collection-detail-info">
                  <div className="collection-badges"><span>{activeCollection.kind}</span><span className={`status-pill status-${activeCollection.status}`}>{t(statusLabels[activeCollection.status])}</span></div>
                  <h1>{activeCollection.title}</h1>
                  <p>{allCollectionBooks.length} {t(allCollectionBooks.length === 1 ? 'chapitre' : 'chapitres')} · {formatSize(collectionSizes.get(activeCollection.id) ?? 0, language)}{pageCountSummary && <> · {pageCountSummary}</>}</p>
                  <div className="detail-actions">
                    <button className="button-primary" onClick={() => chooseChapterImportSource({ type: 'files' })} disabled={isImporting}><Plus size={16} />{t(isImporting ? 'Import en cours…' : 'Ajouter des chapitres')}</button>
                    <button className="button-secondary" onClick={() => chooseChapterImportSource({ type: 'folder' })} disabled={isImporting}><FolderOpen size={15} />{t('Importer un dossier')}</button>
                    <button className="button-secondary" onClick={() => void exportCollection(activeCollection)} disabled={isExportingCollection}><Archive size={15} />{t(isExportingCollection ? 'Exportation…' : 'Exporter')}</button>
                    <button className="button-secondary" onClick={() => setEditingCollection(activeCollection)}><Pencil size={15} /> {t('Modifier')}</button>
                    <button className="icon-button delete-action" aria-label={t('Supprimer {title}', { title: activeCollection.title })} onClick={() => setDeletingCollection(activeCollection)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>

              <div className="chapter-section">
                <div className="language-filters" role="group" aria-label={t('Langue des chapitres')}>
                  {visibleLanguages.map((language) => (
                    <button key={language} type="button" className={`language-filter${selectedLanguage === language ? ' active' : ''}`}
                      aria-pressed={selectedLanguage === language} onClick={() => setLanguageSelections((current) => ({ ...current, [activeCollection.id]: language }))}>
                      <LanguageFlag language={language} /> {t(language === 'fr' ? 'Français' : 'Anglais')} <span>{allCollectionBooks.filter((book) => book.language === language).length}</span>
                    </button>
                  ))}
                  {allCollectionBooks.some((book) => book.language === null) && (
                    <button type="button" className={`language-filter${selectedLanguage === 'unassigned' ? ' active' : ''}`}
                      aria-pressed={selectedLanguage === 'unassigned'} onClick={() => setLanguageSelections((current) => ({ ...current, [activeCollection.id]: 'unassigned' }))}>
                      {t('À définir')} <span>{allCollectionBooks.filter((book) => book.language === null).length}</span>
                    </button>
                  )}
                </div>
                <div className="section-heading chapter-heading">
                  <div><span className="eyebrow">{t('DANS CETTE COLLECTION')}</span><h2>{t('Chapitres')} <span className="heading-count">{collectionBooks.length}</span></h2></div>
                  {collectionBooks.length > 0 && <label className="sort-control"><ArrowDownWideNarrow size={15} /><select aria-label={t('Trier les chapitres')} value={chapterSortOrder} onChange={(event) => setChapterSortOrder(event.target.value as ChapterSortOrder)}><option value="title">{t('Nom')}</option><option value="recent">{t('Ajout récent')}</option></select><ChevronDown size={14} /></label>}
                </div>
                {collectionBooks.length === 0 ? (
                  <div className="empty-chapters">
                    <div className="empty-chapters-icon"><FileText size={24} /></div>
                    <h2>{t('Pas encore de chapitres dans cette langue')}</h2>
                    <p>{t('Ajoute tes fichiers PDF, CBZ ou EPUB à cette collection.')}</p>
                    <div className="detail-actions">
                      <button className="button-primary" onClick={() => chooseChapterImportSource({ type: 'files' })} disabled={isImporting}><Plus size={16} /> {t('Ajouter des chapitres')}</button>
                      <button className="button-secondary" onClick={() => chooseChapterImportSource({ type: 'folder' })} disabled={isImporting}><FolderOpen size={15} /> {t('Importer un dossier')}</button>
                    </div>
                  </div>
                ) : (
                  <div className="chapter-list">
                    {collectionBooks.map((book, index) => {
                      const pageCount = book.format === 'EPUB'
                        ? undefined
                        : chapterPageCounts[chapterPageCountKey(book, libraryRoot)]
                      return (
                        <article className="chapter-row" key={book.id}>
                          <button className="chapter-number" onClick={() => void openBook(book)} aria-label={t('Lire {title}', { title: book.chapter || book.title })}>{chapterOrderLabel(book, index)}</button>
                          <button className="chapter-title" onClick={() => void openBook(book)}>
                            <strong>{book.chapter || book.title}</strong>
                            <span>
                              {book.format} · {formatSize(book.size, language)}
                              {activeCollection.kind === 'Manga' && book.format !== 'EPUB' && (
                                <> · {pageCount
                                  ? 'count' in pageCount
                                    ? `${pageCount.count} ${t(pageCount.count === 1 ? 'page' : 'pages')}`
                                    : <span className="chapter-page-count-error" title={pageCount.error}>{t('Nombre de pages indisponible')}</span>
                                  : t('Calcul…')}</>
                              )}
                            </span>
                          </button>
                          <div className="chapter-progress"><span className={book.progress > 0 ? 'chapter-progress-fill' : ''} style={{ width: `${book.progress}%` }} /></div>
                          <span className="chapter-progress-label">{book.progress ? `${book.progress}%` : t('À lire')}</span>
                          <div className="chapter-actions">
                            <button className="icon-button" aria-label={t('Modifier {title}', { title: book.chapter || book.title })} onClick={() => setEditingBook(book)}><Pencil size={14} /></button>
                            <button className="icon-button delete-action" aria-label={t('Supprimer {title}', { title: book.chapter || book.title })} onClick={() => void removeChapter(book)}><Trash2 size={14} /></button>
                          </div>
                        </article>
                      )
                    })}
                    <button className="add-chapter-row" onClick={() => chooseChapterImportSource({ type: 'files' })} disabled={isImporting}><Plus size={16} /> {t('Ajouter des chapitres à cette collection')}</button>
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
                  <span className="eyebrow"><Sparkles size={13} /> {t('COMMENCE PAR CRÉER UNE COLLECTION')}</span>
                  <h2>{t('Un univers à la fois.')}</h2>
                  <p>{t('Crée une collection pour ton manga ou manhwa, puis ajoute ses chapitres.')}</p>
                  <button className="button-primary empty-import" onClick={openCreateCollection}><Plus size={17} /> {t('Créer ma première collection')}</button>
                  <div className="supported-formats"><span>MANGA</span><i /><span>MANHWA</span></div>
                </section>
              ) : (
                <>
                  {!query && activeView === 'all' && continueBook && (
                    <section className="continue-section">
                      <div className="section-heading">
                        <div><span className="eyebrow">{t('REPRENDRE LÀ OÙ VOUS EN ÊTES')}</span><h2>{t('Continuer la lecture')}</h2></div>
                        <span className="section-caption">{t('Votre histoire vous attend')}</span>
                      </div>
                      <div className="continue-card">
                        {continueCollection
                          ? <CollectionCover collection={continueCollection} className="continue-cover" />
                          : <div className={`continue-cover cover-${continueBook.format.toLowerCase()}`}><span className="cover-format">{continueBook.format}</span><BookOpen size={40} strokeWidth={1.2} /></div>}
                        <div className="continue-info">
                          <span className="eyebrow">{continueBook.series}</span><h3>{continueBook.chapter || continueBook.title}</h3>
                          <p>{continueBook.format}</p>
                          <div className="progress-line"><span style={{ width: `${continueBook.progress}%` }} /></div>
                          <div className="continue-meta"><span>{t('{progress}% terminé', { progress: continueBook.progress })}</span><button onClick={() => void openBook(continueBook)}>{t('Continuer')} <span>→</span></button></div>
                        </div>
                      </div>
                    </section>
                  )}
                  <section className="library-section">
                    <div className="section-heading library-heading">
                      <div><span className="eyebrow">{t(activeView === 'all' ? 'VOTRE BIBLIOTHÈQUE' : 'COLLECTIONS FILTRÉES')}</span><h2>{t(viewLabels[activeView])} <span className="heading-count">{visibleCollections.length}</span></h2></div>
                      <label className="sort-control"><ArrowDownWideNarrow size={15} /><select aria-label={t('Trier les collections')} value={collectionSortOrder} onChange={(event) => setCollectionSortOrder(event.target.value as CollectionSortOrder)}><option value="recent">{t('Ajout récent')}</option><option value="title">{t('Titre')}</option><option value="chapters">{t('Nombre de chapitres')}</option><option value="progress">{t('Progression moyenne')}</option></select><ChevronDown size={14} /></label>
                    </div>
                    {visibleCollections.length === 0 ? (
                      <div className="no-results"><Search size={20} /><span>{t('Aucune collection ne correspond à cette recherche.')}</span><button onClick={() => { setQuery(''); setActiveView('all') }}>{t('Réinitialiser')}</button></div>
                    ) : (
                      <div className="collection-grid">
                        {visibleCollections.map((collection) => {
                          const chapterCount = chapterCounts.get(collection.id) ?? 0
                          return (
                            <article className="collection-card" key={collection.id}>
                              <button className="collection-card-open" onClick={() => setActiveCollectionId(collection.id)} aria-label={t('Ouvrir la collection {title}', { title: collection.title })}>
                                <CollectionCover collection={collection} />
                                <div className="collection-card-info">
                                  <div className="collection-card-kicker">{collection.kind}<span>·</span>{t(statusLabels[collection.status])}</div>
                                  <strong>{collection.title}</strong>
                                  <span>{chapterCount} {t(chapterCount === 1 ? 'chapitre' : 'chapitres')} · {formatSize(collectionSizes.get(collection.id) ?? 0, language)}</span>
                                </div>
                              </button>
                              <button className="icon-button collection-card-edit" aria-label={t('Modifier {title}', { title: collection.title })} onClick={() => setEditingCollection(collection)}><Pencil size={14} /></button>
                            </article>
                          )
                        })}
                        <button className="add-collection-card" onClick={openCreateCollection}><span className="add-book-icon"><Plus size={20} /></span><strong>{t('Créer une collection')}</strong><span>{t('Manga ou manhwa')}</span></button>
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
      {showImportLanguage && <ImportLanguageDialog onClose={() => setShowImportLanguage(false)} onChoose={(language) => { setShowImportLanguage(false); void importFiles(language, chapterImportSource) }} />}
      {deletingCollection && <DeleteCollectionDialog collection={deletingCollection} chapterCount={chapterCounts.get(deletingCollection.id) ?? 0} onClose={() => setDeletingCollection(null)} onConfirm={() => removeCollection(deletingCollection)} />}
    </div>
  )
}

export default function App() {
  return <UiLanguageProvider><AppContent /></UiLanguageProvider>
}
