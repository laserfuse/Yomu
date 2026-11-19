import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import test from 'node:test'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'

function createPdf(pageCount = 1) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (let index = 0; index < pageCount; index++) {
    const content = `BT /F1 24 Tf 72 720 Td (Yomu manga page ${index + 1}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 3000] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  }
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

async function createCbz() {
  const archive = new JSZip()
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  for (let page = 1; page <= 5; page++) archive.file(`${page}.png`, image)
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function createEpub(direction = 'ltr') {
  const archive = new JSZip()
  const sections = Array.from({ length: 3 }, (_, sectionIndex) => {
    const id = `chapter-${sectionIndex + 1}`
    const paragraphs = Array.from({ length: 30 }, (_, paragraphIndex) => {
      const number = sectionIndex * 30 + paragraphIndex + 1
      return `<p id="paragraph-${number}">EPUB reprise de test, paragraphe <span>${number}</span>. Ce texte permet de créer plusieurs emplacements de lecture, dont une <em>position vérifiable</em>.</p>`
    }).join('')
    return {
      id,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapitre EPUB ${sectionIndex + 1}</title></head>
<body><h1>Chapitre EPUB de test</h1>${paragraphs}</body></html>`,
    }
  })
  archive.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  archive.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  archive.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">yomu-epub-test</dc:identifier>
    <dc:title>EPUB de test</dc:title>
    <dc:language>fr</dc:language>
  </metadata>
  <manifest>${sections.map(({ id }) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
  <spine page-progression-direction="${direction}">${sections.map(({ id }) => `<itemref idref="${id}"/>`).join('')}</spine>
</package>`)
  for (const section of sections) archive.file(`OEBPS/${section.id}.xhtml`, section.content)
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function captureShortcut(page, label, key) {
  await page.getByRole('button', { name: `Change shortcut: ${label}` }).click()
  const captureButton = page.getByRole('button', { name: `Press a key for ${label}` })
  await captureButton.waitFor()
  await captureButton.press(key)
}

async function visibleEpubParagraphs(frame) {
  return frame.locator('p').evaluateAll((paragraphs) => paragraphs
    .filter((paragraph) => Array.from(paragraph.getClientRects()).some((rect) =>
      rect.width > 0
      && rect.height > 0
      && rect.right > 0
      && rect.left < window.innerWidth
      && rect.bottom > 0
      && rect.top < window.innerHeight,
    ))
    .map((paragraph) => paragraph.textContent?.trim()))
}

test('Yomu démarre avec un profil temporaire, lit un chapitre fictif et supprime la collection', { timeout: 60_000 }, async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-e2e-'))
  const appData = path.join(temporaryRoot, 'Profile')
  const userData = path.join(appData, 'yomu')
  const libraryRoot = path.join(temporaryRoot, 'Bibliotheque')
  const copiedLibraryRoot = path.join(temporaryRoot, 'Bibliotheque-copie')
  const movedLibraryRoot = path.join(temporaryRoot, 'Bibliotheque-deplacee')
  const restoredLibraryRoot = path.join(temporaryRoot, 'Bibliotheque-restauree')
  const backupArchivePath = path.join(temporaryRoot, 'sauvegarde-yomu.zip')
  const sourceChapterPath = path.join(temporaryRoot, 'fixtures', 'Chapitre 1.pdf')
  const invalidChapterPath = path.join(temporaryRoot, 'fixtures', 'Chapitre corrompu.pdf')
  const chapterFolderPath = path.join(temporaryRoot, 'chapitres-a-importer')
  const folderChapterPath = path.join(chapterFolderPath, 'sous-dossier', 'Chapitre dossier.pdf')
  const droppedChapterPath = path.join(temporaryRoot, 'fixtures', 'Chapitre déposé.pdf')
  const collectionId = 'e2e-collection-id'
  const collectionTitle = 'Collection de test E2E'
  const folderName = 'collection-e2e'
  const collectionDirectory = path.join(libraryRoot, folderName)
  const pdf = createPdf()
  const epub = await createEpub()
  const mangaCollectionId = 'e2e-manga-collection-id'
  const mangaCollectionTitle = 'Manga de test double page'
  const mangaFolderName = 'collection-manga-e2e'
  const mangaCollectionDirectory = path.join(libraryRoot, mangaFolderName)
  const mangaPdf = createPdf(5)
  const mangaCbz = await createCbz()
  const mangaEpub = await createEpub('rtl')
  const epubRelativePath = `${folderName}/Chapitres/chapitre-epub.epub`
  const settingsPath = path.join(userData, 'settings.json')
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  let application

  try {
    await mkdir(collectionDirectory, { recursive: true })
    await mkdir(path.dirname(sourceChapterPath), { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(settingsPath, `${JSON.stringify({ libraryRoot }, null, 2)}\n`)
    await writeFile(path.join(userData, 'reader-shortcuts.json'), `${JSON.stringify({
      mangaPreviousPage: 'ArrowLeft',
      mangaNextPage: 'ArrowRight',
      manhwaPreviousPage: 'ArrowUp',
      manhwaNextPage: 'ArrowDown',
      closeReader: 'Escape',
    })}\n`)
    await writeFile(sourceChapterPath, pdf)
    await writeFile(invalidChapterPath, "ceci n'est pas un PDF")
    await mkdir(path.dirname(folderChapterPath), { recursive: true })
    await writeFile(folderChapterPath, Buffer.concat([pdf, Buffer.from('\nfolder chapter')]))
    await writeFile(droppedChapterPath, Buffer.concat([pdf, Buffer.from('\ndropped chapter')]))
    await mkdir(path.dirname(path.join(libraryRoot, epubRelativePath)), { recursive: true })
    await writeFile(path.join(libraryRoot, epubRelativePath), epub)
    await mkdir(path.join(mangaCollectionDirectory, 'Chapitres'), { recursive: true })
    await writeFile(path.join(mangaCollectionDirectory, 'Chapitres', 'chapitre-manga.pdf'), mangaPdf)
    await writeFile(path.join(mangaCollectionDirectory, 'Chapitres', 'chapitre-manga.cbz'), mangaCbz)
    await writeFile(path.join(mangaCollectionDirectory, 'Chapitres', 'chapitre-manga.epub'), mangaEpub)
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
      books: [{
        id: 'e2e-epub-book-id',
        collectionId: collectionId,
        title: 'Chapitre EPUB de test',
        series: collectionTitle,
        chapter: 'Chapitre EPUB de test',
        language: 'fr',
        format: 'EPUB',
        fileName: 'chapitre-epub.epub',
        relativePath: epubRelativePath,
        size: mangaEpub.length,
        addedAt: 1_700_000_000_000,
        lastOpenedAt: null,
        progress: 60,
        readingPosition: { cfi: 'epubcfi(/6/2!/4/999/2:5)' },
      }],
    }, null, 2)}\n`)
    await writeFile(path.join(mangaCollectionDirectory, 'collection.json'), `${JSON.stringify({
      collection: {
        id: mangaCollectionId,
        title: mangaCollectionTitle,
        kind: 'Manga',
        status: 'reading',
        createdAt: 1_700_000_000_001,
        folderName: mangaFolderName,
        coverPath: null,
      },
      books: [
        {
          id: 'e2e-manga-pdf-id',
          collectionId: mangaCollectionId,
          title: 'Chapitre manga PDF',
          series: mangaCollectionTitle,
          chapter: 'Chapitre manga PDF',
          language: 'fr',
          format: 'PDF',
          fileName: 'chapitre-manga.pdf',
          relativePath: `${mangaFolderName}/Chapitres/chapitre-manga.pdf`,
          size: mangaPdf.length,
          addedAt: 1_700_000_000_001,
          lastOpenedAt: null,
          progress: 0,
        },
        {
          id: 'e2e-manga-cbz-id',
          collectionId: mangaCollectionId,
          title: 'Chapitre manga CBZ',
          series: mangaCollectionTitle,
          chapter: 'Chapitre manga CBZ',
          language: 'fr',
          format: 'CBZ',
          fileName: 'chapitre-manga.cbz',
          relativePath: `${mangaFolderName}/Chapitres/chapitre-manga.cbz`,
          size: mangaCbz.length,
          addedAt: 1_700_000_000_002,
          lastOpenedAt: null,
          progress: 0,
        },
        {
          id: 'e2e-manga-epub-id',
          collectionId: mangaCollectionId,
          title: 'Chapitre manga EPUB',
          series: mangaCollectionTitle,
          chapter: 'Chapitre manga EPUB',
          language: 'fr',
          format: 'EPUB',
          fileName: 'chapitre-manga.epub',
          relativePath: `${mangaFolderName}/Chapitres/chapitre-manga.epub`,
          size: epub.length,
          addedAt: 1_700_000_000_003,
          lastOpenedAt: null,
          progress: 0,
        },
      ],
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
    await captureShortcut(page, 'Next page (manhwa)', 'j')
    let savedShortcuts
    for (let attempt = 0; attempt < 30; attempt++) {
      savedShortcuts = JSON.parse(await readFile(path.join(userData, 'reader-shortcuts.json'), 'utf8'))
      if (savedShortcuts.manhwaNextPage === 'j') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(savedShortcuts?.manhwaNextPage, 'j')
    await page.getByRole('button', { name: 'Restore default shortcuts' }).click()
    for (let attempt = 0; attempt < 30; attempt++) {
      savedShortcuts = JSON.parse(await readFile(path.join(userData, 'reader-shortcuts.json'), 'utf8'))
      if (savedShortcuts.manhwaNextPage === 'ArrowDown') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.deepEqual(savedShortcuts, {
      mangaPreviousPage: 'ArrowLeft',
      mangaNextPage: 'ArrowRight',
      manhwaPreviousPage: 'ArrowUp',
      manhwaNextPage: 'ArrowDown',
      closeReader: 'Escape',
    })
    await captureShortcut(page, 'Next page (manhwa)', 'j')
    await captureShortcut(page, 'Back to library', 'q')
    for (let attempt = 0; attempt < 30; attempt++) {
      savedShortcuts = JSON.parse(await readFile(path.join(userData, 'reader-shortcuts.json'), 'utf8'))
      if (savedShortcuts.manhwaNextPage === 'j' && savedShortcuts.closeReader === 'q') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(savedShortcuts?.manhwaNextPage, 'j')
    assert.equal(savedShortcuts?.closeReader, 'q')
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
    const epubChapterButton = page.locator('.chapter-title').filter({ hasText: 'Chapitre EPUB de test' })
    await epubChapterButton.click()
    await page.locator('.epub-reader iframe').waitFor({ state: 'attached' })
    await page.waitForFunction(() => Boolean(document.querySelector('.epub-reader iframe')?.contentDocument?.body?.textContent?.trim()))
    let savedEpubBook
    for (let attempt = 0; attempt < 30; attempt++) {
      savedEpubBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books
        .find((book) => book.id === 'e2e-epub-book-id')
      if (savedEpubBook?.readingPosition?.cfi !== 'epubcfi(/6/2!/4/999/2:5)') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(savedEpubBook?.readingPosition?.cfi)
    assert.notEqual(savedEpubBook.readingPosition.cfi, 'epubcfi(/6/2!/4/999/2:5)')
    assert.ok(savedEpubBook.progress >= 50 && savedEpubBook.progress <= 70)
    const savedEpubCfi = savedEpubBook.readingPosition.cfi
    const epubFrame = await page.locator('.epub-reader iframe').contentFrame()
    await epubFrame.locator('body').press('j')
    for (let attempt = 0; attempt < 30; attempt++) {
      savedEpubBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books
        .find((book) => book.id === 'e2e-epub-book-id')
      if (savedEpubBook.readingPosition.cfi !== savedEpubCfi) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.notEqual(savedEpubBook.readingPosition.cfi, savedEpubCfi)
    const savedEpubNextCfi = savedEpubBook.readingPosition.cfi
    const epubParagraphsBeforeClose = await visibleEpubParagraphs(epubFrame)
    assert.ok(epubParagraphsBeforeClose.length > 0)
    await page.locator('.reader-heading').click()
    await page.keyboard.press('q')
    await page.locator('.reader-overlay').waitFor({ state: 'detached' })
    await epubChapterButton.click()
    await page.locator('.epub-reader iframe').waitFor({ state: 'attached' })
    await page.waitForFunction(() => Boolean(document.querySelector('.epub-reader iframe')?.contentDocument?.body?.textContent?.trim()))
    await page.locator('.epub-loading').waitFor({ state: 'detached' })
    const epubFrameAfterResume = await page.locator('.epub-reader iframe').contentFrame()
    assert.deepEqual(await visibleEpubParagraphs(epubFrameAfterResume), epubParagraphsBeforeClose)
    await page.getByRole('button', { name: 'Retour' }).click()
    savedEpubBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books
      .find((book) => book.id === 'e2e-epub-book-id')
    assert.equal(savedEpubBook.readingPosition.cfi, savedEpubNextCfi)

    await page.getByRole('button', { name: 'Toutes les collections', exact: true }).click()
    await page.getByRole('button', { name: `Ouvrir la collection ${mangaCollectionTitle}` }).click()
    const mangaPdfChapter = page.locator('.chapter-title').filter({ hasText: 'Chapitre manga PDF' })
    const mangaCbzChapter = page.locator('.chapter-title').filter({ hasText: 'Chapitre manga CBZ' })
    const mangaEpubChapter = page.locator('.chapter-title').filter({ hasText: 'Chapitre manga EPUB' })
    await page.waitForFunction(() => document.querySelector('.collection-detail-info > p')?.textContent?.includes('Total : 10 pages'))
    assert.match(await mangaPdfChapter.locator('span').textContent(), /5 pages/)
    assert.match(await mangaCbzChapter.locator('span').textContent(), /5 pages/)
    assert.doesNotMatch(await mangaEpubChapter.locator('span').textContent(), /pages/)
    await mangaPdfChapter.click()
    await page.locator('.pdf-page[data-page="1"]').waitFor()
    const pdfDoublePageToggle = page.getByRole('button', { name: 'Activer la double page' })
    assert.equal(await pdfDoublePageToggle.getAttribute('aria-pressed'), 'false')
    await pdfDoublePageToggle.click()
    await page.getByRole('button', { name: 'Désactiver la double page' }).waitFor()
    await page.getByRole('button', { name: 'Page suivante' }).click()
    await page.waitForFunction(() => document.querySelector('.pdf-page-count')?.textContent === '2–3 / 5')
    assert.deepEqual(await page.locator('.pdf-page').evaluateAll((pages) => pages.map((element) => Number(element.dataset.page))), [2, 3])
    assert.equal(await page.locator('.pdf-pages').evaluate((element) => getComputedStyle(element).direction), 'ltr')
    await page.getByRole('button', { name: 'Page suivante' }).click()
    await page.waitForFunction(() => document.querySelector('.pdf-page-count')?.textContent === '4–5 / 5')
    await page.getByRole('button', { name: 'Page précédente' }).click()
    await page.waitForFunction(() => document.querySelector('.pdf-page-count')?.textContent === '2–3 / 5')
    await page.getByRole('button', { name: 'Désactiver la double page' }).click()
    await page.waitForFunction(() => document.querySelector('.pdf-page-count')?.textContent === '2 / 5')
    await page.getByRole('button', { name: 'Retour' }).click()

    await mangaCbzChapter.click()
    await page.locator('.cbz-reader img').first().waitFor()
    const cbzDoublePageToggle = page.getByRole('button', { name: 'Activer la double page' })
    assert.equal(await cbzDoublePageToggle.getAttribute('aria-pressed'), 'false')
    await cbzDoublePageToggle.click()
    await page.getByRole('button', { name: 'Page suivante' }).click()
    await page.waitForFunction(() => document.querySelector('.page-count')?.textContent === '2–3 / 5')
    await page.waitForFunction(() => document.querySelectorAll('.cbz-reader img').length === 2)
    assert.deepEqual(await page.locator('.cbz-reader img').evaluateAll((images) => images.map((image) => image.alt)), ['Page 2', 'Page 3'])
    assert.equal(await page.locator('.cbz-reader').evaluate((element) => getComputedStyle(element).flexDirection), 'row')
    await page.getByRole('button', { name: 'Page suivante' }).click()
    await page.waitForFunction(() => document.querySelector('.page-count')?.textContent === '4–5 / 5')
    await page.getByRole('button', { name: 'Page précédente' }).click()
    await page.waitForFunction(() => document.querySelector('.page-count')?.textContent === '2–3 / 5')
    await page.getByRole('button', { name: 'Désactiver la double page' }).click()
    await page.waitForFunction(() => document.querySelector('.page-count')?.textContent === '2 / 5')
    await page.getByRole('button', { name: 'Retour' }).click()

    await mangaEpubChapter.click()
    await page.locator('.epub-reader iframe').waitFor({ state: 'attached' })
    await page.waitForFunction(() => Boolean(document.querySelector('.epub-reader iframe')?.contentDocument?.body?.textContent?.trim()))
    await page.getByRole('button', { name: 'Activer la double page' }).click()
    await page.waitForFunction(() => document.querySelector('.epub-reader .epub-container')?.getAttribute('dir') === 'ltr')
    await page.getByRole('button', { name: 'Désactiver la double page' }).click()
    await page.waitForFunction(() => document.querySelector('.epub-reader .epub-container')?.getAttribute('dir') === 'rtl')
    await page.getByRole('button', { name: 'Retour' }).click()
    await page.getByRole('button', { name: `Supprimer ${mangaCollectionTitle}` }).click()
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
    await page.getByRole('heading', { name: mangaCollectionTitle, exact: true }).waitFor({ state: 'detached' })
    await collectionButton.click()

    await application.evaluate(({ dialog }, selectedFilePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFilePath] })
    }, sourceChapterPath)
    await page.locator('.detail-actions button.button-primary').click()
    await page.getByRole('dialog', { name: 'Choisis la langue' }).getByRole('button', { name: 'Français' }).click()
    const chapterButton = page.locator('.chapter-title').filter({ hasText: 'Chapitre 1' })
    await chapterButton.waitFor({ state: 'visible' })
    const importedCollection = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8'))
    assert.equal(importedCollection.books.length, 2)
    const importedPdfBook = importedCollection.books.find((book) => book.format === 'PDF')
    assert.equal(importedPdfBook.language, 'fr')
    assert.deepEqual(await readFile(path.join(libraryRoot, importedPdfBook.relativePath)), pdf)

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
      const savedBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books
        .find((book) => book.format === 'PDF')
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

    await application.evaluate(({ dialog }, selectedFilePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selectedFilePaths })
    }, [sourceChapterPath, invalidChapterPath])
    await page.locator('.detail-actions button.button-primary').click()
    await page.getByRole('dialog', { name: 'Choisis la langue' }).getByRole('button', { name: 'Français' }).click()
    await page.locator('.success-banner').getByText('Import terminé : 1 chapitre ajouté, 1 doublon ignoré.').waitFor()
    assert.equal(JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books.length, 3)

    await application.evaluate(({ dialog }, selectedFolderPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFolderPath] })
    }, chapterFolderPath)
    await page.getByRole('button', { name: 'Importer un dossier' }).click()
    await page.getByRole('dialog', { name: 'Choisis la langue' }).getByRole('button', { name: 'Français' }).click()
    await page.locator('.success-banner').getByText('Import terminé : 1 chapitre ajouté, aucun doublon détecté.').waitFor()
    let importedFolderBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books
      .find((book) => book.fileName === 'Chapitre dossier.pdf')
    assert.ok(importedFolderBook)
    assert.deepEqual(await readFile(path.join(libraryRoot, importedFolderBook.relativePath)), Buffer.concat([pdf, Buffer.from('\nfolder chapter')]))

    await page.evaluateHandle(() => {
      const input = document.createElement('input')
      input.type = 'file'
      input.id = 'e2e-drop-file'
      document.body.append(input)
      return input
    })
    await page.locator('#e2e-drop-file').setInputFiles(droppedChapterPath)
    await page.locator('#e2e-drop-file').evaluate((input) => {
      const transfer = new DataTransfer()
      transfer.items.add(input.files[0])
      const target = document.querySelector('.collection-detail')
      window.yomuE2eDrop = { transfer, target }
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    })
    await page.locator('.collection-drop-overlay').waitFor()
    await page.evaluate(() => {
      const { transfer, target } = window.yomuE2eDrop
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
      delete window.yomuE2eDrop
      document.querySelector('#e2e-drop-file').remove()
    })
    await page.getByRole('dialog', { name: 'Choisis la langue' }).getByRole('button', { name: 'Français' }).click()
    await page.locator('.success-banner').getByText('Import terminé : 1 chapitre ajouté, aucun doublon détecté.').waitFor()
    const importedDropBook = JSON.parse(await readFile(path.join(collectionDirectory, 'collection.json'), 'utf8')).books
      .find((book) => book.fileName === 'Chapitre déposé.pdf')
    assert.ok(importedDropBook)
    assert.deepEqual(await readFile(path.join(libraryRoot, importedDropBook.relativePath)), Buffer.concat([pdf, Buffer.from('\ndropped chapter')]))

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

    await page.locator('.sidebar-settings').click()
    await mkdir(copiedLibraryRoot)
    await application.evaluate(({ dialog }, selectedRoot) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedRoot] })
      dialog.showMessageBox = async () => ({ response: 0 })
    }, copiedLibraryRoot)
    await page.getByRole('button', { name: 'Changer de dossier' }).click()
    for (let attempt = 0; attempt < 30; attempt++) {
      if (JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot === copiedLibraryRoot) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot, copiedLibraryRoot)
    assert.ok((await stat(path.join(copiedLibraryRoot, folderName))).isDirectory())
    assert.ok((await stat(collectionDirectory)).isDirectory())

    await mkdir(movedLibraryRoot)
    await application.evaluate(({ dialog }, selectedRoot) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedRoot] })
      dialog.showMessageBox = async () => ({ response: 1 })
    }, movedLibraryRoot)
    await page.getByRole('button', { name: 'Changer de dossier' }).click()
    for (let attempt = 0; attempt < 30; attempt++) {
      if (JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot === movedLibraryRoot) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot, movedLibraryRoot)
    await assert.rejects(stat(path.join(copiedLibraryRoot, folderName)), { code: 'ENOENT' })
    assert.ok((await stat(path.join(movedLibraryRoot, folderName))).isDirectory())

    await mkdir(restoredLibraryRoot)
    await application.evaluate(({ dialog }, selectedArchivePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedArchivePath })
    }, backupArchivePath)
    await page.getByRole('button', { name: 'Sauvegarder la bibliothèque' }).click()
    await page.locator('.success-banner').getByText('Sauvegarde créée').waitFor()
    assert.ok((await stat(backupArchivePath)).isFile())
    const metadataBeforeRestore = JSON.parse(await readFile(path.join(movedLibraryRoot, folderName, 'collection.json'), 'utf8'))

    await application.evaluate(({ dialog }, paths) => {
      let selection = 0
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[selection++]] })
    }, [backupArchivePath, restoredLibraryRoot])
    await page.getByRole('button', { name: 'Restaurer une sauvegarde' }).click()
    await page.locator('.success-banner').getByText('Sauvegarde restaurée dans').waitFor()
    assert.equal(JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot, restoredLibraryRoot)
    assert.ok((await stat(path.join(movedLibraryRoot, folderName))).isDirectory())
    assert.ok((await stat(path.join(restoredLibraryRoot, folderName))).isDirectory())
    const restoredMetadata = JSON.parse(await readFile(path.join(restoredLibraryRoot, folderName, 'collection.json'), 'utf8'))
    assert.deepEqual(restoredMetadata, metadataBeforeRestore)

    await page.getByRole('button', { name: 'Changer de dossier' }).waitFor()
    await page.getByRole('button', { name: /Toutes les collections/ }).click()
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
    await assert.rejects(stat(path.join(restoredLibraryRoot, folderName)), { code: 'ENOENT' })
    assert.ok((await stat(path.join(movedLibraryRoot, folderName))).isDirectory())
    assert.deepEqual(pageErrors, [])
    assert.equal(JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot, restoredLibraryRoot)
  } finally {
    if (application) await application.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
