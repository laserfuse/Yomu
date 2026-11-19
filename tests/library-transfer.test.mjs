import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { copyLibraryContents } from '../dist-electron/library-transfer.js'

test('la copie vérifiée conserve la source et reproduit tous les fichiers', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-transfer-test-'))
  const source = path.join(temporaryRoot, 'source')
  const destination = path.join(temporaryRoot, 'destination')
  try {
    await mkdir(path.join(source, 'collection', 'Chapitres'), { recursive: true })
    await mkdir(destination)
    await writeFile(path.join(source, 'collection', 'collection.json'), '{"books":[]}\n')
    await writeFile(path.join(source, 'collection', 'Chapitres', 'chapitre.cbz'), Buffer.from([1, 2, 3, 4]))

    await copyLibraryContents(source, destination)

    assert.deepEqual(await readdir(source), ['collection'])
    assert.equal(await readFile(path.join(destination, 'collection', 'collection.json'), 'utf8'), '{"books":[]}\n')
    assert.deepEqual(await readFile(path.join(destination, 'collection', 'Chapitres', 'chapitre.cbz')), Buffer.from([1, 2, 3, 4]))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('un dossier de destination non vide est refusé sans modifier les données', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-transfer-test-'))
  const source = path.join(temporaryRoot, 'source')
  const destination = path.join(temporaryRoot, 'destination')
  try {
    await mkdir(source)
    await mkdir(destination)
    await writeFile(path.join(source, 'collection.json'), '{"books":[]}\n')
    await writeFile(path.join(destination, 'keep.txt'), 'existing')

    await assert.rejects(copyLibraryContents(source, destination), /dossier de destination vide/)

    assert.equal(await readFile(path.join(source, 'collection.json'), 'utf8'), '{"books":[]}\n')
    assert.equal(await readFile(path.join(destination, 'keep.txt'), 'utf8'), 'existing')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('les transferts vers un dossier imbriqué sont refusés', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-transfer-test-'))
  const source = path.join(temporaryRoot, 'source')
  const destination = path.join(source, 'destination')
  try {
    await mkdir(destination, { recursive: true })
    await assert.rejects(copyLibraryContents(source, destination), /imbriquées/)
    assert.deepEqual(await readdir(source), ['destination'])
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
