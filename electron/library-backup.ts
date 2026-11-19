import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises'
import JSZip from 'jszip'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import * as yauzl from 'yauzl'

const BACKUP_ROOT = 'YomuBackup'
const LIBRARY_ROOT = `${BACKUP_ROOT}/library`
const MANIFEST_PATH = `${BACKUP_ROOT}/manifest.json`

interface BackupFile {
  path: string
  size: number
  sha256: string
}

interface BackupManifest {
  format: 'yomu-library-backup'
  version: 1
  directories: string[]
  files: BackupFile[]
}

interface LibrarySnapshot {
  manifest: BackupManifest
  entries: Array<{ sourcePath: string; archivePath: string; directory: boolean }>
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function pathsOverlap(first: string, second: string): boolean {
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
  const left = normalize(first)
  const right = normalize(second)
  return isWithin(left, right) || isWithin(right, left)
}

async function fileDigest(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function createLibrarySnapshot(root: string): Promise<LibrarySnapshot> {
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('La bibliothèque doit être un dossier normal.')
  }

  const entries: LibrarySnapshot['entries'] = []
  const directories: string[] = []
  const files: BackupFile[] = []
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((left, right) => left.name.localeCompare(right.name))
    for (const child of children) {
      const sourcePath = path.join(directory, child.name)
      const relativePath = relativeDirectory ? path.join(relativeDirectory, child.name) : child.name
      const archivePath = relativePath.split(path.sep).join('/')
      const info = await lstat(sourcePath)
      if (info.isSymbolicLink()) {
        throw new Error(`La sauvegarde ne prend pas en charge les liens symboliques : ${relativePath}`)
      }
      if (info.isDirectory()) {
        directories.push(archivePath)
        entries.push({ sourcePath, archivePath: `${LIBRARY_ROOT}/${archivePath}`, directory: true })
        await visit(sourcePath, relativePath)
      } else if (info.isFile()) {
        files.push({ path: archivePath, size: info.size, sha256: await fileDigest(sourcePath) })
        entries.push({ sourcePath, archivePath: `${LIBRARY_ROOT}/${archivePath}`, directory: false })
      } else {
        throw new Error(`La sauvegarde ne prend pas en charge cet élément : ${relativePath}`)
      }
    }
  }
  await visit(root, '')
  directories.sort()
  files.sort((left, right) => left.path.localeCompare(right.path))
  return {
    manifest: { format: 'yomu-library-backup', version: 1, directories, files },
    entries,
  }
}

async function removeTemporaryArchive(temporaryPath: string, originalError: unknown): Promise<never> {
  try {
    await rm(temporaryPath, { force: true })
  } catch (cleanupError) {
    throw new AggregateError([originalError, cleanupError], 'La sauvegarde a échoué et son fichier temporaire n’a pas pu être supprimé.')
  }
  throw originalError
}

