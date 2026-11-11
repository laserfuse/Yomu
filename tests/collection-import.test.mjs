import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import test from 'node:test'
import { exportCollectionArchive } from '../dist-electron/collection-export.js'
import { importCollectionArchive } from '../dist-electron/collection-import.js'

for (const [separator, join] of [
  ['Windows', path.win32.join],
  ['portable', path.posix.join],
  ['mixtes', (...segments) => segments.join('\\').replace('\\Chapitres\\', '\\Chapitres/')],
]) {
test(`l’import restaure une archive Yomu avec des chemins ${separator}`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-import-test-'))
  const libraryRoot = path.join(root, 'bibliotheque')
  const sourceDirectory = path.join(root, 'collection-source')
  const chaptersDirectory = path.join(sourceDirectory, 'Chapitres')
  const archivePath = path.join(root, 'collection.zip')
  const collectionId = 'collection-source-id'
  try {
    await mkdir(chaptersDirectory, { recursive: true })
    await writeFile(path.join(sourceDirectory, 'couverture.png'), Buffer.from([8, 9, 10]))
    await writeFile(path.join(sourceDirectory, 'lecture.json'), '{"lockedPdfZoom":1.25}')
    await writeFile(path.join(chaptersDirectory, 'chapitre-1.pdf'), Buffer.from([0, 1, 2, 255]))
    await writeFile(path.join(sourceDirectory, 'collection.json'), JSON.stringify({
      collection: {
        id: collectionId,
        title: 'Série de test',
        kind: 'Manga',
        status: 'reading',
        createdAt: 123,
        folderName: 'serie-de-test',
        coverPath: join('serie-de-test', 'couverture.png'),
      },
      books: [{
        id: 'book-source-id',
        collectionId,
        title: 'Chapitre 1',
        series: 'Série de test',
        chapter: 'Chapitre 1',
        language: 'fr',
        format: 'PDF',
        fileName: 'chapitre-1.pdf',
        relativePath: join('serie-de-test', 'Chapitres', 'chapitre-1.pdf'),
        size: 4,
        addedAt: 456,
        lastOpenedAt: 789,
        progress: 35,
      }],
    }))
    await exportCollectionArchive(sourceDirectory, archivePath, 'serie-de-test')

    const imported = await importCollectionArchive(archivePath, libraryRoot)
    assert.equal(imported.title, 'Série de test')
    assert.notEqual(imported.id, collectionId)
    assert.notEqual(imported.folderName, 'serie-de-test')
    assert.match(imported.folderName, /^Serie-de-test-/)

    const importedDirectory = path.join(libraryRoot, imported.folderName)
    const metadata = JSON.parse(await readFile(path.join(importedDirectory, 'collection.json'), 'utf8'))
    assert.equal(metadata.collection.id, imported.id)
    assert.equal(metadata.collection.coverPath, path.join(imported.folderName, 'couverture.png'))
    assert.notEqual(metadata.books[0].id, 'book-source-id')
    assert.equal(metadata.books[0].collectionId, imported.id)
    assert.equal(metadata.books[0].relativePath, path.join(imported.folderName, 'Chapitres', 'chapitre-1.pdf'))
    assert.equal(metadata.books[0].progress, 35)
    assert.deepEqual([...await readFile(path.join(importedDirectory, 'Chapitres', 'chapitre-1.pdf'))], [0, 1, 2, 255])
    assert.equal(await readFile(path.join(importedDirectory, 'lecture.json'), 'utf8'), '{"lockedPdfZoom":1.25}')

    const reexportPath = path.join(root, 'collection-reexportee.zip')
    await exportCollectionArchive(importedDirectory, reexportPath, imported.folderName)
    const importedAgain = await importCollectionArchive(reexportPath, libraryRoot)
    assert.notEqual(importedAgain.id, imported.id)
    assert.notEqual(importedAgain.folderName, imported.folderName)
    const reimportedMetadata = JSON.parse(await readFile(path.join(libraryRoot, importedAgain.folderName, 'collection.json'), 'utf8'))
    assert.equal(reimportedMetadata.books[0].progress, 35)
    assert.deepEqual([...await readFile(path.join(libraryRoot, importedAgain.folderName, 'Chapitres', 'chapitre-1.pdf'))], [0, 1, 2, 255])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
}

test('l’import refuse les chemins qui sortent du dossier extrait', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-import-path-test-'))
  const libraryRoot = path.join(root, 'bibliotheque')
  const archivePath = path.join(root, 'malveillant.zip')
  try {
    const zip = new JSZip()
    zip.file('../hors-dossier.txt', 'contenu')
    await writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }))
    await assert.rejects(importCollectionArchive(archivePath, libraryRoot))
    assert.deepEqual(await readdir(libraryRoot), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('l’import refuse les chemins dangereux dans les métadonnées Windows et portables', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-import-metadata-test-'))
  const libraryRoot = path.join(root, 'bibliotheque')
  const archivePath = path.join(root, 'collection.zip')
  try {
    const collection = {
      id: 'collection-id',
      title: 'Test',
      kind: 'Manga',
      status: 'reading',
      createdAt: 123,
      folderName: 'collection',
      coverPath: null,
    }
    const book = {
      id: 'book-id', collectionId: collection.id, title: 'Chapitre 1', series: 'Test',
      chapter: 'Chapitre 1', language: 'fr', format: 'PDF', fileName: 'chapter.pdf',
      relativePath: 'collection/Chapitres/chapter.pdf', size: 4, addedAt: 456,
      lastOpenedAt: null, progress: 35,
    }
    const invalidPaths = [
      'collection\\..\\hors-dossier.pdf',
      'collection/../hors-dossier.pdf',
      'collection\\Chapitres/../../hors-dossier.pdf',
      'C:\\collection\\Chapitres\\chapter.pdf',
      '\\\\serveur\\collection\\chapter.pdf',
      '\\collection\\Chapitres\\chapter.pdf',
      'autre\\Chapitres\\chapter.pdf',
      'collection\\Chapitres\\chapter.pdf:flux',
      'collection\\Chapitres\\',
    ]
    for (const invalidPath of invalidPaths) {
      for (const field of ['coverPath', 'relativePath']) {
        const zip = new JSZip()
        zip.file('collection/collection.json', JSON.stringify({
          collection: { ...collection, coverPath: field === 'coverPath' ? invalidPath : null },
          books: [{ ...book, relativePath: field === 'relativePath' ? invalidPath : book.relativePath }],
        }))
        zip.file('collection/Chapitres/chapter.pdf', Buffer.from([0, 1, 2, 255]))
        await writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }))
        await assert.rejects(importCollectionArchive(archivePath, libraryRoot), undefined, `${field}: ${invalidPath}`)
        assert.deepEqual(await readdir(libraryRoot), [])
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
