import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, lstat, mkdir, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises'
import path from 'node:path'

async function fileDigest(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function createManifest(root: string): Promise<string[]> {
  const manifest: string[] = []
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name)
      const relativePath = path.join(relativeDirectory, entry.name)
      const info = await lstat(filePath)
      if (info.isSymbolicLink()) throw new Error(`Le transfert ne prend pas en charge les liens symboliques : ${relativePath}`)
      if (info.isDirectory()) {
        manifest.push(`directory:${relativePath}`)
        await visit(filePath, relativePath)
      } else if (info.isFile()) {
        manifest.push(`file:${relativePath}:${info.size}:${await fileDigest(filePath)}`)
      } else {
        throw new Error(`Le transfert ne prend pas en charge ce type de fichier : ${relativePath}`)
      }
    }
  }
  await visit(root, '')
  return manifest
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

export async function copyLibraryContents(sourceRoot: string, destinationRoot: string): Promise<void> {
  const sourceInfo = await lstat(sourceRoot)
  const destinationInfo = await lstat(destinationRoot)
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error('La bibliothèque source doit être un dossier normal.')
  if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()) throw new Error('La destination doit être un dossier normal.')

  const source = await realpath(sourceRoot)
  const destination = await realpath(destinationRoot)
  if (isWithin(source, destination) || isWithin(destination, source)) {
    throw new Error('La source et la destination ne peuvent pas être imbriquées.')
  }
  if ((await readdir(destination)).length > 0) {
    throw new Error('Le transfert nécessite un dossier de destination vide.')
  }

  const sourceManifest = await createManifest(source)
  const staging = path.join(path.dirname(destination), `.yomu-transfer-${randomUUID()}`)
  try {
    await cp(source, staging, { recursive: true, errorOnExist: true, force: false })
    const [currentSourceManifest, copiedManifest] = await Promise.all([
      createManifest(source),
      createManifest(staging),
    ])
    if (JSON.stringify(sourceManifest) !== JSON.stringify(currentSourceManifest)
      || JSON.stringify(sourceManifest) !== JSON.stringify(copiedManifest)) {
      throw new Error('La bibliothèque a changé pendant le transfert ou la copie n’est pas complète. La source a été conservée.')
    }
    if ((await readdir(destination)).length > 0) {
      throw new Error('La destination n’est plus vide. La source a été conservée.')
    }

    await rmdir(destination)
    try {
      await rename(staging, destination)
    } catch (reason) {
      await mkdir(destination)
      throw reason
    }
  } catch (reason) {
    await rm(staging, { recursive: true, force: true })
    throw reason
  }
}
