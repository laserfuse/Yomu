import { createHash } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { lock } from 'proper-lockfile'

const collectionWriteQueues = new Map<string, Promise<void>>()
const lockOptions = {
  realpath: false,
  stale: 30_000,
  update: 10_000,
  retries: { retries: 120, factor: 1.2, minTimeout: 100, maxTimeout: 1_000, randomize: true },
}

async function getLockDetails(libraryRoot: string, collectionId: string): Promise<string> {
  const resolvedRoot = await realpath(libraryRoot)
  const normalizedRoot = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  return createHash('sha256').update(normalizedRoot).update('\0').update(collectionId).digest('hex')
}

export async function withCollectionWriteLock<T>(
  lockDirectory: string,
  libraryRoot: string,
  collectionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockKey = await getLockDetails(libraryRoot, collectionId)
  const previous = collectionWriteQueues.get(lockKey) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  collectionWriteQueues.set(lockKey, queued)

  await previous
  let releaseProcessLock: (() => Promise<void>) | undefined
  try {
    await mkdir(lockDirectory, { recursive: true })
    releaseProcessLock = await lock(path.join(lockDirectory, lockKey), lockOptions)
    return await operation()
  } finally {
    try {
      if (releaseProcessLock) await releaseProcessLock()
    } finally {
      release()
      if (collectionWriteQueues.get(lockKey) === queued) collectionWriteQueues.delete(lockKey)
    }
  }
}
