export interface ViewerCameraState {
  readonly azimuthDegrees: number
  readonly polarDegrees: number
  readonly zoom: number
}

export interface ViewerCameraStore {
  getSnapshot(): ViewerCameraState | null
  subscribe(listener: () => void): () => void
  update(state: ViewerCameraState): void
  reset(): void
}

type FrameScheduler = (callback: () => void) => number
type FrameCanceller = (handle: number) => void

const scheduleBrowserFrame: FrameScheduler = (callback) => (
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : window.setTimeout(callback, 16)
)

const cancelBrowserFrame: FrameCanceller = (handle) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else window.clearTimeout(handle)
}

function sameCameraState(
  left: ViewerCameraState | null,
  right: ViewerCameraState | null,
) {
  return left?.azimuthDegrees === right?.azimuthDegrees
    && left?.polarDegrees === right?.polarDegrees
    && left?.zoom === right?.zoom
}

export function createViewerCameraStore(
  scheduleFrame: FrameScheduler = scheduleBrowserFrame,
  cancelFrame: FrameCanceller = cancelBrowserFrame,
): ViewerCameraStore {
  const listeners = new Set<() => void>()
  let current: ViewerCameraState | null = null
  let pending: ViewerCameraState | null = null
  let frameHandle: number | null = null

  const publish = (next: ViewerCameraState | null) => {
    if (sameCameraState(current, next)) return
    current = next
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update(state) {
      pending = state
      if (frameHandle !== null) return
      frameHandle = scheduleFrame(() => {
        frameHandle = null
        const next = pending
        pending = null
        publish(next)
      })
    },
    reset() {
      if (frameHandle !== null) cancelFrame(frameHandle)
      frameHandle = null
      pending = null
      publish(null)
    },
  }
}

export function calculateViewerCameraState(
  azimuthRadians: number,
  polarRadians: number,
  fittedDistance: number,
  currentDistance: number,
): ViewerCameraState {
  return {
    azimuthDegrees: Math.round(azimuthRadians * 180 / Math.PI),
    polarDegrees: Math.round(polarRadians * 180 / Math.PI),
    zoom: Math.round((fittedDistance / Math.max(currentDistance, 1e-8)) * 100) / 100,
  }
}
