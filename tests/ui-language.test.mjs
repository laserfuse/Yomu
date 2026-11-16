import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readUiLanguage, saveUiLanguage } from '../dist-electron/ui-language.js'

test('la langue de l’application est persistante et vaut français par défaut', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-ui-language-'))
  const settingsPath = path.join(root, 'ui-language.json')
  try {
    assert.equal(await readUiLanguage(settingsPath), 'fr')
    await saveUiLanguage(settingsPath, 'en')
    assert.equal(await readUiLanguage(settingsPath), 'en')
    assert.deepEqual(JSON.parse(await readFile(settingsPath, 'utf8')), { language: 'en' })
    await saveUiLanguage(settingsPath, 'fr')
    assert.equal(await readUiLanguage(settingsPath), 'fr')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('un réglage de langue invalide est signalé sans être remplacé', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-ui-language-invalid-'))
  const settingsPath = path.join(root, 'ui-language.json')
  try {
    await writeFile(settingsPath, '{"language":"de"}')
    await assert.rejects(readUiLanguage(settingsPath), /invalide/)
    assert.equal(await readFile(settingsPath, 'utf8'), '{"language":"de"}')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
