import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

function isMissingFile(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === 'ENOENT'
}

export async function saveLibraryRoot(settingsPath: string, libraryRoot: string): Promise<void> {
  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify({ libraryRoot }, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, settingsPath)
}

export async function initializeLibraryRoot(userDataPath: string): Promise<string | null> {
  const settingsPath = path.join(userDataPath, 'settings.json')
  let contents: string
  try {
    contents = await readFile(settingsPath, 'utf8')
  } catch (reason) {
    if (!isMissingFile(reason)) throw reason
    const libraryRoot = path.join(userDataPath, 'Bibliotheque')
    await mkdir(libraryRoot, { recursive: true })
    await saveLibraryRoot(settingsPath, libraryRoot)
    return libraryRoot
  }

  const settings: unknown = JSON.parse(contents)
  if (typeof settings !== 'object' || settings === null || !('libraryRoot' in settings)
    || typeof settings.libraryRoot !== 'string' || !path.isAbsolute(settings.libraryRoot)) {
    throw new Error('Le chemin de bibliothèque enregistré est invalide.')
  }

  try {
    const info = await stat(settings.libraryRoot)
    if (!info.isDirectory()) throw new Error('Le chemin de bibliothèque enregistré ne correspond pas à un dossier.')
    return settings.libraryRoot
  } catch (reason) {
    if (isMissingFile(reason)) return null
    throw reason
  }
}
