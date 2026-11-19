export type ReadingPosition = { page: number; offset?: number } | { cfi: string }

export interface PageReadingPosition {
  page: number
  offset: number
}

export interface InitialPagePosition {
  page: number
  offset?: number
}

export interface MangaPageSpread {
  startPage: number
  endPage: number
}

export function pageFromProgress(progress: number, total: number): number {
  return Math.min(total, Math.max(1, Math.round(progress * total / 100)))
}

export function mangaPageSpread(page: number, total: number, doublePage: boolean): MangaPageSpread {
  const pageCount = Math.max(1, Math.floor(total))
  const currentPage = Math.min(pageCount, Math.max(1, Math.floor(page)))
  if (!doublePage || currentPage === 1) return { startPage: currentPage, endPage: currentPage }
  const startPage = 2 + Math.floor((currentPage - 2) / 2) * 2
  return { startPage, endPage: Math.min(pageCount, startPage + 1) }
}

export function nextMangaSpreadPage(page: number, total: number, direction: -1 | 1): number {
  const pageCount = Math.max(1, Math.floor(total))
  const { startPage } = mangaPageSpread(page, pageCount, true)
  if (direction === -1) return startPage === 2 ? 1 : Math.max(2, startPage - 2)
  const lastSpreadStart = mangaPageSpread(pageCount, pageCount, true).startPage
  return Math.min(lastSpreadStart, startPage === 1 ? 2 : startPage + 2)
}

export function initialPage(position: ReadingPosition | undefined, progress: number, total: number): number {
  return position && 'page' in position
    ? Math.min(total, Math.max(1, position.page))
    : pageFromProgress(progress, total)
}

export function initialPagePosition(position: ReadingPosition | undefined, progress: number, total: number): InitialPagePosition {
  const page = initialPage(position, progress, total)
  if (position && 'page' in position && typeof position.offset === 'number' && Number.isFinite(position.offset)) {
    return { page, offset: Math.min(1, Math.max(0, position.offset)) }
  }
  return { page }
}

export function pagePositionAtViewportCenter(
  pages: { page: number; top: number; bottom: number }[],
  center: number,
): PageReadingPosition | null {
  let nearest: { page: number; top: number; bottom: number; distance: number } | null = null
  for (const page of pages) {
    const distance = Math.max(page.top - center, 0, center - page.bottom)
    if (!nearest || distance < nearest.distance) nearest = { ...page, distance }
  }
  if (!nearest) return null
  const height = nearest.bottom - nearest.top
  const offset = height > 0 ? Math.min(1, Math.max(0, (center - nearest.top) / height)) : 0
  return { page: nearest.page, offset: Math.round(offset * 1000) / 1000 }
}

export function pageAtViewportCenter(
  pages: { page: number; top: number; bottom: number }[],
  center: number,
): number | null {
  return pagePositionAtViewportCenter(pages, center)?.page ?? null
}
