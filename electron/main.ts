import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { MessageBoxOptions, OpenDialogOptions, SaveDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportCollectionArchive } from './collection-export.js'
import { importCollectionArchive } from './collection-import.js'
import { createLibraryBackupArchive, restoreLibraryBackupArchive } from './library-backup.js'
import { withCollectionWriteLock } from './collection-lock.js'
import { collectChapterFiles, filterDuplicateChapterFiles } from './chapter-import.js'
import { copyLibraryContents } from './library-transfer.js'
import { readLockedPdfZoom, writeLockedPdfZoom } from './reading-settings.js'
import { initializeLibraryRoot, retryLibraryRoot, saveLibraryRoot } from './library-root.js'
import { isLanguageVisibility, readLanguageVisibility, saveLanguageVisibility } from './language-settings.js'
import { isReaderShortcuts } from './reader-shortcuts.js'
import { readReaderShortcuts, saveReaderShortcuts } from './reader-shortcut-settings.js'
import { isUiLanguage, readUiLanguage, saveUiLanguage } from './ui-language.js'
import { validReadingPosition } from './reading-position.js'
import type { ReadingPosition } from './reading-position.js'
import electronUpdater from 'electron-updater'
import { UpdateManager } from './updates.js'

type CollectionKind = 'Manga' | 'Manhwa'
type CollectionStatus = 'to-read' | 'reading' | 'paused' | 'completed'
type BookFormat = 'PDF' | 'CBZ' | 'EPUB'
type ChapterLanguage = 'fr' | 'en'

interface CollectionRecord {
  id: string
  title: string
  kind: CollectionKind
  status: CollectionStatus
  createdAt: number
  folderName: string
  coverPath: string | null
}

interface BookRecord {
  id: string
  collectionId: string
  title: string
  series: string
  chapter: string
  language: ChapterLanguage | null
  format: BookFormat
  fileName: string
  relativePath: string
  size: number
  addedAt: number
  lastOpenedAt: number | null
  progress: number
  readingPosition?: ReadingPosition
}

