import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readLanguageVisibility, saveLanguageVisibility } from '../dist-electron/language-settings.js'

test('la visibilité des langues est persistante et vaut toutes les langues par défaut', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-language-settings-'))
  const settingsPath = path.join(root, 'language-settings.json')
  try {
    assert.equal(await readLanguageVisibility(settingsPath), 'both')
    await saveLanguageVisibility(settingsPath, 'fr')
    assert.equal(await readLanguageVisibility(settingsPath), 'fr')
    assert.deepEqual(JSON.parse(await readFile(settingsPath, 'utf8')), { visibility: 'fr' })
    await saveLanguageVisibility(settingsPath, 'en')
    assert.equal(await readLanguageVisibility(settingsPath), 'en')
    await saveLanguageVisibility(settingsPath, 'both')
    assert.equal(await readLanguageVisibility(settingsPath), 'both')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('un réglage de langue invalide est signalé sans être remplacé', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-language-settings-invalid-'))
  const settingsPath = path.join(root, 'language-settings.json')
  try {
    await writeFile(settingsPath, '{"visibility":"de"}')
    await assert.rejects(readLanguageVisibility(settingsPath), /invalide/)
    assert.equal(await readFile(settingsPath, 'utf8'), '{"visibility":"de"}')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
