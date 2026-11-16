import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { withCollectionWriteLock } from '../dist-electron/collection-lock.js'

test('les écritures d’une collection sont sérialisées et celles des autres collections restent indépendantes', async () => {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-lock-test-'))
  const lockDirectory = path.join(libraryRoot, 'locks')
  try {
    let active = 0
    let maximumActive = 0
    const write = async (collectionId) => withCollectionWriteLock(lockDirectory, libraryRoot, collectionId, async () => {
      active++
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active--
    })

    await Promise.all([write('collection-a'), write('collection-a'), write('collection-b')])
    assert.equal(maximumActive, 2)
  } finally {
    await rm(libraryRoot, { recursive: true, force: true })
  }
})

test('une erreur ne bloque pas les écritures suivantes de la collection', async () => {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-lock-test-'))
  const lockDirectory = path.join(libraryRoot, 'locks')
  try {
    await assert.rejects(withCollectionWriteLock(lockDirectory, libraryRoot, 'collection-c', async () => {
      throw new Error('échec attendu')
    }), /échec attendu/)

    await assert.doesNotReject(withCollectionWriteLock(lockDirectory, libraryRoot, 'collection-c', async () => 'ok'))
  } finally {
    await rm(libraryRoot, { recursive: true, force: true })
  }
})

test('les écritures d’une collection sont sérialisées entre plusieurs processus', async () => {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), 'yomu-lock-process-test-'))
  const lockDirectory = path.join(libraryRoot, 'locks')
  const logPath = path.join(libraryRoot, 'writes.log')
  const moduleUrl = new URL('../dist-electron/collection-lock.js', import.meta.url).href
  const script = `
    import { appendFile } from 'node:fs/promises'
    const { withCollectionWriteLock } = await import(${JSON.stringify(moduleUrl)})
    const {
      YOMU_LOCK_TEST_LOCKS: lock,
      YOMU_LOCK_TEST_ROOT: root,
      YOMU_LOCK_TEST_LOG: log,
      YOMU_LOCK_TEST_LABEL: label,
    } = process.env
    await withCollectionWriteLock(lock, root, 'shared-collection', async () => {
      await appendFile(log, label + ':start\\n')
      await new Promise((resolve) => setTimeout(resolve, 150))
      await appendFile(log, label + ':end\\n')
    })
  `
  const runProcess = (label) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: {
        ...process.env,
        YOMU_LOCK_TEST_ROOT: libraryRoot,
        YOMU_LOCK_TEST_LOCKS: lockDirectory,
        YOMU_LOCK_TEST_LOG: logPath,
        YOMU_LOCK_TEST_LABEL: label,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `Le processus de test a quitté avec le code ${code}.`))
    })
  })

  try {
    await Promise.all([runProcess('A'), runProcess('B')])
    const writes = (await readFile(logPath, 'utf8')).trim().split('\n')
    assert.equal(writes.length, 4)
    const firstLabel = writes[0].split(':')[0]
    const secondLabel = firstLabel === 'A' ? 'B' : 'A'
    assert.deepEqual(writes, [`${firstLabel}:start`, `${firstLabel}:end`, `${secondLabel}:start`, `${secondLabel}:end`])
  } finally {
    await rm(libraryRoot, { recursive: true, force: true })
  }
})