export async function createLibraryBackupArchive(sourceRoot: string, targetPath: string): Promise<void> {
  const sourceInfo = await lstat(sourceRoot)
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
    throw new Error('La bibliothèque doit être un dossier normal.')
  }
  const [source, targetDirectory] = await Promise.all([
    realpath(sourceRoot),
    realpath(path.dirname(targetPath)),
  ])
  const target = path.join(targetDirectory, path.basename(targetPath))
  if (isWithin(source, target)) {
    throw new Error('Choisis un emplacement de sauvegarde hors de la bibliothèque.')
  }

  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`
  const zip = new JSZip()
  zip.folder(BACKUP_ROOT)
  zip.folder(LIBRARY_ROOT)

  try {
    const snapshot = await createLibrarySnapshot(source)
    for (const entry of snapshot.entries) {
      if (entry.directory) zip.folder(entry.archivePath)
      else zip.file(entry.archivePath, createReadStream(entry.sourcePath), {
        compression: 'DEFLATE',
        compressionOptions: { level: 1 },
      })
    }
    zip.file(MANIFEST_PATH, `${JSON.stringify(snapshot.manifest, null, 2)}\n`)
    await pipeline(
      zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 1 } }),
      createWriteStream(temporaryPath, { flags: 'wx' }),
    )
    const currentSnapshot = await createLibrarySnapshot(source)
    if (JSON.stringify(snapshot.manifest) !== JSON.stringify(currentSnapshot.manifest)) {
      throw new Error('La bibliothèque a changé pendant sa sauvegarde. La sauvegarde incomplète a été supprimée.')
    }
    await rename(temporaryPath, targetPath)
  } catch (reason) {
    return removeTemporaryArchive(temporaryPath, reason)
  }
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('\\') || value.startsWith('/') || value.includes('\0')) return false
  const segments = value.split('/')
  return segments.length > 0 && segments.every((segment) => segment.length > 0
    && segment !== '.' && segment !== '..'
    && !/[<>:"|?*]/.test(segment)
    && ![...segment].some((character) => character.charCodeAt(0) < 32)
    && !/[. ]$/.test(segment)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment))
}

function parseManifest(value: unknown): BackupManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Le fichier de sauvegarde est invalide.')
  const manifest = value as Record<string, unknown>
  if (manifest.format !== 'yomu-library-backup' || manifest.version !== 1
    || !Array.isArray(manifest.directories) || !Array.isArray(manifest.files)) {
    throw new Error('Cette archive n’est pas une sauvegarde complète Yomu prise en charge.')
  }

  const directories = manifest.directories
  if (directories.some((directory) => !safeRelativePath(directory))
    || new Set(directories).size !== directories.length) {
    throw new Error('La sauvegarde contient une liste de dossiers invalide.')
  }
  const files: BackupFile[] = []
  for (const file of manifest.files) {
    if (typeof file !== 'object' || file === null) throw new Error('La sauvegarde contient une liste de fichiers invalide.')
    const record = file as Record<string, unknown>
    if (!safeRelativePath(record.path) || typeof record.size !== 'number'
      || !Number.isSafeInteger(record.size) || record.size < 0
      || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      throw new Error('La sauvegarde contient une liste de fichiers invalide.')
    }
    files.push({ path: record.path, size: record.size, sha256: record.sha256 })
  }
  const filePaths = files.map((file) => file.path)
  if (new Set(filePaths).size !== filePaths.length
    || filePaths.some((filePath) => directories.includes(filePath))) {
    throw new Error('La sauvegarde contient des chemins en double ou incohérents.')
  }
  return {
    format: 'yomu-library-backup',
    version: 1,
    directories: [...directories as string[]].sort(),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

async function inventoryRestoredLibrary(root: string): Promise<BackupManifest> {
  const directories: string[] = []
  const files: BackupFile[] = []
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true })
    for (const child of children) {
      const filePath = path.join(directory, child.name)
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name
      const info = await lstat(filePath)
      if (info.isSymbolicLink()) throw new Error('La sauvegarde ne peut pas restaurer de lien symbolique.')
      if (info.isDirectory()) {
        directories.push(relativePath)
        await visit(filePath, relativePath)
      } else if (info.isFile()) {
        files.push({ path: relativePath, size: info.size, sha256: await fileDigest(filePath) })
      } else {
        throw new Error('La sauvegarde contient un type de fichier non pris en charge.')
      }
    }
  }
  await visit(root, '')
  directories.sort()
  files.sort((left, right) => left.path.localeCompare(right.path))
  return { format: 'yomu-library-backup', version: 1, directories, files }
}

async function extractBackupArchive(archivePath: string, extractionRoot: string): Promise<string> {
  const zip = await yauzl.openPromise(archivePath, {
    autoClose: true,
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  })
  const seenPaths = new Set<string>()
  let hasBackupRoot = false
  let hasLibraryRoot = false
  let hasManifest = false

  for await (const entry of zip.eachEntry()) {
    const isDirectory = entry.fileName.endsWith('/')
    const normalizedPath = isDirectory ? entry.fileName.slice(0, -1) : entry.fileName
    const segments = normalizedPath.split('/')
    if (entry.fileName.includes('\\') || entry.fileName.startsWith('/') || entry.fileName.includes('\0')
      || segments.some((segment) => !safeRelativePath(segment))) {
      throw new Error('La sauvegarde contient un chemin de fichier invalide.')
    }
    if (seenPaths.has(normalizedPath)) throw new Error('La sauvegarde contient des chemins en double.')
    seenPaths.add(normalizedPath)

    const mode = (entry.externalFileAttributes >>> 16) & 0xf000
    if (mode !== 0 && mode !== 0x4000 && mode !== 0x8000) {
      throw new Error('La sauvegarde contient un type de fichier non pris en charge.')
    }
    if ((mode === 0x8000 && isDirectory) || (mode === 0x4000 && !isDirectory)) {
      throw new Error('La sauvegarde contient des métadonnées de fichier incohérentes.')
    }
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0
      || entry.isEncrypted() || !entry.canDecodeFileData()) {
      throw new Error('La sauvegarde contient une entrée invalide ou non prise en charge.')
    }

    if (normalizedPath === BACKUP_ROOT && isDirectory) hasBackupRoot = true
    else if (normalizedPath === LIBRARY_ROOT && isDirectory) hasLibraryRoot = true
    else if (normalizedPath === MANIFEST_PATH && !isDirectory) {
      if (entry.uncompressedSize > 128 * 1024 * 1024) throw new Error('Le manifeste de sauvegarde est trop volumineux.')
      hasManifest = true
    } else if (!normalizedPath.startsWith(`${LIBRARY_ROOT}/`)) {
      throw new Error('Cette archive ne respecte pas le format de sauvegarde Yomu.')
    }

    const targetPath = path.join(extractionRoot, ...segments)
    const pathFromRoot = path.relative(extractionRoot, targetPath)
    if (pathFromRoot.startsWith(`..${path.sep}`) || pathFromRoot === '..' || path.isAbsolute(pathFromRoot)) {
      throw new Error('La sauvegarde contient un chemin qui sort du dossier temporaire.')
    }
    if (isDirectory) {
      await mkdir(targetPath, { recursive: true })
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true })
      const source = await zip.openReadStreamPromise(entry)
      await pipeline(source, createWriteStream(targetPath, { flags: 'wx' }))
    }
  }

  if (!hasBackupRoot || !hasLibraryRoot || !hasManifest) {
    throw new Error('La sauvegarde est incomplète ou invalide.')
  }
  return path.join(extractionRoot, ...LIBRARY_ROOT.split('/'))
}

export async function restoreLibraryBackupArchive(
  archivePath: string,
  destinationRoot: string,
  currentLibraryRoot: string,
): Promise<void> {
  const [destinationInfo, currentRoot, destination] = await Promise.all([
    lstat(destinationRoot),
    realpath(currentLibraryRoot),
    realpath(destinationRoot),
  ])
  if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()) {
    throw new Error('La destination de restauration doit être un dossier normal.')
  }
  if (pathsOverlap(currentRoot, destination)) {
    throw new Error('La restauration doit utiliser un dossier distinct de la bibliothèque actuelle.')
  }
  if ((await readdir(destination)).length > 0) {
    throw new Error('La restauration nécessite un nouveau dossier vide. La bibliothèque actuelle est conservée.')
  }

  const staging = await mkdtemp(path.join(path.dirname(destination), '.yomu-restore-'))
  try {
    const restoredRoot = await extractBackupArchive(archivePath, staging)
    const parsedManifest: unknown = JSON.parse(await readFile(path.join(staging, MANIFEST_PATH), 'utf8'))
    const expectedManifest = parseManifest(parsedManifest)
    const actualManifest = await inventoryRestoredLibrary(restoredRoot)
    if (JSON.stringify(expectedManifest) !== JSON.stringify(actualManifest)) {
      throw new Error('La sauvegarde est incomplète ou altérée. La destination est restée vide.')
    }
    if ((await readdir(destination)).length > 0) {
      throw new Error('La destination n’est plus vide. La bibliothèque actuelle est conservée.')
    }

    await rmdir(destination)
    try {
      await rename(restoredRoot, destination)
    } catch (reason) {
      await mkdir(destination)
      throw reason
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
