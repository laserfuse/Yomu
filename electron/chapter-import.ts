import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const CHAPTER_EXTENSIONS = new Set(['.pdf', '.cbz', '.epub'])

export async function collectChapterFiles(sourcePaths: string[]): Promise<string[]> {
  const files: string[] = []
  const visited = new Set<string>()

  const visit = async (sourcePath: string): Promise<void> => {
    const resolvedPath = path.resolve(sourcePath)
    if (visited.has(resolvedPath)) return
    const entry = await lstat(resolvedPath)
    visited.add(resolvedPath)

    if (entry.isFile()) {
      if (CHAPTER_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) files.push(resolvedPath)
      return
    }
    if (!entry.isDirectory()) return

    const children = await readdir(resolvedPath, { withFileTypes: true })
    children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    for (const child of children) {
      if (child.isFile() || child.isDirectory()) await visit(path.join(resolvedPath, child.name))
    }
  }

  for (const sourcePath of sourcePaths) await visit(sourcePath)
  if (files.length === 0) throw new Error('Aucun fichier PDF, CBZ ou EPUB n’a été trouvé.')
  return files
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export async function filterDuplicateChapterFiles(
  existingFilePaths: string[],
  candidateFilePaths: string[],
): Promise<{ filesToImport: string[]; duplicatesSkipped: number }> {
  const candidateSizes = await Promise.all(candidateFilePaths.map(async (filePath) => (await stat(filePath)).size))
  const sizesToCheck = new Set(candidateSizes)
  const existingFiles = await Promise.all(existingFilePaths.map(async (filePath) => ({
    filePath,
    size: (await stat(filePath)).size,
  })))
  const knownHashes = new Set<string>()

  for (const file of existingFiles) {
    if (sizesToCheck.has(file.size)) knownHashes.add(await hashFile(file.filePath))
  }

  const filesToImport: string[] = []
  let duplicatesSkipped = 0
  for (const filePath of candidateFilePaths) {
    const hash = await hashFile(filePath)
    if (knownHashes.has(hash)) {
      duplicatesSkipped++
      continue
    }
    knownHashes.add(hash)
    filesToImport.push(filePath)
  }

  return { filesToImport, duplicatesSkipped }
}
