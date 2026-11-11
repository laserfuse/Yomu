import JSZip from 'jszip'
import { createReadStream, createWriteStream } from 'node:fs'
import { readdir, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

async function addDirectoryToArchive(zip: JSZip, sourceDirectory: string, archiveDirectory: string): Promise<void> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name)
    const archivePath = `${archiveDirectory}/${entry.name}`
    if (entry.isSymbolicLink()) {
      throw new Error(`L’export ne peut pas inclure le lien symbolique « ${entry.name} ».`)
    }
    if (entry.isDirectory()) {
      zip.folder(archivePath)
      await addDirectoryToArchive(zip, sourcePath, archivePath)
    } else if (entry.isFile()) {
      zip.file(archivePath, createReadStream(sourcePath), { compression: 'DEFLATE', compressionOptions: { level: 1 } })
    } else {
      throw new Error(`L’export ne peut pas inclure l’élément « ${entry.name} ».`)
    }
  }
}

async function removeTemporaryArchive(temporaryPath: string, originalError: unknown): Promise<never> {
  try {
    await rm(temporaryPath, { force: true })
  } catch (cleanupError) {
    throw new AggregateError([originalError, cleanupError], 'L’export a échoué et son fichier temporaire n’a pas pu être supprimé.')
  }
  throw originalError
}

export async function exportCollectionArchive(
  sourceDirectory: string,
  targetPath: string,
  archiveRoot: string,
): Promise<void> {
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`
  const zip = new JSZip()
  zip.folder(archiveRoot)

  try {
    await addDirectoryToArchive(zip, sourceDirectory, archiveRoot)
    await pipeline(
      zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 1 } }),
      createWriteStream(temporaryPath, { flags: 'wx' }),
    )
    await rename(temporaryPath, targetPath)
  } catch (reason) {
    return removeTemporaryArchive(temporaryPath, reason)
  }
}
