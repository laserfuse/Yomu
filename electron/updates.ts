import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import type { UpdateState } from './update-types.js'

interface Updater {
  checkForUpdates(): Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } } | null>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(): void
}

export class UpdateManager {
  private state: UpdateState
  private busy = false
  private readonly updater: Updater
  private readonly settingsPath: string
  private readonly supported: boolean
  private readonly publish: (state: UpdateState) => void

  constructor(
    updater: Updater,
    settingsPath: string,
    version: string,
    supported: boolean,
    publish: (state: UpdateState) => void,
  ) {
    this.updater = updater
    this.settingsPath = settingsPath
    this.supported = supported
    this.publish = publish
    this.state = { version, supported, automatic: false, phase: supported ? 'idle' : 'unsupported', availableVersion: null, progress: null, message: null }
  }

  snapshot(): UpdateState {
    return { ...this.state }
  }

  private change(changes: Partial<UpdateState>): void {
    this.state = { ...this.state, ...changes }
    this.publish(this.snapshot())
  }

  reportError(reason: unknown): void {
    const message = reason instanceof Error ? reason.message : String(reason)
    this.change({ phase: 'error', progress: null, message })
  }

  async initialize(): Promise<void> {
    let data: string
    try {
      data = await readFile(this.settingsPath, 'utf8')
    } catch (reason) {
      if (typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === 'ENOENT') return
      throw reason
    }
    const settings: unknown = JSON.parse(data)
    if (typeof settings !== 'object' || settings === null || !('automatic' in settings) || typeof settings.automatic !== 'boolean') {
      throw new Error('Les paramètres de mise à jour sont invalides.')
    }
    this.change({ automatic: settings.automatic })
  }

  async setAutomatic(automatic: boolean): Promise<void> {
    if (!this.supported) throw new Error('Les mises à jour sont disponibles uniquement dans l’application Windows installée.')
    const temporaryPath = `${this.settingsPath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify({ automatic }, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.settingsPath)
    this.change({ automatic })
  }

  async check(): Promise<void> {
    if (!this.supported) throw new Error('Les mises à jour sont disponibles uniquement dans l’application Windows installée.')
    if (this.busy) throw new Error('Une opération de mise à jour est déjà en cours.')
    if (this.state.phase === 'downloaded') throw new Error('Une mise à jour est déjà prête à être installée.')
    this.busy = true
    this.change({ phase: 'checking', availableVersion: null, progress: null, message: null })
    try {
      const result = await this.updater.checkForUpdates()
      if (!result) throw new Error('La vérification des mises à jour est indisponible.')
      this.change({
        phase: result.isUpdateAvailable ? 'available' : 'current',
        availableVersion: result.isUpdateAvailable ? result.updateInfo.version : null,
      })
    } catch (reason) {
      this.reportError(reason)
    } finally {
      this.busy = false
    }
  }

  async download(): Promise<void> {
    if (this.busy || this.state.phase !== 'available') throw new Error('Aucune mise à jour n’est prête à être téléchargée.')
    this.busy = true
    this.change({ phase: 'downloading', progress: 0, message: null })
    try {
      await this.updater.downloadUpdate()
      this.change({ phase: 'downloaded', progress: 100 })
    } catch (reason) {
      this.reportError(reason)
    } finally {
      this.busy = false
    }
  }

  progress(percent: number): void {
    if (this.state.phase === 'downloading' && Number.isFinite(percent)) {
      this.change({ progress: Math.max(0, Math.min(100, Math.round(percent))) })
    }
  }

  install(): void {
    if (this.busy || this.state.phase !== 'downloaded') throw new Error('Aucune mise à jour n’est prête à être installée.')
    this.updater.quitAndInstall()
  }
}
