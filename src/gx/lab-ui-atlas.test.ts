import { describe, expect, it, vi } from 'vitest'

import {
  extractLabUiSprites,
  getMountSpriteKey,
  getSubcoreSpriteKey,
  labUiSpriteKeys,
  labUiSpriteRects,
  parsePngDimensions,
} from './lab-ui-atlas.ts'

function pngHeader(width = 512, height = 512) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  return bytes
}

describe('lab_ui 스프라이트 아틀라스', () => {
  it('부품 타입 3개와 서브코어 ID 1~12를 원본 좌표에 연결한다', () => {
    expect(labUiSpriteKeys).toHaveLength(15)
    expect(labUiSpriteRects['mount:tower']).toEqual({
      x: 320,
      y: 0,
      width: 32,
      height: 32,
    })
    expect(labUiSpriteRects['mount:arm']).toEqual({
      x: 288,
      y: 0,
      width: 32,
      height: 32,
    })
    expect(labUiSpriteRects['mount:shoulder']).toEqual({
      x: 256,
      y: 0,
      width: 32,
      height: 32,
    })
    expect(labUiSpriteRects['subcore:1']).toEqual({
      x: 352,
      y: 0,
      width: 32,
      height: 32,
    })
    expect(labUiSpriteRects['subcore:12']).toEqual({
      x: 448,
      y: 64,
      width: 32,
      height: 32,
    })
    expect(getMountSpriteKey('arm')).toBe('mount:arm')
    expect(getMountSpriteKey('none')).toBeNull()
    expect(getSubcoreSpriteKey(9)).toBe('subcore:9')
    expect(getSubcoreSpriteKey(0)).toBeNull()
  })

  it('PNG 서명과 IHDR 크기를 보수적으로 검사한다', () => {
    expect(parsePngDimensions(pngHeader().buffer)).toEqual({
      width: 512,
      height: 512,
    })
    expect(() => parsePngDimensions(new ArrayBuffer(24))).toThrow(
      '올바른 PNG 파일이 아닙니다',
    )
  })

  it('요청한 조각만 중복 없이 크롭한다', async () => {
    const header = pngHeader()
    const source = new Blob([header, new Uint8Array(32)])
    const cropper = vi.fn(async () => new Blob(['sprite'], { type: 'image/png' }))

    const sprites = await extractLabUiSprites(
      source,
      ['subcore:1', 'mount:arm', 'subcore:1'],
      cropper,
    )

    expect([...sprites.keys()]).toEqual(['subcore:1', 'mount:arm'])
    expect(cropper).toHaveBeenCalledTimes(2)
    expect(cropper).toHaveBeenNthCalledWith(
      1,
      source,
      labUiSpriteRects['subcore:1'],
    )
  })

  it('다른 크기의 동명 PNG를 거부한다', async () => {
    const source = new Blob([pngHeader(256, 256)])
    await expect(extractLabUiSprites(source, [], vi.fn())).rejects.toThrow(
      '지원하지 않는 lab_ui.png 크기입니다: 256×256',
    )
  })
})
