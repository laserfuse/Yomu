import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import test from 'node:test'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'

function createPdf() {
  const content = 'BT /F1 24 Tf 72 720 Td (Yomu end-to-end test) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 3000] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let document = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(document)
    document += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const crossReferenceOffset = Buffer.byteLength(document)
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  document += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`
  return Buffer.from(document, 'ascii')
}

test('Yomu démarre avec un profil temporaire, lit un chapitre fictif et supprime la collection', { timeout: 60_000 }, async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-e2e-'))
  const appData = path.join(temporaryRoot, 'Profile')
  const userData = path.join(appData, 'yomu')
  const libraryRoot = path.join(temporaryRoot, 'Bibliotheque')
  const sourceChapterPath = path.join(temporaryRoot, 'fixtures', 'Chapitre 1.pdf')
  const invalidChapterPath = path.join(temporaryRoot, 'fixtures', 'Chapitre corrompu.pdf')
  const collectionId = 'e2e-collection-id'
  const collectionTitle = 'Collection de test E2E'
  const folderName = 'collection-e2e'
  const collectionDirectory = path.join(libraryRoot, folderName)
  const pdf = createPdf()
  const settingsPath = path.join(userData, 'settings.json')
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  let application

  try {
    await mkdir(collectionDirectory, { recursive: true })
    await mkdir(path.dirname(sourceChapterPath), { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(settingsPath, `${JSON.stringify({ libraryRoot }, null, 2)}\n`)
    await writeFile(sourceChapterPath, pdf)
    await writeFile(invalidChapterPath, "ceci n'est pas un PDF")
    await writeFile(path.join(collectionDirectory, 'collection.json'), `${JSON.stringify({
      collection: {
        id: collectionId,
        title: collectionTitle,
        kind: 'Manhwa',
        status: 'reading',
        createdAt: 1_700_000_000_000,
        folderName,
        coverPath: null,
      },
      books: [],
    }, null, 2)}\n`)

    application = await electron.launch({
      executablePath: electronPath,
      args: [projectRoot],
      env: { ...process.env, YOMU_E2E_PROFILE: appData },
      timeout: 30_000,
    })
    const page = await application.firstWindow()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const sidebarLogo = page.locator('.brand-logo img')
    await sidebarLogo.waitFor({ state: 'visible' })
    assert.equal(await sidebarLogo.evaluate((image) => image.naturalWidth), 360)
    const logoLayout = await sidebarLogo.evaluate((image) => {
      const link = image.closest('.brand-logo')
      const linkStyle = getComputedStyle(link)
      const linkBounds = link.getBoundingClientRect()
      const imageBounds = image.getBoundingClientRect()
      return {
        backgroundColor: linkStyle.backgroundColor,
        centered: Math.abs((linkBounds.left + linkBounds.width / 2) - (imageBounds.left + imageBounds.width / 2)) < 1,
      }
    })
    assert.equal(logoLayout.backgroundColor, 'rgba(0, 0, 0, 0)')
    assert.equal(logoLayout.centered, true)

    await page.locator('.sidebar-settings').click()
    const appLanguage = page.locator('.settings-page .settings-language-preferences select').first()
    await appLanguage.selectOption('en')
    await page.getByRole('button', { name: 'All collections' }).waitFor()
    assert.deepEqual(JSON.parse(await readFile(path.join(userData, 'ui-language.json'), 'utf8')), { language: 'en' })
    assert.equal(await page.locator('.settings-page .settings-language-preferences select').nth(1).inputValue(), 'both')
    await appLanguage.selectOption('fr')
    await page.getByRole('button', { name: 'Toutes les collections' }).waitFor()

    const collectionButton = page.locator('.series-item').filter({ hasText: collectionTitle })
    try {
      await collectionButton.waitFor({ state: 'visible', timeout: 15_000 })
    } catch (reason) {
      const screenText = await page.locator('body').innerText()
      throw new Error(`${reason.message}\nÉcran affiché : ${screenText}`)
    }
    await collectionButton.click()
    await page.getByRole('heading', { name: collectionTitle, exact: true }).waitFor()
    await application.evaluate(({ dialog }, selectedFilePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFilePath] })
    }, sourceChapterPath)
    await page.locator('.detail-actions button.button-primary').click()
    await page.getByRole('dialog', { name: 'Choisis la langue' }).getByRole('button', { name: 'Français' }).click()
    const chapterButton = page.locator('.chapter-title').filter({ hasText: 'Chapitre 1' })
    await chapterButton.waitFor({ state: 'visible' })
    const importedCollection = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8'))
    assert.equal(importedCollection.books.length, 1)
    assert.equal(importedCollection.books[0].language, 'fr')
    assert.deepEqual(await readFile(path.join(libraryRoot, importedCollection.books[0].relativePath)), pdf)

    await chapterButton.click()
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pdf-page canvas')
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0
    }, null, { timeout: 15_000 })
    await page.locator('.pdf-pages').evaluate((container) => {
      container.scrollTop = 700
      container.dispatchEvent(new Event('scroll'))
    })
    let savedPosition
    for (let attempt = 0; attempt < 30; attempt++) {
      const savedBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books[0]
      savedPosition = savedBook.readingPosition
      if (typeof savedPosition?.offset === 'number') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(savedPosition)
    assert.equal(savedPosition.page, 1)
    assert.ok(savedPosition.offset > 0 && savedPosition.offset < 1)
    const expectedScrollTop = await page.locator('.pdf-pages').evaluate((container) => container.scrollTop)
    await page.getByRole('button', { name: 'Retour' }).click()
    await chapterButton.click()
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pdf-page canvas')
      const container = document.querySelector('.pdf-pages')
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0 && container?.scrollTop > 100
    }, null, { timeout: 15_000 })
    const restoredScrollTop = await page.locator('.pdf-pages').evaluate((container) => container.scrollTop)
    assert.ok(Math.abs(restoredScrollTop - expectedScrollTop) < 3)
    await page.getByRole('button', { name: 'Retour' }).click()

    await application.evaluate(({ dialog }, selectedFilePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFilePath] })
    }, invalidChapterPath)
    await page.locator('.detail-actions button.button-primary').click()
    await page.getByRole('dialog', { name: 'Choisis la langue' }).getByRole('button', { name: 'Français' }).click()
    const invalidChapterButton = page.locator('.chapter-title').filter({ hasText: 'Chapitre corrompu' })
    await invalidChapterButton.waitFor({ state: 'visible' })
    await page.locator('.sidebar-settings').click()
    await page.locator('.settings-page .settings-language-preferences select').first().selectOption('en')
    await page.locator('.series-item').filter({ hasText: collectionTitle }).click()
    await invalidChapterButton.click()
    await page.getByRole('alert').getByText('Could not open this chapter').waitFor()
    await page.getByText('Technical details').waitFor()
    await page.getByRole('button', { name: 'Back to library' }).click()
    await page.locator('.sidebar-settings').click()
    await page.locator('.settings-page .settings-language-preferences select').first().selectOption('fr')
    await page.locator('.series-item').filter({ hasText: collectionTitle }).click()

    const zipCollectionId = 'e2e-zip-collection-id'
    const zipCollectionTitle = 'Collection résumé ZIP'
    const archiveRoot = 'collection-archive'
    const archiveChapterPath = `${archiveRoot}/Chapitres/chapitre-1.pdf`
    const archiveEnglishPath = `${archiveRoot}/Chapitres/chapter-2.pdf`
    const archive = new JSZip()
    archive.file(`${archiveRoot}/collection.json`, JSON.stringify({
      collection: {
        id: zipCollectionId,
        title: zipCollectionTitle,
        kind: 'Manga',
        status: 'to-read',
        createdAt: 1_700_000_000_000,
        folderName: archiveRoot,
        coverPath: null,
      },
      books: [
        {
          id: 'e2e-zip-book-id',
          collectionId: zipCollectionId,
          title: 'Chapitre 1',
          series: zipCollectionTitle,
          chapter: 'Chapitre 1',
          language: 'fr',
          format: 'PDF',
          fileName: 'chapitre-1.pdf',
          relativePath: archiveChapterPath,
          size: pdf.length,
          addedAt: 1_700_000_000_000,
          lastOpenedAt: null,
          progress: 0,
        },
        {
          id: 'e2e-zip-book-en-id',
          collectionId: zipCollectionId,
          title: 'Chapter 2',
          series: zipCollectionTitle,
          chapter: 'Chapter 2',
          language: 'en',
          format: 'PDF',
          fileName: 'chapter-2.pdf',
          relativePath: archiveEnglishPath,
          size: pdf.length,
          addedAt: 1_700_000_000_000,
          lastOpenedAt: null,
          progress: 0,
        },
      ],
    }))
    archive.file(archiveChapterPath, pdf)
    archive.file(archiveEnglishPath, pdf)
    const archivePath = path.join(temporaryRoot, 'collection.zip')
    await writeFile(archivePath, await archive.generateAsync({ type: 'nodebuffer' }))
    await application.evaluate(({ dialog }, selectedFilePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFilePath] })
    }, archivePath)
    await page.locator('.sidebar-import').click()
    const importSummary = page.locator('.success-banner')
    await importSummary.getByText('Import terminé').waitFor()
    assert.match(await importSummary.innerText(), /1 collection ajoutée, 2 chapitres ajoutés, 0 élément ignoré, 0 erreur/)
    const invalidArchivePath = path.join(temporaryRoot, 'archive-invalide.zip')
    await writeFile(invalidArchivePath, "ceci n'est pas une archive ZIP")
    await application.evaluate(({ dialog }, selectedFilePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFilePath] })
    }, invalidArchivePath)
    await page.locator('.sidebar-import').click()
    const importError = page.locator('.error-banner')
    await importError.getByText('Import ZIP échoué').waitFor()
    assert.match(await importError.innerText(), /0 élément ajouté, 0 ignoré, 1 erreur/)

    await page.locator('.sidebar-settings').click()
    await page.getByRole('combobox', { name: 'Langues visibles dans les collections' }).selectOption('fr')
    await page.waitForFunction(() => document.querySelector('select[aria-label="Langues visibles dans les collections"]')?.value === 'fr')
    assert.deepEqual(JSON.parse(await readFile(path.join(userData, 'language-settings.json'), 'utf8')), { visibility: 'fr' })
    const storedLibrary = await page.evaluate(() => window.yomu.loadLibrary())
    assert.ok(storedLibrary.books.some((book) => book.series === zipCollectionTitle && book.language === 'en'))
    await page.locator('.series-item').filter({ hasText: zipCollectionTitle }).click()
    const languageFilters = page.getByRole('group', { name: 'Langue des chapitres' })
    await languageFilters.getByRole('button', { name: /Français/ }).waitFor()
    await languageFilters.getByRole('button', { name: /Anglais/ }).waitFor({ state: 'detached' })
    await page.locator('.sidebar-settings').click()
    await page.getByRole('combobox', { name: 'Langues visibles dans les collections' }).selectOption('both')
    await page.waitForFunction(() => document.querySelector('select[aria-label="Langues visibles dans les collections"]')?.value === 'both')
    await page.locator('.series-item').filter({ hasText: zipCollectionTitle }).click()
    await page.getByRole('group', { name: 'Langue des chapitres' }).getByRole('button', { name: /Anglais/ }).waitFor()

    await page.getByRole('button', { name: 'Toutes les collections', exact: true }).click()
    await page.getByRole('combobox', { name: 'Trier les collections' }).selectOption('progress')
    const collectionTitles = await page.locator('.collection-card .collection-card-info > strong').allTextContents()
    assert.deepEqual(collectionTitles, [collectionTitle, zipCollectionTitle])
    await page.getByRole('button', { name: `Ouvrir la collection ${zipCollectionTitle}` }).click()
    await page.getByRole('button', { name: `Supprimer ${zipCollectionTitle}` }).click()
    await page.getByRole('dialog', { name: 'Supprimer définitivement cette collection ?' }).waitFor()
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
    await page.getByRole('heading', { name: zipCollectionTitle, exact: true }).waitFor({ state: 'detached' })

    await collectionButton.click()
    await page.getByRole('button', { name: `Supprimer ${collectionTitle}` }).click()
    await page.getByRole('dialog', { name: 'Supprimer définitivement cette collection ?' }).waitFor()
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
    await collectionButton.waitFor({ state: 'detached' })
    await assert.rejects(stat(collectionDirectory), { code: 'ENOENT' })
    assert.deepEqual(pageErrors, [])
    assert.equal(JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot, libraryRoot)
  } finally {
    if (application) await application.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
