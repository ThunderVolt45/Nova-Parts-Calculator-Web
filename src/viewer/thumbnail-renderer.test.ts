import { describe, expect, it } from 'vitest'

import { calculateThumbnailCameraDistance } from './thumbnail-renderer.ts'

describe('GX 썸네일 카메라 줌', () => {
  it('0.8배 줌은 카메라 거리를 1.25배로 늘린다', () => {
    const normal = calculateThumbnailCameraDistance(10, 38, 1)
    const exportZoom = calculateThumbnailCameraDistance(10, 38, 0.8)

    expect(exportZoom).toBeCloseTo(normal / 0.8)
  })

  it('유효하지 않은 줌은 기본 1배로 처리한다', () => {
    expect(calculateThumbnailCameraDistance(10, 38, 0)).toBeCloseTo(
      calculateThumbnailCameraDistance(10, 38, 1),
    )
  })
})
