import assert from 'node:assert/strict'
import test from 'node:test'
import { validReadingPosition } from '../dist-electron/reading-position.js'
import { initialPage, initialPagePosition, pageAtViewportCenter, pagePositionAtViewportCenter, pageFromProgress } from '../src/reading-position.ts'

test('la reprise privilégie la page enregistrée et borne les anciennes progressions', () => {
  assert.equal(initialPage({ page: 8 }, 20, 10), 8)
  assert.equal(initialPage({ page: 20 }, 20, 10), 10)
  assert.equal(initialPage(undefined, 35, 10), 4)
  assert.deepEqual(initialPagePosition({ page: 8, offset: 0.75 }, 20, 10), { page: 8, offset: 0.75 })
  assert.deepEqual(initialPagePosition({ page: 8 }, 20, 10), { page: 8 })
  assert.equal(pageFromProgress(0, 10), 1)
  assert.equal(pageFromProgress(100, 10), 10)
  assert.equal(pageFromProgress(67, 3), 2)
})

test('la page active suit le centre de la fenêtre même pour les pages très hautes', () => {
  const pages = [
    { page: 1, top: -1500, bottom: 500 },
    { page: 2, top: 500, bottom: 2500 },
    { page: 3, top: 2510, bottom: 4510 },
  ]
  assert.equal(pageAtViewportCenter(pages, 300), 1)
  assert.equal(pageAtViewportCenter(pages, 600), 2)
  assert.equal(pageAtViewportCenter(pages, 2509), 3)
  assert.deepEqual(pagePositionAtViewportCenter(pages, 600), { page: 2, offset: 0.05 })
  assert.equal(pageAtViewportCenter([], 100), null)
  assert.equal(pagePositionAtViewportCenter([], 100), null)
})

test('les positions sont optionnelles et adaptées au format', () => {
  assert.equal(validReadingPosition(undefined, 'PDF'), true)
  assert.equal(validReadingPosition({ page: 2 }, 'PDF'), true)
  assert.equal(validReadingPosition({ page: 2, offset: 0 }, 'PDF'), true)
  assert.equal(validReadingPosition({ page: 2, offset: 1 }, 'PDF'), true)
  assert.equal(validReadingPosition({ page: 2 }, 'CBZ'), true)
  assert.equal(validReadingPosition({ page: 2, offset: 0.5 }, 'CBZ'), false)
  assert.equal(validReadingPosition({ cfi: 'epubcfi(/6/2)' }, 'EPUB'), true)
  assert.equal(validReadingPosition({ page: 0 }, 'PDF'), false)
  assert.equal(validReadingPosition({ page: 1.5 }, 'PDF'), false)
  assert.equal(validReadingPosition({ page: 2, offset: -0.1 }, 'PDF'), false)
  assert.equal(validReadingPosition({ page: 2, offset: 1.1 }, 'PDF'), false)
  assert.equal(validReadingPosition({ page: 2, offset: Number.NaN }, 'PDF'), false)
  assert.equal(validReadingPosition({ page: 2 }, 'EPUB'), false)
  assert.equal(validReadingPosition({ cfi: '' }, 'EPUB'), false)
  assert.equal(validReadingPosition(null, 'PDF'), false)
})
