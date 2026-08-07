import { describe, expect, it } from 'vitest'

import { detectViewerCapability } from './capability.ts'

const desktop = {
  width: 1440,
  coarsePointer: false,
  finePointer: true,
  hasWebGl: true,
  hasWorker: true,
}

describe('3D 뷰어 기능 감지', () => {
  it('WebGL과 Worker를 사용할 수 있는 PC 환경을 허용한다', () => {
    expect(detectViewerCapability(desktop)).toEqual({
      supported: true,
      mobile: false,
      reason: null,
    })
  })

  it('좁은 화면이나 터치 전용 입력을 모바일로 판정한다', () => {
    expect(detectViewerCapability({ ...desktop, width: 1050 })).toMatchObject({
      supported: false,
      mobile: true,
    })
    expect(detectViewerCapability({ ...desktop, width: 1051 })).toMatchObject({
      supported: true,
      mobile: false,
    })
    expect(detectViewerCapability({
      ...desktop,
      coarsePointer: true,
      finePointer: false,
    })).toMatchObject({ supported: false, mobile: true })
  })

  it('WebGL과 Worker 누락 이유를 구분한다', () => {
    expect(detectViewerCapability({ ...desktop, hasWebGl: false }).reason)
      .toContain('WebGL')
    expect(detectViewerCapability({ ...desktop, hasWorker: false }).reason)
      .toContain('Worker')
  })
})
