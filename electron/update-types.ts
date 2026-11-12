export type UpdatePhase = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error' | 'unsupported'

export interface UpdateState {
  version: string
  supported: boolean
  automatic: boolean
  phase: UpdatePhase
  availableVersion: string | null
  progress: number | null
  message: string | null
}
