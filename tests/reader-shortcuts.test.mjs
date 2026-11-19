import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DEFAULT_READER_SHORTCUTS, isReaderShortcuts } from '../dist-electron/reader-shortcuts.js'
import { readReaderShortcuts, saveReaderShortcuts } from '../dist-electron/reader-shortcut-settings.js'

test('les raccourcis sont persistants et utilisent les flèches par défaut', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-reader-shortcuts-'))
  const settingsPath = path.join(root, 'reader-shortcuts.json')
  const customShortcuts = { ...DEFAULT_READER_SHORTCUTS, mangaPreviousPage: 'A' }
  try {
    assert.deepEqual(await readReaderShortcuts(settingsPath), DEFAULT_READER_SHORTCUTS)
    await saveReaderShortcuts(settingsPath, customShortcuts)
    assert.deepEqual(await readReaderShortcuts(settingsPath), customShortcuts)
    assert.deepEqual(JSON.parse(await readFile(settingsPath, 'utf8')), customShortcuts)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('les raccourcis en double ou invalides sont refusés', async () => {
  const duplicateShortcuts = { ...DEFAULT_READER_SHORTCUTS, mangaPreviousPage: 'Escape' }
  const invalidShortcuts = { ...DEFAULT_READER_SHORTCUTS, closeReader: '' }
  assert.equal(isReaderShortcuts(duplicateShortcuts), false)
  await assert.rejects(saveReaderShortcuts('unused.json', duplicateShortcuts), /invalide/)
  await assert.rejects(saveReaderShortcuts('unused.json', invalidShortcuts), /invalide/)
})

test('un fichier de raccourcis invalide est signalé sans être remplacé', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-reader-shortcuts-invalid-'))
  const settingsPath = path.join(root, 'reader-shortcuts.json')
  try {
    await writeFile(settingsPath, '{"closeReader":"Escape"}')
    await assert.rejects(readReaderShortcuts(settingsPath), /invalide/)
    assert.equal(await readFile(settingsPath, 'utf8'), '{"closeReader":"Escape"}')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
