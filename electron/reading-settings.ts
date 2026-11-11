import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3

export async function readLockedPdfZoom(collectionDirectory: string): Promise<number | null> {
  let contents: string
  try {
    contents = await readFile(path.join(collectionDirectory, 'lecture.json'), 'utf8')
  } catch (reason) {
    if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') return null
    throw reason
  }
  const settings: unknown = JSON.parse(contents)
  if (typeof settings !== 'object' || settings === null || !('lockedPdfZoom' in settings)) {
    throw new Error('Les paramètres de lecture de cette collection sont invalides.')
  }
  const zoom = settings.lockedPdfZoom
  if (zoom !== null && (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM)) {
    throw new Error('Le zoom enregistré pour cette collection est invalide.')
  }
  return zoom
}

export async function writeLockedPdfZoom(collectionDirectory: string, zoom: number | null): Promise<void> {
  if (zoom !== null && (!Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM)) {
    throw new Error('La valeur du zoom est invalide.')
  }
  const target = path.join(collectionDirectory, 'lecture.json')
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ lockedPdfZoom: zoom }, null, 2)}\n`, 'utf8')
  await rename(temporary, target)
}
