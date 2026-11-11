import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('les ressources de la page compilée sont accessibles depuis une URL file', async () => {
  const indexPath = path.resolve('dist', 'index.html')
  const html = await readFile(indexPath, 'utf8')
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  const styles = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/g)]
  assert.ok(scripts.length > 0, 'Le script de l’application est absent.')
  assert.ok(styles.length > 0, 'La feuille de style de l’application est absente.')

  for (const [, asset] of [...scripts, ...styles]) {
    assert.ok(asset.startsWith('./'), `Le chemin ${asset} doit être relatif à index.html.`)
    const assetPath = fileURLToPath(new URL(asset, pathToFileURL(indexPath)))
    assert.ok((await stat(assetPath)).isFile(), `La ressource ${asset} est introuvable.`)
  }
})
