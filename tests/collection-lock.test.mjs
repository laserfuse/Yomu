import assert from 'node:assert/strict'
import test from 'node:test'
import { withCollectionWriteLock } from '../dist-electron/collection-lock.js'

test('les écritures d’une collection sont sérialisées et celles des autres collections restent indépendantes', async () => {
  let active = 0
  let maximumActive = 0
  const write = async (collectionId) => withCollectionWriteLock(collectionId, async () => {
    active++
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 10))
    active--
  })

  await Promise.all([write('collection-a'), write('collection-a'), write('collection-b')])
  assert.equal(maximumActive, 2)
})

test('une erreur ne bloque pas les écritures suivantes de la collection', async () => {
  await assert.rejects(withCollectionWriteLock('collection-c', async () => {
    throw new Error('échec attendu')
  }), /échec attendu/)

  await assert.doesNotReject(withCollectionWriteLock('collection-c', async () => 'ok'))
})