interface CollectionDirectory {
  collection: CollectionRecord
  books: BookRecord[]
}

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const e2eProfilePath = process.env.YOMU_E2E_PROFILE
if (e2eProfilePath && app.isPackaged) {
  throw new Error('Le profil de test de bout en bout ne peut être utilisé qu’en développement.')
}
if (e2eProfilePath) {
  const profilePath = path.resolve(e2eProfilePath)
  app.setPath('appData', profilePath)
  app.setPath('userData', path.join(profilePath, app.getName()))
} else if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-installed`))
}
const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const languageSettingsPath = path.join(app.getPath('userData'), 'language-settings.json')
const uiLanguageSettingsPath = path.join(app.getPath('userData'), 'ui-language.json')
const readerShortcutsSettingsPath = path.join(app.getPath('userData'), 'reader-shortcuts.json')
const collectionLockDirectory = path.join(app.getPath('appData'), 'Yomu', 'collection-locks')
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
const LIBRARY_ROOT_LOCK_ID = '__yomu_library_root__'
let libraryRoot: string | null = null

async function dialogText(french: string, english: string): Promise<string> {
  return await readUiLanguage(uiLanguageSettingsPath) === 'en' ? english : french
}

async function showMessageBox(options: MessageBoxOptions) {
  return mainWindow
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validCollection(value: unknown): value is CollectionRecord {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.kind === 'Manga' || value.kind === 'Manhwa')
    && ['to-read', 'reading', 'paused', 'completed'].includes(String(value.status))
    && typeof value.createdAt === 'number'
    && typeof value.folderName === 'string'
    && (value.coverPath === null || typeof value.coverPath === 'string')
}

function validBook(value: unknown): value is BookRecord {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.collectionId === 'string'
    && typeof value.title === 'string'
    && typeof value.series === 'string'
    && typeof value.chapter === 'string'
    && (value.language === undefined || value.language === null || value.language === 'fr' || value.language === 'en')
    && ['PDF', 'CBZ', 'EPUB'].includes(String(value.format))
    && typeof value.fileName === 'string'
    && typeof value.relativePath === 'string'
    && typeof value.size === 'number'
    && typeof value.addedAt === 'number'
    && (typeof value.lastOpenedAt === 'number' || value.lastOpenedAt === null)
    && typeof value.progress === 'number' && Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 100
    && validReadingPosition(value.readingPosition, value.format)
}

function requireRoot(): string {
  if (!libraryRoot) throw new Error('Choisis d’abord un dossier pour ta bibliothèque Yomu.')
  return libraryRoot
}

function safePath(relativePath: string): string {
  const root = path.resolve(requireRoot())
  const target = path.resolve(root, relativePath)
  const fromRoot = path.relative(root, target)
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error('Le chemin demandé est hors de la bibliothèque Yomu.')
  }
  return target
}

function slug(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  return normalized.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'collection'
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

async function readCollectionDirectory(folderName: string): Promise<CollectionDirectory | null> {
  const collectionDirectory = safePath(folderName)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8'))
  } catch (reason) {
    if (isRecord(reason) && reason.code === 'ENOENT') return null
    throw reason
  }
  if (!isRecord(parsed) || !validCollection(parsed.collection) || !Array.isArray(parsed.books)) {
    throw new Error(`Le fichier collection.json est invalide dans « ${folderName} ».`)
  }
  const collection = parsed.collection
  if (collection.folderName !== folderName) {
    throw new Error(`Le dossier de « ${collection.title} » ne correspond pas à ses métadonnées.`)
  }
  const books = parsed.books.filter(validBook)
  if (books.length !== parsed.books.length) {
    throw new Error(`Un chapitre a des métadonnées invalides dans « ${collection.title} ».`)
  }
  for (const book of books) {
    if (book.collectionId !== collection.id) throw new Error(`Un chapitre n’appartient pas à « ${collection.title} ».`)
    await stat(safePath(book.relativePath))
  }
  if (collection.coverPath) await stat(safePath(collection.coverPath))
  return { collection, books: books.map((book) => ({ ...book, language: book.language ?? null })) }
}

async function saveCollectionDirectory(directory: CollectionDirectory): Promise<void> {
  const target = safePath(directory.collection.folderName)
  await mkdir(path.join(target, 'Chapitres'), { recursive: true })
  await writeJson(path.join(target, 'collection.json'), directory)
}

async function loadLibrary(): Promise<{ collections: CollectionRecord[]; books: BookRecord[] }> {
  const root = requireRoot()
  await mkdir(root, { recursive: true })
  const entries = await readdir(root, { withFileTypes: true })
  const folders = entries.filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
  const directories = await Promise.all(folders.map((entry) => readCollectionDirectory(entry.name)))
  const valid = directories.filter((directory): directory is CollectionDirectory => directory !== null)
  return {
    collections: valid.map((directory) => directory.collection),
    books: valid.flatMap((directory) => directory.books),
  }
}

async function withCollectionWriteLocks<T>(
  root: string,
  collectionIds: string[],
  index: number,
  operation: () => Promise<T>,
): Promise<T> {
  if (index >= collectionIds.length) return operation()
  return withCollectionWriteLock(collectionLockDirectory, root, collectionIds[index], () =>
    withCollectionWriteLocks(root, collectionIds, index + 1, operation),
  )
}

async function withLibraryTransferLocks<T>(root: string, operation: () => Promise<T>): Promise<T> {
  return withCollectionWriteLock(collectionLockDirectory, root, LIBRARY_ROOT_LOCK_ID, async () => {
    const collectionIds = (await loadLibrary()).collections.map((collection) => collection.id).sort()
    return withCollectionWriteLocks(root, collectionIds, 0, operation)
  })
}

function parseChapterTitle(fileName: string): { title: string; chapter: string } {
  const title = path.parse(fileName).name.replace(/[_]+/g, ' ').trim()
  const match = title.match(/(?:chapter|chapitre|ch\.?|episode|ep\.?|tome|volume|vol\.?)\s*[-_#.]?\s*\d+(?:[.,]\d+)?/i)
  const chapter = match?.[0].replace(/[ \t]+/g, ' ').trim() ?? title
  return { title, chapter }
}

async function chooseLibraryRoot(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: await dialogText('Choisis le dossier de ta bibliothèque Yomu', 'Choose your Yomu library folder'),
    properties: ['openDirectory', 'createDirectory'],
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  const selectedRoot = path.resolve(result.filePaths[0])
  const previousRoot = libraryRoot
  const sameRoot = previousRoot !== null
    && path.resolve(previousRoot).toLowerCase() === selectedRoot.toLowerCase()
  if (previousRoot && !sameRoot) {
    const choice = await showMessageBox({
      type: 'question',
      title: await dialogText('Changer de bibliothèque', 'Change library'),
      message: await dialogText(
        'Que veux-tu faire avec la bibliothèque actuelle ?',
        'What would you like to do with the current library?',
      ),
      detail: await dialogText(
        'Copier conserve l’ancienne bibliothèque. Déplacer vérifie la copie avant de supprimer l’ancien dossier. Changer le chemin seul ne transfère aucun fichier.',
        'Copy keeps the old library. Move verifies the copy before removing the old folder. Changing the path alone does not transfer files.',
      ),
      buttons: [
        await dialogText('Copier la bibliothèque', 'Copy library'),
        await dialogText('Déplacer la bibliothèque', 'Move library'),
        await dialogText('Changer le chemin seulement', 'Change path only'),
        await dialogText('Annuler', 'Cancel'),
      ],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    })
    if (choice.response === 3) return null
    if (choice.response === 0 || choice.response === 1) {
      const move = choice.response === 1
      await mkdir(selectedRoot, { recursive: true })
      await withLibraryTransferLocks(previousRoot, async () => {
        await copyLibraryContents(previousRoot, selectedRoot)
        await saveLibraryRoot(settingsPath, selectedRoot)
        libraryRoot = selectedRoot
        if (move) {
          try {
            await rm(previousRoot, { recursive: true })
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : String(reason)
            await showMessageBox({
              type: 'warning',
              title: await dialogText('Bibliothèque déplacée avec un avertissement', 'Library moved with a warning'),
              message: await dialogText(
                'La nouvelle bibliothèque est active, mais l’ancien dossier n’a pas pu être entièrement supprimé.',
                'The new library is active, but the old folder could not be fully removed.',
              ),
              detail: message,
              buttons: [await dialogText('OK', 'OK')],
            })
          }
        }
      })
      return selectedRoot
    }
  }
  await mkdir(selectedRoot, { recursive: true })
  await saveLibraryRoot(settingsPath, selectedRoot)
  libraryRoot = selectedRoot
  return selectedRoot
}

async function saveCollection(
  input: Omit<CollectionRecord, 'folderName' | 'coverPath'> & { folderName?: string; coverPath?: string | null },
  coverBytes: Uint8Array | null,
  coverName: string | null,
  removeCover: boolean,
): Promise<CollectionRecord> {
  return withCollectionWriteLock(collectionLockDirectory, requireRoot(), input.id, async () => {
  if (!input.title.trim()) throw new Error('Le titre de la collection est obligatoire.')
  const existingFolder = input.folderName || undefined
  const previous = existingFolder ? await readCollectionDirectory(existingFolder) : null
  if (existingFolder && previous?.collection.id !== input.id) {
    throw new Error('Cette collection ne correspond pas au dossier sélectionné.')
  }
  const folderName = existingFolder ?? `${slug(input.title)}-${input.id.slice(0, 8)}`
  const directory = safePath(folderName)
  await mkdir(path.join(directory, 'Chapitres'), { recursive: true })

  let coverPath = input.coverPath ?? null
  if (coverBytes) {
    const extension = path.extname(coverName ?? '').toLowerCase()
    const safeExtension = IMAGE_EXTENSIONS.has(extension) ? extension : '.png'
    const relativeCoverPath = path.join(folderName, `couverture${safeExtension}`)
    await writeFile(safePath(relativeCoverPath), coverBytes)
    coverPath = relativeCoverPath
  } else if (removeCover && coverPath) {
    await rm(safePath(coverPath), { force: true })
    coverPath = null
  }

  const collection: CollectionRecord = {
    id: input.id,
    title: input.title.trim(),
    kind: input.kind,
    status: input.status,
    createdAt: input.createdAt,
    folderName,
    coverPath,
  }

  const books = previous?.books ?? []
  for (const book of books) book.series = collection.title
  const targetFolderName = `${slug(collection.title)}-${collection.id.slice(0, 8)}`
  let finalCollection = collection
  if (existingFolder && targetFolderName !== existingFolder) {
    const renamedPath = safePath(targetFolderName)
    await rename(directory, renamedPath)
    finalCollection = {
      ...collection,
      folderName: targetFolderName,
      coverPath: coverPath ? path.join(targetFolderName, path.basename(coverPath)) : null,
    }
    for (const book of books) book.relativePath = path.join(targetFolderName, 'Chapitres', path.basename(book.relativePath))
  }
  await saveCollectionDirectory({ collection: finalCollection, books })
  if (previous?.collection.coverPath && previous.collection.coverPath !== finalCollection.coverPath) {
    await rm(safePath(previous.collection.coverPath), { force: true })
  }
  return finalCollection
  })
}

type ChapterImportResult = { books: BookRecord[]; duplicatesSkipped: number }

async function addChapterPaths(
  collectionId: string,
  language: ChapterLanguage,
  sourcePaths: string[],
): Promise<ChapterImportResult> {
  const library = await loadLibrary()
  const collection = library.collections.find((entry) => entry.id === collectionId)
  if (!collection) throw new Error('Cette collection est introuvable.')

  const supportedSources = await collectChapterFiles(sourcePaths)
  return withCollectionWriteLock(collectionLockDirectory, requireRoot(), collectionId, async () => {
    const latestLibrary = await loadLibrary()
    const latestCollection = latestLibrary.collections.find((entry) => entry.id === collectionId)
    if (!latestCollection) throw new Error('Cette collection est introuvable.')
    const chaptersDirectory = safePath(path.join(latestCollection.folderName, 'Chapitres'))
    await mkdir(chaptersDirectory, { recursive: true })
    const collectionDirectory = await readCollectionDirectory(latestCollection.folderName)
    if (!collectionDirectory) throw new Error('Le dossier de cette collection est introuvable.')
    const { filesToImport, duplicatesSkipped } = await filterDuplicateChapterFiles(
      collectionDirectory.books.map((book) => safePath(book.relativePath)),
      supportedSources,
    )
    const imported: BookRecord[] = []

    for (const sourcePath of filesToImport) {
      const sourceName = path.basename(sourcePath)
      const extension = path.extname(sourceName).toLowerCase()
      const format = extension === '.pdf' ? 'PDF' : extension === '.cbz' ? 'CBZ' : extension === '.epub' ? 'EPUB' : null
      if (!format) continue
      const id = randomUUID()
      const relativePath = path.join(latestCollection.folderName, 'Chapitres', `${id}${extension}`)
      await copyFile(sourcePath, safePath(relativePath))
      const fileStat = await stat(safePath(relativePath))
      const { title, chapter } = parseChapterTitle(sourceName)
      imported.push({
        id,
        collectionId,
        title,
        series: latestCollection.title,
        chapter,
        language,
        format,
        fileName: sourceName,
        relativePath,
        size: fileStat.size,
        addedAt: Date.now(),
        lastOpenedAt: null,
        progress: 0,
      })
    }

    if (imported.length > 0) {
      await saveCollectionDirectory({ collection: latestCollection, books: [...collectionDirectory.books, ...imported] })
    }
    return { books: imported, duplicatesSkipped }
  })
}

async function addChapters(
  collectionId: string,
  language: ChapterLanguage,
): Promise<ChapterImportResult> {
  const collection = (await loadLibrary()).collections.find((entry) => entry.id === collectionId)
  if (!collection) throw new Error('Cette collection est introuvable.')
  const options: OpenDialogOptions = {
    title: await dialogText(`Ajouter des chapitres à ${collection.title}`, `Add chapters to ${collection.title}`),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: await dialogText('Chapitres Yomu', 'Yomu chapters'), extensions: ['pdf', 'cbz', 'epub'] }],
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { books: [], duplicatesSkipped: 0 }
  return addChapterPaths(collectionId, language, result.filePaths)
}

async function addChapterFolder(
  collectionId: string,
  language: ChapterLanguage,
): Promise<ChapterImportResult> {
  const collection = (await loadLibrary()).collections.find((entry) => entry.id === collectionId)
  if (!collection) throw new Error('Cette collection est introuvable.')
  const options: OpenDialogOptions = {
    title: await dialogText(`Choisis un dossier de chapitres pour ${collection.title}`, `Choose a chapter folder for ${collection.title}`),
    properties: ['openDirectory'],
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { books: [], duplicatesSkipped: 0 }
  return addChapterPaths(collectionId, language, result.filePaths)
}

let mainWindow: BrowserWindow | null = null
const { autoUpdater } = electronUpdater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
const updates = new UpdateManager(
  autoUpdater,
  path.join(app.getPath('userData'), 'updates.json'),
  app.getVersion(),
  app.isPackaged && process.platform === 'win32',
  (state) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:state', state) },
)
autoUpdater.on('error', (reason) => updates.reportError(reason))
autoUpdater.on('download-progress', (progress) => updates.progress(progress.percent))

function registerHandlers() {
  ipcMain.handle('app:open-github', () => shell.openExternal('https://github.com/laserfuse/Yomu'))
  ipcMain.handle('updates:get', () => updates.snapshot())
  ipcMain.handle('updates:set-automatic', async (_event, automatic: unknown) => {
    if (typeof automatic !== 'boolean') throw new Error('Le réglage de mise à jour est invalide.')
    await updates.setAutomatic(automatic)
    const phase = updates.snapshot().phase
    if (automatic && phase !== 'downloaded' && phase !== 'checking' && phase !== 'downloading') await updates.check()
  })
  ipcMain.handle('updates:check', () => updates.check())
  ipcMain.handle('updates:download', () => updates.download())
  ipcMain.handle('updates:install', () => updates.install())
  ipcMain.handle('preferences:get-language-visibility', () => readLanguageVisibility(languageSettingsPath))
  ipcMain.handle('preferences:set-language-visibility', async (_event, visibility: unknown) => {
    if (!isLanguageVisibility(visibility)) throw new Error('Le réglage des langues visibles est invalide.')
    await saveLanguageVisibility(languageSettingsPath, visibility)
  })
  ipcMain.handle('preferences:get-ui-language', () => readUiLanguage(uiLanguageSettingsPath))
  ipcMain.handle('preferences:set-ui-language', async (_event, language: unknown) => {
    if (!isUiLanguage(language)) throw new Error('Le réglage de langue de l’application est invalide.')
    await saveUiLanguage(uiLanguageSettingsPath, language)
  })
  ipcMain.handle('preferences:get-reader-shortcuts', () => readReaderShortcuts(readerShortcutsSettingsPath))
  ipcMain.handle('preferences:set-reader-shortcuts', async (_event, shortcuts: unknown) => {
    if (!isReaderShortcuts(shortcuts)) throw new Error('Les raccourcis clavier sont invalides.')
    await saveReaderShortcuts(readerShortcutsSettingsPath, shortcuts)
  })
  ipcMain.handle('library:get-root', () => libraryRoot)
  ipcMain.handle('library:choose-root', () => chooseLibraryRoot())
  ipcMain.handle('library:retry-root', async () => {
    libraryRoot = await retryLibraryRoot(settingsPath)
    return libraryRoot
  })
  ipcMain.handle('library:open-root', async () => {
    const openError = await shell.openPath(requireRoot())
    if (openError) throw new Error(`Le dossier de bibliothèque n’a pas pu être ouvert : ${openError}`)
  })
  ipcMain.handle('library:backup', async () => {
    const root = requireRoot()
    const date = new Date().toISOString().replace(/[:.]/g, '-')
    const options: SaveDialogOptions = {
      title: await dialogText('Sauvegarder toute la bibliothèque Yomu', 'Back up your entire Yomu library'),
      defaultPath: path.join(app.getPath('downloads'), `Yomu-backup-${date}.zip`),
      filters: [{ name: await dialogText('Sauvegarde Yomu', 'Yomu backup'), extensions: ['zip'] }],
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await withLibraryTransferLocks(root, () => createLibraryBackupArchive(root, result.filePath))
    return result.filePath
  })
  ipcMain.handle('library:restore-backup', async () => {
    const archiveOptions: OpenDialogOptions = {
      title: await dialogText('Choisis une sauvegarde complète Yomu', 'Choose a complete Yomu backup'),
      properties: ['openFile'],
      filters: [{ name: await dialogText('Sauvegarde Yomu', 'Yomu backup'), extensions: ['zip'] }],
    }
    const archiveResult = mainWindow
      ? await dialog.showOpenDialog(mainWindow, archiveOptions)
      : await dialog.showOpenDialog(archiveOptions)
    if (archiveResult.canceled || !archiveResult.filePaths[0]) return null

    const destinationOptions: OpenDialogOptions = {
      title: await dialogText('Choisis un nouveau dossier vide pour la restauration', 'Choose a new empty folder for the restore'),
      properties: ['openDirectory', 'createDirectory'],
    }
    const destinationResult = mainWindow
      ? await dialog.showOpenDialog(mainWindow, destinationOptions)
      : await dialog.showOpenDialog(destinationOptions)
    if (destinationResult.canceled || !destinationResult.filePaths[0]) return null

    const root = requireRoot()
    const destinationRoot = path.resolve(destinationResult.filePaths[0])
    return withLibraryTransferLocks(root, async () => {
      await restoreLibraryBackupArchive(archiveResult.filePaths[0], destinationRoot, root)
      await saveLibraryRoot(settingsPath, destinationRoot)
      libraryRoot = destinationRoot
      return destinationRoot
    })
  })
  ipcMain.handle('library:export-collection', async (_event, collectionId: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    const collection = (await loadLibrary()).collections.find((entry) => entry.id === collectionId)
    if (!collection) throw new Error('Cette collection est introuvable.')

    const sourceDirectory = safePath(collection.folderName)
    const options: SaveDialogOptions = {
      title: await dialogText(`Exporter « ${collection.title} »`, `Export “${collection.title}”`),
      defaultPath: path.join(app.getPath('downloads'), `${slug(collection.title)}.zip`),
      filters: [{ name: await dialogText('Archive ZIP', 'ZIP archive'), extensions: ['zip'] }],
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null

    await exportCollectionArchive(sourceDirectory, result.filePath, path.basename(sourceDirectory))
    return result.filePath
  })
  ipcMain.handle('library:import-collection', async () => {
    const options: OpenDialogOptions = {
      title: await dialogText('Choisis une archive ZIP de collection Yomu', 'Choose a Yomu collection ZIP archive'),
      properties: ['openFile'],
      filters: [{ name: await dialogText('Archive ZIP', 'ZIP archive'), extensions: ['zip'] }],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const root = requireRoot()
    return withCollectionWriteLock(collectionLockDirectory, root, LIBRARY_ROOT_LOCK_ID, () =>
      importCollectionArchive(result.filePaths[0], root),
    )
  })
  ipcMain.handle('library:load', () => loadLibrary())
  ipcMain.handle('library:get-pdf-zoom', async (_event, collectionId: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    const collection = (await loadLibrary()).collections.find((entry) => entry.id === collectionId)
    if (!collection) throw new Error('Cette collection est introuvable.')
    return readLockedPdfZoom(safePath(collection.folderName))
  })
  ipcMain.handle('library:set-pdf-zoom', async (_event, collectionId: unknown, zoom: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    if (zoom !== null && typeof zoom !== 'number') throw new Error('La valeur du zoom est invalide.')
    const collection = (await loadLibrary()).collections.find((entry) => entry.id === collectionId)
    if (!collection) throw new Error('Cette collection est introuvable.')
    await withCollectionWriteLock(collectionLockDirectory, requireRoot(), collectionId, () => writeLockedPdfZoom(safePath(collection.folderName), zoom))
  })
  ipcMain.handle('library:save-collection', (_event, collection, coverBytes, coverName, removeCover) => {
    if (!isRecord(collection) || typeof collection.id !== 'string'
      || typeof collection.title !== 'string'
      || (collection.kind !== 'Manga' && collection.kind !== 'Manhwa')
      || !['to-read', 'reading', 'paused', 'completed'].includes(String(collection.status))
      || typeof collection.createdAt !== 'number'
      || (collection.folderName !== undefined && typeof collection.folderName !== 'string')
      || (collection.coverPath !== undefined && collection.coverPath !== null && typeof collection.coverPath !== 'string')
      || (coverBytes !== null && !(coverBytes instanceof Uint8Array))
      || (coverName !== null && typeof coverName !== 'string')
      || typeof removeCover !== 'boolean') {
      throw new Error('Les informations de cette collection sont invalides.')
    }
    const save = () => saveCollection(
      collection as unknown as Omit<CollectionRecord, 'folderName' | 'coverPath'> & { folderName?: string; coverPath?: string | null },
      coverBytes as Uint8Array | null,
      coverName as string | null,
      removeCover,
    )
    if (typeof collection.folderName === 'string') return save()
    const root = requireRoot()
    return withCollectionWriteLock(collectionLockDirectory, root, LIBRARY_ROOT_LOCK_ID, save)
  })
  ipcMain.handle('library:delete-collection', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Identifiant de collection invalide.')
    const root = requireRoot()
    await withCollectionWriteLock(collectionLockDirectory, root, LIBRARY_ROOT_LOCK_ID, () =>
      withCollectionWriteLock(collectionLockDirectory, root, id, async () => {
        const library = await loadLibrary()
        const collection = library.collections.find((entry) => entry.id === id)
        if (!collection) return
        await rm(safePath(collection.folderName), { recursive: true, force: true })
      }),
    )
  })
  ipcMain.handle('library:add-chapters', (_event, collectionId: unknown, language: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    if (language !== 'fr' && language !== 'en') throw new Error('La langue des chapitres est invalide.')
    return addChapters(collectionId, language)
  })
  ipcMain.handle('library:add-chapter-folder', (_event, collectionId: unknown, language: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    if (language !== 'fr' && language !== 'en') throw new Error('La langue des chapitres est invalide.')
    return addChapterFolder(collectionId, language)
  })
  ipcMain.handle('library:add-dropped-chapters', (_event, collectionId: unknown, language: unknown, sourcePaths: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    if (language !== 'fr' && language !== 'en') throw new Error('La langue des chapitres est invalide.')
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0
      || sourcePaths.some((sourcePath) => typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath))) {
      throw new Error('Les chemins des fichiers déposés sont invalides.')
    }
    return addChapterPaths(collectionId, language, sourcePaths)
  })
  ipcMain.handle('library:update-book', async (_event, input: unknown) => {
    if (!validBook(input)) throw new Error('Les informations de ce chapitre sont invalides.')
    await withCollectionWriteLock(collectionLockDirectory, requireRoot(), input.collectionId, async () => {
      const library = await loadLibrary()
      const directory = library.collections.find((entry) => entry.id === input.collectionId)
      if (!directory) throw new Error('La collection de ce chapitre est introuvable.')
      const collectionDirectory = await readCollectionDirectory(directory.folderName)
      if (!collectionDirectory) throw new Error('Le dossier de cette collection est introuvable.')
      const books = collectionDirectory.books.map((book) => book.id === input.id ? input : book)
      if (!books.some((book) => book.id === input.id)) throw new Error('Ce chapitre est introuvable.')
      await saveCollectionDirectory({ collection: directory, books })
    })
  })
  ipcMain.handle('library:delete-book', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Identifiant de chapitre invalide.')
    const library = await loadLibrary()
    for (const collection of library.collections) {
      if (!library.books.some((book) => book.id === id && book.collectionId === collection.id)) continue
      await withCollectionWriteLock(collectionLockDirectory, requireRoot(), collection.id, async () => {
        const latestLibrary = await loadLibrary()
        const latestCollection = latestLibrary.collections.find((entry) => entry.id === collection.id)
        if (!latestCollection) return
        const directory = await readCollectionDirectory(latestCollection.folderName)
        if (!directory) return
        const book = directory.books.find((entry) => entry.id === id)
        if (!book) return
        await rm(safePath(book.relativePath), { force: true })
        await saveCollectionDirectory({ collection: latestCollection, books: directory.books.filter((entry) => entry.id !== id) })
      })
      return
    }
  })
  ipcMain.handle('library:read-asset', async (_event, relativePath: unknown) => {
    if (typeof relativePath !== 'string') throw new Error('Chemin de fichier invalide.')
    return new Uint8Array(await readFile(safePath(relativePath)))
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 850,
    minHeight: 640,
    icon: path.join(appDirectory, '..', 'dist', 'yomu-app.ico'),
    backgroundColor: '#f5f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(appDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) await mainWindow.loadURL(devServerUrl)
  else await mainWindow.loadFile(path.join(appDirectory, '..', 'dist', 'index.html'))

  mainWindow.on('closed', () => { mainWindow = null })
}

async function initialize() {
  libraryRoot = await initializeLibraryRoot(app.getPath('userData'))
  try {
    await updates.initialize()
  } catch (reason) {
    updates.reportError(reason)
  }
  registerHandlers()
  await createWindow()
  if (updates.snapshot().automatic && updates.snapshot().phase !== 'unsupported') void updates.check()
}

app.whenReady().then(initialize).catch((reason: unknown) => {
  dialog.showErrorBox('Yomu n’a pas pu démarrer', reason instanceof Error ? reason.message : String(reason))
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
