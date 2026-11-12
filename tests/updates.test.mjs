import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { UpdateManager } from '../dist-electron/updates.js'

async function fixture(run, supported = true) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yomu-updates-test-'))
  const settings = path.join(dir, 'updates.json')
  const calls = { checks: 0, downloads: 0, installs: 0 }
  const updater = {
    async checkForUpdates() {
      calls.checks++
      return { isUpdateAvailable: true, updateInfo: { version: '0.0.2' } }
    },
    async downloadUpdate() { calls.downloads++; return ['update.exe'] },
    quitAndInstall() { calls.installs++ },
  }
  const events = []
  const manager = new UpdateManager(updater, settings, '0.0.1', supported, (state) => events.push(state))
  try {
    await run({ manager, updater, calls, events, settings })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('le choix est désactivé par défaut, enregistré et relu', async () => {
  await fixture(async ({ manager, settings, calls }) => {
    await manager.initialize()
    assert.equal(manager.snapshot().automatic, false)
    await manager.setAutomatic(true)
    assert.deepEqual(JSON.parse(await readFile(settings, 'utf8')), { automatic: true })
    const restored = new UpdateManager({}, settings, '0.0.1', true, () => {})
    await restored.initialize()
    assert.equal(restored.snapshot().automatic, true)
    assert.equal(calls.checks, 0)
    await restored.setAutomatic(false)
    await manager.initialize()
    assert.equal(manager.snapshot().automatic, false)
  })
})

test('la vérification, le téléchargement et l’installation exigent des actions distinctes', async () => {
  await fixture(async ({ manager, calls, events }) => {
    assert.throws(() => manager.install(), /Aucune mise à jour/)
    await assert.rejects(manager.download(), /Aucune mise à jour/)
    await manager.check()
    assert.equal(manager.snapshot().phase, 'available')
    assert.equal(manager.snapshot().availableVersion, '0.0.2')
    assert.deepEqual(calls, { checks: 1, downloads: 0, installs: 0 })
    await manager.download()
    assert.equal(manager.snapshot().phase, 'downloaded')
    assert.equal(calls.installs, 0)
    await assert.rejects(manager.check(), /déjà prête/)
    manager.install()
    assert.deepEqual(calls, { checks: 1, downloads: 1, installs: 1 })
    assert.deepEqual(events.map((state) => state.phase), ['checking', 'available', 'downloading', 'downloaded'])
  })
})

test('une version à jour et les erreurs réseau sont clairement distinguées', async () => {
  await fixture(async ({ manager, updater }) => {
    updater.checkForUpdates = async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.0.1' } })
    await manager.check()
    assert.equal(manager.snapshot().phase, 'current')
    updater.checkForUpdates = async () => { throw new Error('réseau indisponible') }
    await manager.check()
    assert.equal(manager.snapshot().phase, 'error')
    assert.match(manager.snapshot().message, /réseau indisponible/)
    await assert.rejects(manager.download(), /Aucune mise à jour/)
  })
})

test('les erreurs de téléchargement sont signalées et permettent une nouvelle vérification', async () => {
  await fixture(async ({ manager, updater }) => {
    await manager.check()
    updater.downloadUpdate = async () => { throw new Error('téléchargement interrompu') }
    await manager.download()
    assert.equal(manager.snapshot().phase, 'error')
    assert.match(manager.snapshot().message, /interrompu/)
    await manager.check()
    assert.equal(manager.snapshot().phase, 'available')
  })
})

test('les vérifications concurrentes sont refusées', async () => {
  await fixture(async ({ manager, updater }) => {
    let finish
    updater.checkForUpdates = () => new Promise((resolve) => { finish = resolve })
    const checking = manager.check()
    await assert.rejects(manager.check(), /déjà en cours/)
    finish({ isUpdateAvailable: false, updateInfo: { version: '0.0.1' } })
    await checking
    assert.equal(manager.snapshot().phase, 'current')
  })
})

test('les réglages invalides sont signalés sans être remplacés', async () => {
  await fixture(async ({ manager, settings }) => {
    await writeFile(settings, '{"automatic":"oui"}')
    await assert.rejects(manager.initialize(), /invalides/)
    assert.equal(await readFile(settings, 'utf8'), '{"automatic":"oui"}')
  })
})

test('la mise à jour est indisponible hors application installée', async () => {
  await fixture(async ({ manager, calls }) => {
    assert.equal(manager.snapshot().phase, 'unsupported')
    await assert.rejects(manager.check(), /uniquement/)
    await assert.rejects(manager.setAutomatic(true), /uniquement/)
    assert.equal(calls.checks, 0)
  }, false)
})

test('la progression est bornée et ignorée hors téléchargement', async () => {
  await fixture(async ({ manager, updater }) => {
    manager.progress(50)
    assert.equal(manager.snapshot().progress, null)
    await manager.check()
    updater.downloadUpdate = async () => {
      manager.progress(125)
      assert.equal(manager.snapshot().progress, 100)
      manager.progress(43.6)
      assert.equal(manager.snapshot().progress, 44)
      manager.progress(Number.NaN)
      assert.equal(manager.snapshot().progress, 44)
      return []
    }
    await manager.download()
    assert.equal(manager.snapshot().progress, 100)
  })
})
