import type { ViewerDisplayState } from './StandalonePartViewer.tsx'

export function getViewerResourceLabel(
  fileCount: number | null,
  display: ViewerDisplayState,
) {
  if (fileCount !== null) return `${fileCount} FILES LOADED`
  return display.status === 'ready' && display.cacheStatus === 'hit'
    ? 'CACHE LOADED'
    : 'GX OFFLINE'
}
