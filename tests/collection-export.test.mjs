import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import test from 'node:test'
import { exportCollectionArchive } from '../dist-electron/collection-export.js'

test('l’export ZIP contient tous les fichiers du dossier sans les modifier', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-export-test-'))
  const source = path.join(root, 'collection')
  const chapters = path.join(source, 'Chapitres')
  const emptyFolder = path.join(source, 'Images', 'Vides')
  const target = path.join(root, 'export.zip')
  try {
    await mkdir(chapters, { recursive: true })
    await mkdir(emptyFolder, { recursive: true })
    await writeFile(path.join(source, 'collection.json'), '{"title":"Test"}')
    await writeFile(path.join(source, 'lecture.json'), '{"lockedPdfZoom":1.25}')
    await writeFile(path.join(chapters, 'chapitre-1.pdf'), Buffer.from([0, 1, 2, 255]))
    await writeFile(target, 'archive précédente')

    await exportCollectionArchive(source, target, 'ma-collection')

    const zip = await JSZip.loadAsync(await readFile(target))
    assert.deepEqual(Object.keys(zip.files).sort(), [
      'ma-collection/',
      'ma-collection/Chapitres/',
      'ma-collection/Images/',
      'ma-collection/Images/Vides/',
      'ma-collection/Chapitres/chapitre-1.pdf',
      'ma-collection/collection.json',
      'ma-collection/lecture.json',
    ].sort())
    assert.deepEqual(
      [...await zip.file('ma-collection/Chapitres/chapitre-1.pdf').async('nodebuffer')],
      [0, 1, 2, 255],
    )
    assert.equal(await readFile(path.join(source, 'collection.json'), 'utf8'), '{"title":"Test"}')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
