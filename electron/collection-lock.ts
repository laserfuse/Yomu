const collectionWriteQueues = new Map<string, Promise<void>>()

export async function withCollectionWriteLock<T>(collectionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = collectionWriteQueues.get(collectionId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  collectionWriteQueues.set(collectionId, queued)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (collectionWriteQueues.get(collectionId) === queued) collectionWriteQueues.delete(collectionId)
  }
}
