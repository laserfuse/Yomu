import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'

export type UiLanguage = 'fr' | 'en'

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'fr' || value === 'en'
}

export async function readUiLanguage(settingsPath: string): Promise<UiLanguage> {
  let contents: string
  try {
    contents = await readFile(settingsPath, 'utf8')
  } catch (reason) {
    if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') return 'fr'
    throw reason
  }
  const settings: unknown = JSON.parse(contents)
  if (typeof settings !== 'object' || settings === null || !('language' in settings) || !isUiLanguage(settings.language)) {
    throw new Error('Le réglage de langue de l’application est invalide.')
  }
  return settings.language
}

export async function saveUiLanguage(settingsPath: string, language: UiLanguage): Promise<void> {
  if (!isUiLanguage(language)) throw new Error('Le réglage de langue de l’application est invalide.')
  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify({ language }, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, settingsPath)
}
