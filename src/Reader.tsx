import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import ePub from 'epubjs'
import type Rendition from 'epubjs/types/rendition'
import JSZip from 'jszip'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole, LockKeyholeOpen, Maximize, Minimize, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { CollectionKind, LibraryBook } from './library'

interface ReaderProps {
  book: LibraryBook
  collectionKind: CollectionKind
  onClose: () => void
  onProgress: (progress: number) => void
}

function PageNavigation({ onPrevious, onNext, previousDisabled, nextDisabled }: {
  onPrevious: () => void
  onNext: () => void
  previousDisabled: boolean
  nextDisabled: boolean
}) {
  return (
    <>
      <button className="page-nav page-prev manga-page-nav" aria-label="Page précédente" title="Page précédente" disabled={previousDisabled} onClick={onPrevious}><ArrowLeft size={18} /></button>
      <button className="page-nav page-next manga-page-nav" aria-label="Page suivante" title="Page suivante" disabled={nextDisabled} onClick={onNext}><ArrowRight size={18} /></button>
    </>
  )
}

function handlePageNavigationKeyDown(event: KeyboardEvent, collectionKind: CollectionKind, onPrevious: () => void, onNext: () => void) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const eventTarget = event.target
  if (eventTarget && typeof eventTarget === 'object' && 'tagName' in eventTarget) {
    const target = eventTarget as HTMLElement
    if (target.isContentEditable || target.closest('input, textarea, select')) return
  }
  const previousKey = collectionKind === 'Manga' ? 'ArrowLeft' : 'ArrowUp'
  const nextKey = collectionKind === 'Manga' ? 'ArrowRight' : 'ArrowDown'
  if (event.key === previousKey) {
    event.preventDefault()
    onPrevious()
  } else if (event.key === nextKey) {
    event.preventDefault()
    onNext()
  }
}

function usePageKeyboardNavigation(collectionKind: CollectionKind, onPrevious: () => void, onNext: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => handlePageNavigationKeyDown(event, collectionKind, onPrevious, onNext)
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [collectionKind, enabled, onNext, onPrevious])
}

function useContinuousPdfScrollNavigation(scrollRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let activeDirection: -1 | 1 | null = null
    let animationFrame = 0
    let previousTime = 0
    let keyDownTime = 0

    const stopScrolling = () => {
      if (activeDirection === null) return
      const duration = performance.now() - keyDownTime
      const direction = activeDirection
      activeDirection = null
      cancelAnimationFrame(animationFrame)
      if (duration < 100) {
        scrollRef.current?.scrollBy({ top: direction * 48, behavior: 'smooth' })
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') stopScrolling()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const eventTarget = event.target
      if (eventTarget && typeof eventTarget === 'object' && 'tagName' in eventTarget) {
        const target = eventTarget as HTMLElement
        if (target.isContentEditable || target.closest('input, textarea, select')) return
      }
      event.preventDefault()
      if (activeDirection !== null) return
      activeDirection = event.key === 'ArrowUp' ? -1 : 1
      keyDownTime = performance.now()
      previousTime = keyDownTime
      const scrollContinuously = (time: number) => {
        if (activeDirection === null) return
        const elapsed = Math.min(time - previousTime, 32)
        previousTime = time
        if (scrollRef.current) scrollRef.current.scrollTop += activeDirection * elapsed * 0.6
        animationFrame = requestAnimationFrame(scrollContinuously)
      }
      animationFrame = requestAnimationFrame(scrollContinuously)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', stopScrolling)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', stopScrolling)
      cancelAnimationFrame(animationFrame)
    }
  }, [enabled, scrollRef])
}

