import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { DEFAULT_READER_SHORTCUTS, isReaderShortcuts } from './reader-shortcuts.js'
import type { ReaderShortcuts } from './reader-shortcuts.js'

export async function readReaderShortcuts(settingsPath: string): Promise<ReaderShortcuts> {
  let contents: string
  try {
    contents = await readFile(settingsPath, 'utf8')
  } catch (reason) {
    if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') return DEFAULT_READER_SHORTCUTS
    throw reason
  }
  const settings: unknown = JSON.parse(contents)
  if (!isReaderShortcuts(settings)) throw new Error('Les raccourcis clavier sont invalides.')
  return settings
}

export async function saveReaderShortcuts(settingsPath: string, shortcuts: ReaderShortcuts): Promise<void> {
  if (!isReaderShortcuts(shortcuts)) throw new Error('Les raccourcis clavier sont invalides.')
  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(shortcuts, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, settingsPath)
}
