import { useEffect, useState } from 'react'

export interface ViewerCapabilitySignals {
  readonly width: number
  readonly coarsePointer: boolean
  readonly finePointer: boolean
  readonly hasWebGl: boolean
  readonly hasWorker: boolean
}

export interface ViewerCapability {
  readonly supported: boolean
  readonly mobile: boolean
  readonly reason: string | null
}

export function detectViewerCapability(
  signals: ViewerCapabilitySignals,
): ViewerCapability {
  const mobile = signals.width <= 1050
    || (signals.coarsePointer && !signals.finePointer)
  if (mobile) {
    return {
      supported: false,
      mobile: true,
      reason: '3D 모델 미리보기는 PC에서 사용할 수 있습니다.',
    }
  }
  if (!signals.hasWebGl) {
    return {
      supported: false,
      mobile: false,
      reason: '이 환경에서는 WebGL을 사용할 수 없습니다.',
    }
  }
  if (!signals.hasWorker) {
    return {
      supported: false,
      mobile: false,
      reason: '이 브라우저에서는 GX 변환 Worker를 사용할 수 없습니다.',
    }
  }
  return { supported: true, mobile: false, reason: null }
}

function browserSignals(): ViewerCapabilitySignals {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? true
  let hasWebGl = false
  if (
    typeof WebGLRenderingContext !== 'undefined'
    || typeof WebGL2RenderingContext !== 'undefined'
  ) {
    try {
      const canvas = document.createElement('canvas')
      hasWebGl = Boolean(
        canvas.getContext('webgl2') || canvas.getContext('webgl'),
      )
    } catch {
      hasWebGl = false
    }
  }
  return {
    width: window.innerWidth,
    coarsePointer: coarse,
    finePointer: fine,
    hasWebGl,
    hasWorker: typeof Worker === 'function',
  }
}

export function useViewerCapability() {
  const [capability, setCapability] = useState(() =>
    typeof window === 'undefined'
      ? detectViewerCapability({
          width: 0,
          coarsePointer: true,
          finePointer: false,
          hasWebGl: false,
          hasWorker: false,
        })
      : detectViewerCapability(browserSignals()),
  )

  useEffect(() => {
    const update = () => setCapability(detectViewerCapability(browserSignals()))
    const coarse = window.matchMedia?.('(pointer: coarse)')
    const fine = window.matchMedia?.('(pointer: fine)')
    window.addEventListener('resize', update)
    coarse?.addEventListener('change', update)
    fine?.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      coarse?.removeEventListener('change', update)
      fine?.removeEventListener('change', update)
    }
  }, [])

  return capability
}