function EpubReader({ book, onProgress, collectionKind }: Pick<ReaderProps, 'book' | 'onProgress' | 'collectionKind'>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [turning, setTurning] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const epubBook = ePub()
    let active = true
    book.file.arrayBuffer().then(async (data) => {
      if (!active) return
      await epubBook.open(data, 'binary')
      if (!active) return
      const rendition = epubBook.renderTo(container, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
      })
      renditionRef.current = rendition
      rendition.on('relocated', (location: { start?: { percentage?: number }; atStart?: boolean; atEnd?: boolean }) => {
        if (!active) return
        setAtStart(location.atStart === true)
        setAtEnd(location.atEnd === true)
        if (typeof location.start?.percentage === 'number') {
          onProgress(Math.round(location.start.percentage * 100))
        }
      })
      await rendition.display()
      if (active) setReady(true)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Ce fichier EPUB n’a pas pu être ouvert.')
    })

    return () => {
      active = false
      renditionRef.current = null
      epubBook.destroy()
    }
  }, [book, onProgress])

  const turnPage = useCallback(async (direction: 'previous' | 'next') => {
    const rendition = renditionRef.current
    if (!rendition || turning) return
    setTurning(true)
    try {
      await (direction === 'next' ? rendition.next() : rendition.prev())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cette page EPUB n’a pas pu être affichée.')
    } finally {
      setTurning(false)
    }
  }, [turning])

  usePageKeyboardNavigation(
    collectionKind,
    () => void turnPage('previous'),
    () => void turnPage('next'),
  )
  useEffect(() => {
    if (!ready) return
    const iframeDocument = containerRef.current?.querySelector('iframe')?.contentDocument
    if (!iframeDocument) return
    const handleKeyDown = (event: KeyboardEvent) => handlePageNavigationKeyDown(
      event,
      collectionKind,
      () => void turnPage('previous'),
      () => void turnPage('next'),
    )
    iframeDocument.addEventListener('keydown', handleKeyDown)
    return () => iframeDocument.removeEventListener('keydown', handleKeyDown)
  }, [collectionKind, ready, turnPage])

  if (error) return <div className="reader-error">{error}</div>
  return (
    <>
      <div className="epub-reader" ref={containerRef} />
      {collectionKind === 'Manga' && <PageNavigation onPrevious={() => void turnPage('previous')} onNext={() => void turnPage('next')} previousDisabled={!ready || turning || atStart} nextDisabled={!ready || turning || atEnd} />}
    </>
  )
}

