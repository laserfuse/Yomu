import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readLockedPdfZoom, writeLockedPdfZoom } from '../dist-electron/reading-settings.js'

test('le zoom verrouillé est persistant et propre à chaque collection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yomu-zoom-test-'))
  const first = path.join(root, 'collection-a')
  const second = path.join(root, 'collection-b')
  try {
    await mkdir(first)
    await mkdir(second)
    assert.equal(await readLockedPdfZoom(first), null)
    await writeLockedPdfZoom(first, 0.5)
    assert.equal(await readLockedPdfZoom(first), 0.5)
    assert.equal(await readLockedPdfZoom(second), null)
    await writeLockedPdfZoom(second, 1.5)
    assert.equal(await readLockedPdfZoom(first), 0.5)
    assert.equal(await readLockedPdfZoom(second), 1.5)
    await writeLockedPdfZoom(first, null)
    assert.equal(await readLockedPdfZoom(first), null)
    assert.equal(await readLockedPdfZoom(second), 1.5)
    assert.deepEqual(JSON.parse(await readFile(path.join(first, 'lecture.json'), 'utf8')), { lockedPdfZoom: null })
    await assert.rejects(writeLockedPdfZoom(first, 0.1))
    await assert.rejects(writeLockedPdfZoom(first, 3.1))
    assert.equal(await readLockedPdfZoom(first), null)
    await writeFile(path.join(first, 'lecture.json'), '{"lockedPdfZoom": 0.1}')
    await assert.rejects(readLockedPdfZoom(first))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
