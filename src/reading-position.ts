export type ReadingPosition = { page: number } | { cfi: string }

export function pageFromProgress(progress: number, total: number): number {
  return Math.min(total, Math.max(1, Math.round(progress * total / 100)))
}

export function initialPage(position: ReadingPosition | undefined, progress: number, total: number): number {
  return position && 'page' in position
    ? Math.min(total, Math.max(1, position.page))
    : pageFromProgress(progress, total)
}

export function pageAtViewportCenter(
  pages: { page: number; top: number; bottom: number }[],
  center: number,
): number | null {
  let nearest: { page: number; distance: number } | null = null
  for (const page of pages) {
    const distance = Math.max(page.top - center, 0, center - page.bottom)
    if (!nearest || distance < nearest.distance) nearest = { page: page.page, distance }
  }
  return nearest?.page ?? null
}
