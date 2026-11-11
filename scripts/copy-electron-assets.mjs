import { copyFile, mkdir } from 'node:fs/promises'

await mkdir('dist-electron', { recursive: true })
await copyFile('electron/preload.cjs', 'dist-electron/preload.cjs')
