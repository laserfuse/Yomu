import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'

export type LanguageVisibility = 'both' | 'fr' | 'en'

export function isLanguageVisibility(value: unknown): value is LanguageVisibility {
  return value === 'both' || value === 'fr' || value === 'en'
}

export async function readLanguageVisibility(settingsPath: string): Promise<LanguageVisibility> {
  let contents: string
  try {
    contents = await readFile(settingsPath, 'utf8')
  } catch (reason) {
    if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') return 'both'
    throw reason
  }
  const settings: unknown = JSON.parse(contents)
  if (typeof settings !== 'object' || settings === null || !('visibility' in settings) || !isLanguageVisibility(settings.visibility)) {
    throw new Error('Le réglage des langues visibles est invalide.')
  }
  return settings.visibility
}

export async function saveLanguageVisibility(settingsPath: string, visibility: LanguageVisibility): Promise<void> {
  if (!isLanguageVisibility(visibility)) throw new Error('Le réglage des langues visibles est invalide.')
  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify({ visibility }, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, settingsPath)
}
