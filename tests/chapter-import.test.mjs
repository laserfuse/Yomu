import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { collectChapterFiles, filterDuplicateChapterFiles } from '../dist-electron/chapter-import.js'

test('l’import d’un dossier parcourt les sous-dossiers et ignore les fichiers non pris en charge', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-chapter-folder-test-'))
  const nestedDirectory = path.join(root, 'Tome 1')
  try {
    await mkdir(nestedDirectory)
    const firstChapter = path.join(root, 'Chapitre 2.PDF')
    const secondChapter = path.join(nestedDirectory, 'Chapitre 1.cbz')
    await writeFile(firstChapter, 'pdf')
    await writeFile(secondChapter, 'cbz')
    await writeFile(path.join(root, 'notes.txt'), 'ignore')

    assert.deepEqual(await collectChapterFiles([root]), [firstChapter, secondChapter])
    await assert.rejects(collectChapterFiles([path.join(root, 'notes.txt')]), /Aucun fichier PDF, CBZ ou EPUB/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('l’import ignore les fichiers identiques, même sous un autre nom, sans confondre les contenus de même taille', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-chapter-import-test-'))
  const existingDirectory = path.join(root, 'existing')
  const candidateDirectory = path.join(root, 'candidates')
  try {
    await mkdir(existingDirectory)
    await mkdir(candidateDirectory)
    const existingPath = path.join(existingDirectory, 'chapitre.pdf')
    const duplicatePath = path.join(candidateDirectory, 'renomme.cbz')
    const sameNameDifferentContentPath = path.join(candidateDirectory, 'chapitre.pdf')
    const newChapterPath = path.join(candidateDirectory, 'chapitre-2.epub')
    const duplicateInBatchPath = path.join(candidateDirectory, 'copie-chapitre-2.epub')
    await writeFile(existingPath, 'same')
    await writeFile(duplicatePath, 'same')
    await writeFile(sameNameDifferentContentPath, 'nope')
    await writeFile(newChapterPath, 'novel')
    await writeFile(duplicateInBatchPath, 'novel')

    const result = await filterDuplicateChapterFiles(
      [existingPath],
      [duplicatePath, sameNameDifferentContentPath, newChapterPath, duplicateInBatchPath],
    )

    assert.deepEqual(result, {
      filesToImport: [sameNameDifferentContentPath, newChapterPath],
      duplicatesSkipped: 2,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('l’import accepte plusieurs fichiers de contenu différent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-chapter-import-test-'))
  try {
    const firstPath = path.join(root, 'chapitre-1.pdf')
    const secondPath = path.join(root, 'chapitre-2.pdf')
    await writeFile(firstPath, 'first')
    await writeFile(secondPath, 'other')

    const result = await filterDuplicateChapterFiles([], [firstPath, secondPath])

    assert.deepEqual(result, { filesToImport: [firstPath, secondPath], duplicatesSkipped: 0 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
