import { describe, expect, it, vi } from 'vitest'

import {
  calculateViewerCameraState,
  createViewerCameraStore,
} from './camera-state.ts'

describe('3D 프리뷰 카메라 상태 표시', () => {
  it('OrbitControls 각도와 기준 거리 대비 줌 배율을 읽기 쉬운 값으로 변환한다', () => {
    expect(calculateViewerCameraState(
      -Math.PI / 4,
      Math.PI * 0.4,
      12,
      8,
    )).toEqual({
      azimuthDegrees: -45,
      polarDegrees: 72,
      zoom: 1.5,
    })
  })

  it('한 프레임의 연속 입력은 마지막 값만 발행하고 동일 값은 다시 알리지 않는다', () => {
    const scheduled: Array<() => void> = []
    const schedule = (callback: () => void) => {
      scheduled.push(callback)
      return 7
    }
    const cancel = vi.fn()
    const store = createViewerCameraStore(schedule, cancel)
    const listener = vi.fn()
    store.subscribe(listener)

    for (let angle = 0; angle < 100; angle += 1) {
      store.update({ azimuthDegrees: angle, polarDegrees: 70, zoom: 1.2 })
    }

    expect(listener).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(1)
    scheduled.shift()?.()
    expect(store.getSnapshot()).toEqual({
      azimuthDegrees: 99,
      polarDegrees: 70,
      zoom: 1.2,
    })
    expect(listener).toHaveBeenCalledTimes(1)

    store.update({ azimuthDegrees: 99, polarDegrees: 70, zoom: 1.2 })
    scheduled.shift()?.()
    expect(listener).toHaveBeenCalledTimes(1)

    store.update({ azimuthDegrees: 120, polarDegrees: 55, zoom: 1.8 })
    store.reset()
    expect(cancel).toHaveBeenCalledWith(7)
    expect(store.getSnapshot()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
