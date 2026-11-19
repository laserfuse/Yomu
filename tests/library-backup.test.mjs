import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import test from 'node:test'
import { createLibraryBackupArchive, restoreLibraryBackupArchive } from '../dist-electron/library-backup.js'

test('la sauvegarde complète restaure tous les fichiers, dossiers vides et métadonnées sans les modifier', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-backup-test-'))
  const library = path.join(root, 'library')
  const destination = path.join(root, 'restored')
  const archivePath = path.join(root, 'backup.zip')
  try {
    await mkdir(path.join(library, 'collection', 'Chapitres'), { recursive: true })
    await mkdir(path.join(library, 'dossier-vide'))
    await mkdir(destination)
    await writeFile(path.join(library, 'collection', 'collection.json'), '{"books":[]}\n')
    await writeFile(path.join(library, 'collection', 'Chapitres', 'chapitre.cbz'), Buffer.from([0, 1, 2, 255]))
    await writeFile(path.join(library, 'collection', 'lecture.json'), '{"lockedPdfZoom":1.25}')

    await assert.rejects(createLibraryBackupArchive(library, path.join(library, 'backup.zip')), /hors de la bibliothèque/)
    await createLibraryBackupArchive(library, archivePath)
    const zip = await JSZip.loadAsync(await readFile(archivePath))
    assert.ok(zip.file('YomuBackup/manifest.json'))
    assert.ok(zip.file('YomuBackup/library/collection/collection.json'))
    assert.ok(zip.files['YomuBackup/library/dossier-vide/']?.dir)
    await restoreLibraryBackupArchive(archivePath, destination, library)

    assert.equal(await readFile(path.join(destination, 'collection', 'collection.json'), 'utf8'), '{"books":[]}\n')
    assert.deepEqual(await readFile(path.join(destination, 'collection', 'Chapitres', 'chapitre.cbz')), Buffer.from([0, 1, 2, 255]))
    assert.equal(await readFile(path.join(destination, 'collection', 'lecture.json'), 'utf8'), '{"lockedPdfZoom":1.25}')
    assert.deepEqual(await readdir(path.join(destination, 'dossier-vide')), [])
    assert.equal(await readFile(path.join(library, 'collection', 'collection.json'), 'utf8'), '{"books":[]}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('la restauration refuse une destination non vide et la bibliothèque actuelle', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-backup-destination-test-'))
  const library = path.join(root, 'library')
  const destination = path.join(root, 'destination')
  const archivePath = path.join(root, 'backup.zip')
  try {
    await mkdir(library)
    await mkdir(destination)
    await writeFile(path.join(library, 'collection.json'), '{}')
    await writeFile(path.join(destination, 'keep.txt'), 'existing')
    await createLibraryBackupArchive(library, archivePath)

    await assert.rejects(restoreLibraryBackupArchive(archivePath, destination, library), /dossier vide/)
    await assert.rejects(restoreLibraryBackupArchive(archivePath, library, library), /dossier distinct/)
    assert.equal(await readFile(path.join(destination, 'keep.txt'), 'utf8'), 'existing')
    assert.equal(await readFile(path.join(library, 'collection.json'), 'utf8'), '{}')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('une archive altérée est refusée et laisse la destination vide', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-backup-corrupt-test-'))
  const library = path.join(root, 'library')
  const destination = path.join(root, 'destination')
  const archivePath = path.join(root, 'backup.zip')
  try {
    await mkdir(library)
    await mkdir(destination)
    await writeFile(path.join(library, 'collection.json'), '{"books":[]}\n')
    await createLibraryBackupArchive(library, archivePath)

    const zip = await JSZip.loadAsync(await readFile(archivePath))
    zip.file('YomuBackup/library/collection.json', '{"books":[{"id":"altered"}]}\n')
    await writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }))

    await assert.rejects(restoreLibraryBackupArchive(archivePath, destination, library), /incomplète ou altérée/)
    assert.deepEqual(await readdir(destination), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('une entrée ZIP qui sort du dossier de restauration est refusée', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-backup-path-test-'))
  const library = path.join(root, 'library')
  const destination = path.join(root, 'destination')
  const archivePath = path.join(root, 'backup.zip')
  try {
    await mkdir(library)
    await mkdir(destination)
    const zip = new JSZip()
    zip.file('YomuBackup/manifest.json', '{}')
    zip.file('../outside.txt', 'unexpected')
    await writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }))

    await assert.rejects(restoreLibraryBackupArchive(archivePath, destination, library))
    assert.deepEqual(await readdir(destination), [])
    await assert.rejects(readFile(path.join(root, 'outside.txt')), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
