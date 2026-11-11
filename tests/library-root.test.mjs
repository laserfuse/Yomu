import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initializeLibraryRoot, saveLibraryRoot } from '../dist-electron/library-root.js'

test('la bibliothèque par défaut est créée et conservée au redémarrage', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'yomu-root-test-'))
  try {
    const expected = path.join(userData, 'Bibliotheque')
    assert.equal(await initializeLibraryRoot(userData), expected)
    assert.ok((await stat(expected)).isDirectory())
    assert.deepEqual(JSON.parse(await readFile(path.join(userData, 'settings.json'), 'utf8')), { libraryRoot: expected })
    assert.equal(await initializeLibraryRoot(userData), expected)
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('un dossier choisi précédemment est conservé sans créer de bibliothèque par défaut', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'yomu-root-test-'))
  try {
    const custom = path.join(userData, 'autre-dossier')
    await mkdir(custom)
    await saveLibraryRoot(path.join(userData, 'settings.json'), custom)
    assert.equal(await initializeLibraryRoot(userData), custom)
    await assert.rejects(stat(path.join(userData, 'Bibliotheque')), { code: 'ENOENT' })
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('un dossier enregistré manquant ne réinitialise pas la bibliothèque', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'yomu-root-test-'))
  try {
    const missing = path.join(userData, 'disque-indisponible')
    const settingsPath = path.join(userData, 'settings.json')
    await saveLibraryRoot(settingsPath, missing)
    assert.equal(await initializeLibraryRoot(userData), null)
    assert.deepEqual(JSON.parse(await readFile(settingsPath, 'utf8')), { libraryRoot: missing })
    await assert.rejects(stat(path.join(userData, 'Bibliotheque')), { code: 'ENOENT' })
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('des paramètres invalides sont signalés et préservés', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'yomu-root-test-'))
  try {
    const settingsPath = path.join(userData, 'settings.json')
    await writeFile(settingsPath, '{"libraryRoot":"relatif"}')
    await assert.rejects(initializeLibraryRoot(userData), /invalide/)
    assert.equal(await readFile(settingsPath, 'utf8'), '{"libraryRoot":"relatif"}')
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})