function CbzReader({ book, onProgress, collectionKind }: Pick<ReaderProps, 'book' | 'onProgress' | 'collectionKind'>) {
  const [pages, setPages] = useState<JSZip.JSZipObject[]>([])
  const [page, setPage] = useState(0)
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    JSZip.loadAsync(book.file)
      .then((zip) => {
        const imagePages = Object.values(zip.files)
          .filter((entry) => !entry.dir && /\.(jpe?g|png|gif|webp|avif)$/i.test(entry.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        if (imagePages.length === 0) throw new Error('Aucune page image n’a été trouvée dans cette archive CBZ.')
        if (active) {
          setPages(imagePages)
          setPage(0)
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Cette archive CBZ n’a pas pu être ouverte.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [book])

  useEffect(() => {
    const currentPage = pages[page]
    if (!currentPage) return
    let active = true
    let url = ''
    currentPage.async('blob')
      .then((blob) => {
        if (active) {
          url = URL.createObjectURL(blob)
          setImageUrl(url)
          onProgress(Math.round(((page + 1) / pages.length) * 100))
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Cette page n’a pas pu être chargée.')
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [onProgress, page, pages])

  const changePage = (direction: -1 | 1) => {
    setPage((value) => Math.min(pages.length - 1, Math.max(0, value + direction)))
  }
  usePageKeyboardNavigation(
    collectionKind,
    () => changePage(-1),
    () => changePage(1),
  )

  if (loading) return <div className="reader-loading"><LoaderCircle className="spin" /> Préparation des pages…</div>
  if (error) return <div className="reader-error">{error}</div>

  return (
    <div className="cbz-reader">
      {imageUrl && <img src={imageUrl} alt={`Page ${page + 1}`} />}
      {collectionKind === 'Manga' ? (
        <PageNavigation previousDisabled={page === 0} nextDisabled={page >= pages.length - 1} onPrevious={() => changePage(-1)} onNext={() => changePage(1)} />
      ) : (
        <>
          <button className="page-nav page-prev" aria-label="Page précédente" disabled={page === 0} onClick={() => changePage(-1)}><ArrowLeft /></button>
          <button className="page-nav page-next" aria-label="Page suivante" disabled={page >= pages.length - 1} onClick={() => changePage(1)}><ArrowRight /></button>
        </>
      )}
      <div className="page-count">{page + 1} / {pages.length}</div>
    </div>
  )
}

interface PdfPageSize {
  width: number
  height: number
}

const MIN_PDF_ZOOM = 0.25
const MAX_PDF_ZOOM = 3

function PdfPageCanvas({
  document,
  pageNumber,
  size,
  scale,
  scrollContainerRef,
  onVisible,
  onError,
  paged,
}: {
  document: PDFDocumentProxy
  pageNumber: number
  size: PdfPageSize
  scale: number
  scrollContainerRef: RefObject<HTMLDivElement | null>
  onVisible: (pageNumber: number) => void
  onError: (message: string) => void
  paged: boolean
}) {
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)

  useEffect(() => {
    const element = pageRef.current
    const scrollContainer = scrollContainerRef.current
    if (!element || !scrollContainer) return
    const observer = new IntersectionObserver(([entry]) => {
      setIsNearViewport(entry.isIntersecting)
    }, { root: scrollContainer, rootMargin: '700px 0px', threshold: [0, 0.1] })
    const activePageObserver = new IntersectionObserver(([entry]) => {
      if (!paged && entry.isIntersecting && entry.intersectionRatio > 0.5) onVisible(pageNumber)
    }, { root: scrollContainer, threshold: [0.1] })
    observer.observe(element)
    activePageObserver.observe(element)
    return () => {
      observer.disconnect()
      activePageObserver.disconnect()
    }
  }, [onVisible, pageNumber, paged, scrollContainerRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!isNearViewport || !canvas) return
    let active = true
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null
    document.getPage(pageNumber)
      .then((pdfPage) => {
        if (!active) return
        const viewport = pdfPage.getViewport({ scale })
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.ceil(viewport.width * pixelRatio)
        canvas.height = Math.ceil(viewport.height * pixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Le rendu de cette page PDF n’est pas pris en charge.')
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport: pdfPage.getViewport({ scale: scale * pixelRatio }),
        })
        return renderTask.promise
      })
      .catch((reason: unknown) => {
        if (active && (!(reason instanceof Error) || reason.name !== 'RenderingCancelledException')) {
          onError(reason instanceof Error ? reason.message : 'Cette page PDF n’a pas pu être affichée.')
        }
      })
    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [document, isNearViewport, onError, pageNumber, scale])

  return (
    <div
      className="pdf-page"
      ref={pageRef}
      style={{ width: size.width * scale, height: size.height * scale }}
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber} du document`} />
    </div>
  )
}

function PdfReader({ book, onProgress, collectionKind }: Pick<ReaderProps, 'book' | 'onProgress' | 'collectionKind'>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const paged = collectionKind === 'Manga'
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageSizes, setPageSizes] = useState<PdfPageSize[]>([])
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [activePage, setActivePage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [zoomLocked, setZoomLocked] = useState(false)
  const [zoomLoading, setZoomLoading] = useState(true)
  const [zoomSaving, setZoomSaving] = useState(false)
  const [zoomError, setZoomError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const api = window.yomu
    if (!api) {
      Promise.resolve().then(() => {
        if (active) {
          setZoomError('L’application Windows Yomu est nécessaire pour charger le zoom enregistré.')
          setZoomLoading(false)
        }
      })
      return () => { active = false }
    }
    api.getPdfZoom(book.collectionId)
      .then((savedZoom) => {
        if (active && savedZoom !== null) {
          setZoom(savedZoom)
          setZoomLocked(true)
        }
      })
      .catch((reason: unknown) => {
        if (active) setZoomError(reason instanceof Error ? reason.message : 'Le zoom enregistré n’a pas pu être chargé.')
      })
      .finally(() => { if (active) setZoomLoading(false) })
    return () => { active = false }
  }, [book.collectionId])

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | null = null
    book.file.arrayBuffer()
      .then(async (data) => {
        if (!active) return null
        const pdfjs = await import('pdfjs-dist')
        if (!active) return null
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) })
        return loadingTask.promise
      })
      .then((pdf) => {
        if (active && pdf) {
          setDocument(pdf)
          setActivePage(1)
          return Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
            const pdfPage = await pdf.getPage(index + 1)
            const viewport = pdfPage.getViewport({ scale: 1 })
            return { width: viewport.width, height: viewport.height }
          }))
        }
        return []
      })
      .then((sizes) => {
        if (active) setPageSizes(sizes)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Ce fichier PDF n’a pas pu être ouvert.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      if (loadingTask) void loadingTask.destroy()
    }
  }, [book])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
      setContainerHeight(entry.contentRect.height)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const activeSize = pageSizes[activePage - 1]
  const baseScale = pageSizes.length && containerWidth > 0
    ? paged && activeSize && containerHeight > 0
      ? Math.min(1, Math.max(1, containerWidth - 80) / activeSize.width, Math.max(1, containerHeight - 28) / activeSize.height)
      : Math.min(1, Math.max(1, containerWidth - 64) / Math.max(...pageSizes.map(({ width }) => width)))
    : 1
  const scale = baseScale * zoom
  const updateVisiblePage = useCallback((pageNumber: number) => {
    setActivePage(pageNumber)
    if (pageSizes.length) onProgress(Math.round((pageNumber / pageSizes.length) * 100))
  }, [onProgress, pageSizes.length])
  const reportPageError = useCallback((message: string) => setError(message), [])
  useEffect(() => {
    if (paged && pageSizes.length > 0) onProgress(Math.round((activePage / pageSizes.length) * 100))
  }, [activePage, onProgress, pageSizes.length, paged])
  const changePage = (direction: -1 | 1) => {
    setActivePage((page) => Math.min(pageSizes.length, Math.max(1, page + direction)))
    scrollRef.current?.scrollTo({ top: 0, left: 0 })
  }
  const scrollManhwa = (direction: -1 | 1) => {
    const container = scrollRef.current
    if (container) container.scrollBy({ top: direction * Math.max(container.clientHeight * 0.8, 1), behavior: 'smooth' })
  }
  usePageKeyboardNavigation(
    collectionKind,
    () => paged ? changePage(-1) : scrollManhwa(-1),
    () => paged ? changePage(1) : scrollManhwa(1),
    paged,
  )
  useContinuousPdfScrollNavigation(scrollRef, !paged)
  const adjustZoom = (direction: 1 | -1) => {
    if (zoomLocked || zoomLoading || zoomSaving) return
    setZoom((value) => Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, Math.round((value + direction * 0.1) * 100) / 100)))
  }
  const toggleZoomLock = async () => {
    if (!window.yomu) {
      setZoomError('L’application Windows Yomu est nécessaire pour enregistrer le zoom.')
      return
    }
    setZoomSaving(true)
    setZoomError('')
    try {
      await window.yomu.setPdfZoom(book.collectionId, zoomLocked ? null : zoom)
      setZoomLocked(!zoomLocked)
    } catch (reason) {
      setZoomError(reason instanceof Error ? reason.message : 'Le zoom n’a pas pu être enregistré.')
    } finally {
      setZoomSaving(false)
    }
  }

  if (error) return <div className="reader-error">{error}</div>
  return (
    <div
      className="pdf-reader"
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return
        event.preventDefault()
        if (event.deltaY !== 0) adjustZoom(event.deltaY < 0 ? 1 : -1)
      }}
    >
      {loading && <div className="pdf-loading"><LoaderCircle className="spin" /> Préparation du document…</div>}
      {zoomError && <div className="pdf-zoom-error" role="alert">{zoomError}</div>}
      <div className="pdf-toolbar" aria-label="Commandes de zoom PDF" title="Utilise Ctrl + molette pour zoomer">
        <button className="pdf-zoom-button" aria-label="Zoom arrière" title="Zoom arrière" disabled={zoomLocked || zoomLoading || zoomSaving || zoom <= MIN_PDF_ZOOM} onClick={() => adjustZoom(-1)}><ZoomOut size={16} /></button>
        <span className="pdf-zoom-value">{Math.round(zoom * 100)}%</span>
        <button className={`pdf-zoom-button${zoomLocked ? ' pdf-zoom-locked' : ''}`} aria-label={zoomLocked ? 'Déverrouiller le zoom de cette collection' : 'Verrouiller le zoom pour cette collection'} title={zoomLocked ? 'Déverrouiller le zoom de cette collection' : 'Verrouiller le zoom pour cette collection'} aria-pressed={zoomLocked} disabled={zoomLoading || zoomSaving} onClick={() => void toggleZoomLock()}>{zoomLocked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}</button>
        <button className="pdf-zoom-button" aria-label="Zoom avant" title="Zoom avant" disabled={zoomLocked || zoomLoading || zoomSaving || zoom >= MAX_PDF_ZOOM} onClick={() => adjustZoom(1)}><ZoomIn size={16} /></button>
        <button className="pdf-zoom-button pdf-zoom-reset" aria-label={paged ? 'Ajuster à la page' : 'Ajuster à la largeur'} title={paged ? 'Ajuster à la page' : 'Ajuster à la largeur'} disabled={zoomLocked || zoomLoading || zoomSaving} onClick={() => setZoom(1)}><RotateCcw size={14} /><span>Ajuster</span></button>
        <span className="pdf-page-count">{activePage} / {pageSizes.length || '—'}</span>
      </div>
      <div className={`pdf-pages${paged ? ' pdf-pages-paged' : ''}`} ref={scrollRef}>
        {document && !zoomLoading && pageSizes.map((size, index) => (!paged || index + 1 === activePage) && (
          <PdfPageCanvas
            key={index}
            document={document}
            pageNumber={index + 1}
            size={size}
            scale={scale}
            scrollContainerRef={scrollRef}
            onVisible={updateVisiblePage}
            onError={reportPageError}
            paged={paged}
          />
        ))}
      </div>
      {paged && !loading && !zoomLoading && pageSizes.length > 0 && <PageNavigation previousDisabled={activePage <= 1} nextDisabled={activePage >= pageSizes.length} onPrevious={() => changePage(-1)} onNext={() => changePage(1)} />}
    </div>
  )
}

export default function Reader({ book, collectionKind, onClose, onProgress }: ReaderProps) {
  const readerRef = useRef<HTMLElement>(null)
  const progressCallback = useRef(onProgress)
  const closeCallback = useRef(onClose)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')

  useEffect(() => {
    progressCallback.current = onProgress
  }, [onProgress])

  useEffect(() => {
    closeCallback.current = onClose
  }, [onClose])

  useEffect(() => {
    const readerElement = readerRef.current
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) closeCallback.current()
    }
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === readerElement)
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (readerElement && document.fullscreenElement === readerElement) {
        void document.exitFullscreen().catch((reason: unknown) => console.error('Impossible de quitter le plein écran.', reason))
      }
    }
  }, [])

  const reportProgress = useCallback((progress: number) => progressCallback.current(progress), [])
  const toggleFullscreen = async () => {
    setFullscreenError('')
    try {
      if (document.fullscreenElement === readerRef.current) {
        await document.exitFullscreen()
      } else {
        await readerRef.current?.requestFullscreen()
      }
    } catch (reason) {
      setFullscreenError(reason instanceof Error ? reason.message : 'Le mode plein écran n’a pas pu être activé.')
    }
  }

  return (
    <section ref={readerRef} className={`reader-overlay${isFullscreen ? ' reader-fullscreen' : ''}`} aria-label={`Lecture de ${book.title}`}>
      <header className="reader-header">
        <button className="reader-back" onClick={onClose}><ArrowLeft size={17} /><span>Retour</span></button>
        <div className="reader-heading" title={`${book.series} / ${book.chapter || book.title}`}>
          <span>{book.series}</span><i>/</i><strong>{book.chapter || book.title}</strong>
        </div>
        <div className="reader-header-actions">
          <span className="reader-format">{book.format}</span>
          <button className="reader-fullscreen-button" aria-label="Passer en plein écran" title="Plein écran" onClick={() => void toggleFullscreen()}>
            <Maximize size={16} />
          </button>
        </div>
      </header>
      {isFullscreen && (
        <button className="reader-fullscreen-exit" aria-label="Quitter le plein écran" title="Quitter le plein écran (Échap)" onClick={() => void toggleFullscreen()}>
          <Minimize size={17} /><span>Quitter le plein écran</span>
        </button>
      )}
      {fullscreenError && <div className="reader-fullscreen-error" role="alert">{fullscreenError}</div>}
      <div className="reader-body">
        {book.format === 'PDF' && <PdfReader key={book.id} book={book} collectionKind={collectionKind} onProgress={reportProgress} />}
        {book.format === 'CBZ' && <CbzReader key={book.id} book={book} collectionKind={collectionKind} onProgress={reportProgress} />}
        {book.format === 'EPUB' && <EpubReader key={book.id} book={book} collectionKind={collectionKind} onProgress={reportProgress} />}
      </div>
    </section>
  )
}
