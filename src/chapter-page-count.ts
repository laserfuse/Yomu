import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export async function countChapterPages(format: 'PDF' | 'CBZ', bytes: Uint8Array): Promise<number> {
  if (format === 'CBZ') {
    const JSZip = (await import('jszip')).default
    const archive = await JSZip.loadAsync(bytes)
    const pageCount = Object.values(archive.files)
      .filter((entry) => !entry.dir && /\.(jpe?g|png|gif|webp|avif)$/i.test(entry.name))
      .length
    if (pageCount === 0) throw new Error('Aucune page image n’a été trouvée dans cette archive CBZ.')
    return pageCount
  }

  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) })
  try {
    const document = await loadingTask.promise
    if (document.numPages === 0) throw new Error('Ce fichier PDF ne contient aucune page.')
    return document.numPages
  } finally {
    await loadingTask.destroy()
  }
}
