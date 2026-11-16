import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

function isMissingFile(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === 'ENOENT'
}

type SavedLibraryRoot = { configured: false } | { configured: true; path: string | null }

async function readSavedLibraryRoot(settingsPath: string): Promise<SavedLibraryRoot> {
  let contents: string
  try {
    contents = await readFile(settingsPath, 'utf8')
  } catch (reason) {
    if (isMissingFile(reason)) return { configured: false }
    throw reason
  }

  const settings: unknown = JSON.parse(contents)
  if (typeof settings !== 'object' || settings === null || !('libraryRoot' in settings)
    || typeof settings.libraryRoot !== 'string' || !path.isAbsolute(settings.libraryRoot)) {
    throw new Error('Le chemin de bibliothèque enregistré est invalide.')
  }

  try {
    const info = await stat(settings.libraryRoot)
    if (!info.isDirectory()) throw new Error('Le chemin de bibliothèque enregistré ne correspond pas à un dossier.')
    return { configured: true, path: settings.libraryRoot }
  } catch (reason) {
    if (isMissingFile(reason)) return { configured: true, path: null }
    throw reason
  }
}

export async function saveLibraryRoot(settingsPath: string, libraryRoot: string): Promise<void> {
  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify({ libraryRoot }, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, settingsPath)
}

export async function retryLibraryRoot(settingsPath: string): Promise<string | null> {
  const saved = await readSavedLibraryRoot(settingsPath)
  return saved.configured ? saved.path : null
}

export async function initializeLibraryRoot(userDataPath: string): Promise<string | null> {
  const settingsPath = path.join(userDataPath, 'settings.json')
  const saved = await readSavedLibraryRoot(settingsPath)
  if (saved.configured) return saved.path

  const libraryRoot = path.join(userDataPath, 'Bibliotheque')
  await mkdir(libraryRoot, { recursive: true })
  await saveLibraryRoot(settingsPath, libraryRoot)
  return libraryRoot
}
