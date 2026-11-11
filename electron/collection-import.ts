import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import * as yauzl from 'yauzl'

type CollectionKind = 'Manga' | 'Manhwa'
type CollectionStatus = 'to-read' | 'reading' | 'paused' | 'completed'
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
  format: 'PDF' | 'CBZ' | 'EPUB'
  fileName: string
  relativePath: string
  size: number
  addedAt: number
  lastOpenedAt: number | null
  progress: number
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
    && typeof value.progress === 'number'
}

function safeArchivePath(fileName: string): { root: string; relativePath: string } {
  if (fileName.includes('\\') || fileName.startsWith('/') || fileName.includes('\0')) {
    throw new Error('L’archive contient un chemin de fichier invalide.')
  }
  const isDirectory = fileName.endsWith('/')
  const segments = fileName.split('/')
  if (isDirectory) segments.pop()
  if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('L’archive contient un chemin de fichier invalide.')
  }
  for (const segment of segments) {
    if (/[<>:"|?*]/.test(segment) || [...segment].some((character) => character.charCodeAt(0) < 32) || /[. ]$/.test(segment)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment)) {
      throw new Error('L’archive contient un nom de fichier incompatible avec Windows.')
    }
  }
  return { root: segments[0], relativePath: segments.join(path.sep) }
}

function relativeCollectionPath(value: string, archiveRoot: string): string {
  const normalizedPath = value.replace(/\\/g, '/')
  const { root } = safeArchivePath(normalizedPath)
  const segments = normalizedPath.split('/')
  if (segments.length < 2 || root !== archiveRoot || !segments[segments.length - 1]) {
    throw new Error('Les chemins des données de cette collection sont invalides.')
  }
  return path.join(...segments.slice(1))
}

function makeFolderName(title: string, id: string): string {
  const normalized = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const folderSlug = normalized.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'collection'
  return `${folderSlug}-${id.slice(0, 8)}`
}

async function extractArchive(archivePath: string, extractionRoot: string): Promise<string> {
  const zip = await yauzl.openPromise(archivePath, {
    autoClose: true,
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  })
  const seenPaths = new Set<string>()
  let archiveRoot = ''

  for await (const entry of zip.eachEntry()) {
    const { root, relativePath } = safeArchivePath(entry.fileName)
    if (archiveRoot && root !== archiveRoot) throw new Error('L’archive doit contenir une seule collection.')
    archiveRoot = root

    const normalizedArchivePath = entry.fileName.replace(/\/$/, '')
    if (seenPaths.has(normalizedArchivePath)) throw new Error('L’archive contient des fichiers en double.')
    seenPaths.add(normalizedArchivePath)

    const mode = (entry.externalFileAttributes >>> 16) & 0xf000
    if (mode !== 0 && mode !== 0x4000 && mode !== 0x8000) {
      throw new Error('L’archive contient un type de fichier non pris en charge.')
    }
    if (mode === 0x8000 && entry.fileName.endsWith('/')) {
      throw new Error('L’archive contient des métadonnées de fichier incohérentes.')
    }
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
      throw new Error('L’archive contient une taille de fichier invalide.')
    }
    if (entry.isEncrypted() || !entry.canDecodeFileData()) {
      throw new Error('Cette archive est chiffrée ou utilise une compression non prise en charge.')
    }

    const targetPath = path.join(extractionRoot, relativePath)
    const pathFromRoot = path.relative(extractionRoot, targetPath)
    if (pathFromRoot.startsWith(`..${path.sep}`) || pathFromRoot === '..' || path.isAbsolute(pathFromRoot)) {
      throw new Error('L’archive contient un chemin qui sort du dossier de la collection.')
    }

    if (entry.fileName.endsWith('/') || mode === 0x4000) {
      await mkdir(targetPath, { recursive: true })
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true })
      const source = await zip.openReadStreamPromise(entry)
      await pipeline(source, createWriteStream(targetPath, { flags: 'wx' }))
    }
  }

  if (!archiveRoot) throw new Error('L’archive ZIP est vide.')
  return archiveRoot
}

export async function importCollectionArchive(
  archivePath: string,
  libraryRoot: string,
): Promise<CollectionRecord> {
  await mkdir(libraryRoot, { recursive: true })
  const stagingDirectory = await mkdtemp(path.join(libraryRoot, '.yomu-import-'))
  try {
    const archiveRoot = await extractArchive(archivePath, stagingDirectory)
    const sourceDirectory = path.join(stagingDirectory, archiveRoot)
    const parsed: unknown = JSON.parse(await readFile(path.join(sourceDirectory, 'collection.json'), 'utf8'))
    if (!isRecord(parsed) || !validCollection(parsed.collection) || !Array.isArray(parsed.books)) {
      throw new Error('Cette archive ne contient pas les données d’une collection Yomu valides.')
    }

    const originalCollection = parsed.collection
    if (!originalCollection.title.trim() || originalCollection.folderName !== archiveRoot) {
      throw new Error('Les informations de cette collection ne correspondent pas à son dossier.')
    }
    const originalBooks = parsed.books.filter(validBook)
    if (originalBooks.length !== parsed.books.length
      || originalBooks.some((book) => book.collectionId !== originalCollection.id)) {
      throw new Error('Les informations des chapitres de cette collection sont invalides.')
    }

    const relativeCoverPath = originalCollection.coverPath
      ? relativeCollectionPath(originalCollection.coverPath, archiveRoot)
      : null
    if (relativeCoverPath && !(await stat(path.join(sourceDirectory, relativeCoverPath))).isFile()) {
      throw new Error('La couverture référencée est absente de l’archive.')
    }
    const relativeBookPaths = await Promise.all(originalBooks.map(async (book) => {
      const relativePath = relativeCollectionPath(book.relativePath, archiveRoot)
      if (!(await stat(path.join(sourceDirectory, relativePath))).isFile()) {
        throw new Error(`Le fichier du chapitre « ${book.chapter || book.title} » est absent de l’archive.`)
      }
      return relativePath
    }))

    const collectionId = randomUUID()
    const collection: CollectionRecord = {
      ...originalCollection,
      id: collectionId,
      folderName: makeFolderName(originalCollection.title, collectionId),
      coverPath: relativeCoverPath ? path.join(makeFolderName(originalCollection.title, collectionId), relativeCoverPath) : null,
    }
    const books = originalBooks.map((book, index) => ({
      ...book,
      id: randomUUID(),
      collectionId,
      relativePath: path.join(collection.folderName, relativeBookPaths[index]),
      language: book.language ?? null,
    }))

    await writeFile(path.join(sourceDirectory, 'collection.json'), `${JSON.stringify({ collection, books }, null, 2)}\n`, 'utf8')
    const targetDirectory = path.join(libraryRoot, collection.folderName)
    await rename(sourceDirectory, targetDirectory)
    return collection
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }
}
