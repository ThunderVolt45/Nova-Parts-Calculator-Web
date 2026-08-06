import { describe, expect, it, vi } from 'vitest'

import { observeWebGlContextLoss } from './webgl-context-recovery.ts'

describe('observeWebGlContextLoss', () => {
  it('prevents the default loss handling and requests recovery', () => {
    const canvas = document.createElement('canvas')
    const onContextLost = vi.fn()
    const stopObserving = observeWebGlContextLoss(canvas, onContextLost)
    const event = new Event('webglcontextlost', { cancelable: true })

    canvas.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(onContextLost).toHaveBeenCalledOnce()

    stopObserving()
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(onContextLost).toHaveBeenCalledOnce()
  })
})
