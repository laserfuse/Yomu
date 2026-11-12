import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportCollectionArchive } from './collection-export.js'
import { importCollectionArchive } from './collection-import.js'
import { withCollectionWriteLock } from './collection-lock.js'
import { readLockedPdfZoom, writeLockedPdfZoom } from './reading-settings.js'
import { initializeLibraryRoot, saveLibraryRoot } from './library-root.js'
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
if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-installed`))
}
const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
let libraryRoot: string | null = null

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

function parseChapterTitle(fileName: string): { title: string; chapter: string } {
  const title = path.parse(fileName).name.replace(/[_]+/g, ' ').trim()
  const match = title.match(/(?:chapter|chapitre|ch\.?|episode|ep\.?|tome|volume|vol\.?)\s*[-_#.]?\s*\d+(?:[.,]\d+)?/i)
  const chapter = match?.[0].replace(/[ \t]+/g, ' ').trim() ?? title
  return { title, chapter }
}

async function chooseLibraryRoot(): Promise<string | null> {
  const options: OpenDialogOptions = { title: 'Choisis le dossier de ta bibliothèque Yomu', properties: ['openDirectory', 'createDirectory'] }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  const selectedRoot = path.resolve(result.filePaths[0])
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
  return withCollectionWriteLock(input.id, async () => {
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

async function addChapters(collectionId: string, language: ChapterLanguage): Promise<BookRecord[]> {
  const library = await loadLibrary()
  const collection = library.collections.find((entry) => entry.id === collectionId)
  if (!collection) throw new Error('Cette collection est introuvable.')

  const options: OpenDialogOptions = {
    title: `Ajouter des chapitres à ${collection.title}`,
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Chapitres Yomu', extensions: ['pdf', 'cbz', 'epub'] }],
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return []

  return withCollectionWriteLock(collectionId, async () => {
    const latestLibrary = await loadLibrary()
    const latestCollection = latestLibrary.collections.find((entry) => entry.id === collectionId)
    if (!latestCollection) throw new Error('Cette collection est introuvable.')
    const chaptersDirectory = safePath(path.join(latestCollection.folderName, 'Chapitres'))
    await mkdir(chaptersDirectory, { recursive: true })
    const imported: BookRecord[] = []

    for (const sourcePath of result.filePaths) {
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

    const collectionDirectory = await readCollectionDirectory(latestCollection.folderName)
    if (!collectionDirectory) throw new Error('Le dossier de cette collection est introuvable.')
    await saveCollectionDirectory({ collection: latestCollection, books: [...collectionDirectory.books, ...imported] })
    return imported
  })
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
  ipcMain.handle('library:get-root', () => libraryRoot)
  ipcMain.handle('library:choose-root', () => chooseLibraryRoot())
  ipcMain.handle('library:open-root', async () => {
    const openError = await shell.openPath(requireRoot())
    if (openError) throw new Error(`Le dossier de bibliothèque n’a pas pu être ouvert : ${openError}`)
  })
  ipcMain.handle('library:export-collection', async (_event, collectionId: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    const collection = (await loadLibrary()).collections.find((entry) => entry.id === collectionId)
    if (!collection) throw new Error('Cette collection est introuvable.')

    const sourceDirectory = safePath(collection.folderName)
    const options: SaveDialogOptions = {
      title: `Exporter « ${collection.title} »`,
      defaultPath: path.join(app.getPath('downloads'), `${slug(collection.title)}.zip`),
      filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
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
      title: 'Choisis une archive ZIP de collection Yomu',
      properties: ['openFile'],
      filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return importCollectionArchive(result.filePaths[0], requireRoot())
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
    await writeLockedPdfZoom(safePath(collection.folderName), zoom)
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
    return saveCollection(
      collection as unknown as Omit<CollectionRecord, 'folderName' | 'coverPath'> & { folderName?: string; coverPath?: string | null },
      coverBytes as Uint8Array | null,
      coverName as string | null,
      removeCover,
    )
  })
  ipcMain.handle('library:delete-collection', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Identifiant de collection invalide.')
    await withCollectionWriteLock(id, async () => {
      const library = await loadLibrary()
      const collection = library.collections.find((entry) => entry.id === id)
      if (!collection) return
      await rm(safePath(collection.folderName), { recursive: true, force: true })
    })
  })
  ipcMain.handle('library:add-chapters', (_event, collectionId: unknown, language: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Identifiant de collection invalide.')
    if (language !== 'fr' && language !== 'en') throw new Error('La langue des chapitres est invalide.')
    return addChapters(collectionId, language)
  })
  ipcMain.handle('library:update-book', async (_event, input: unknown) => {
    if (!validBook(input)) throw new Error('Les informations de ce chapitre sont invalides.')
    await withCollectionWriteLock(input.collectionId, async () => {
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
      await withCollectionWriteLock(collection.id, async () => {
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
