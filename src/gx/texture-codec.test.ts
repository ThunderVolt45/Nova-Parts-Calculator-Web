import { describe, expect, it } from 'vitest'

import {
  applyBlackAdditiveAlpha,
  decodeBmp,
  decodeTga,
  encodeCompressedRgbaPng,
  encodeRgbaPng,
  textureHasTransparency,
} from './texture-codec.ts'

function tga24(pixels: readonly (readonly [number, number, number])[]) {
  const bytes = new Uint8Array(18 + pixels.length * 3)
  const view = new DataView(bytes.buffer)
  bytes[2] = 2
  view.setUint16(12, pixels.length, true)
  view.setUint16(14, 1, true)
  bytes[16] = 24
  bytes[17] = 0x20
  pixels.forEach(([red, green, blue], index) => {
    bytes.set([blue, green, red], 18 + index * 3)
  })
  return bytes.buffer
}

function bmp24() {
  const bytes = new Uint8Array(62)
  const view = new DataView(bytes.buffer)
  bytes.set([0x42, 0x4d])
  view.setUint32(2, bytes.length, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, 2, true)
  view.setInt32(22, 1, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  bytes.set([0, 0, 255, 0, 255, 0, 0, 0], 54)
  return bytes.buffer
}

function pngChunks(png: Uint8Array, type: string) {
  const chunks: Uint8Array[] = []
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset, false)
    const chunkType = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    if (chunkType === type) chunks.push(png.slice(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  return chunks
}

function inflateUncompressedZlib(bytes: Uint8Array) {
  const parts: Uint8Array[] = []
  let offset = 2
  while (offset < bytes.length - 4) {
    const final = (bytes[offset] & 1) !== 0
    offset += 1
    const length = bytes[offset] | (bytes[offset + 1] << 8)
    const inverse = bytes[offset + 2] | (bytes[offset + 3] << 8)
    expect(inverse).toBe(0xffff - length)
    offset += 4
    parts.push(bytes.slice(offset, offset + length))
    offset += length
    if (final) break
  }
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let outputOffset = 0
  for (const part of parts) {
    output.set(part, outputOffset)
    outputOffset += part.length
  }
  return output
}

describe('GX 텍스처 코덱', () => {
  it('TGA와 BMP 픽셀을 위쪽 원점 RGBA로 변환한다', () => {
    expect(Array.from(decodeTga(tga24([[255, 0, 0], [0, 255, 0]])).pixels)).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ])
    expect(Array.from(decodeBmp(bmp24()).pixels)).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ])
  })

  it('검은 배경 가산 텍스처를 표준 알파 블렌딩 픽셀로 바꾼다', () => {
    const converted = applyBlackAdditiveAlpha(
      new Uint8Array([0, 0, 0, 255, 64, 32, 0, 255]),
    )
    expect(Array.from(converted)).toEqual([0, 0, 0, 0, 255, 128, 0, 64])
    expect(textureHasTransparency(converted)).toBe(true)
  })

  it('외부 라이브러리 없이 유효한 RGBA PNG를 생성한다', () => {
    const png = encodeRgbaPng({
      width: 2,
      height: 1,
      pixels: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]),
    })
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const scanlines = inflateUncompressedZlib(pngChunks(png, 'IDAT')[0])
    expect(Array.from(scanlines)).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 128])
  })

  it('지원 환경에서는 GLB 내장용 PNG 픽셀 스트림을 실제로 압축한다', async () => {
    const texture = {
      width: 64,
      height: 64,
      pixels: new Uint8Array(64 * 64 * 4).fill(128),
    }
    const uncompressed = encodeRgbaPng(texture)
    const compressed = await encodeCompressedRgbaPng(texture)

    expect(Array.from(compressed.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    if (typeof CompressionStream !== 'undefined') {
      expect(compressed.byteLength).toBeLessThan(uncompressed.byteLength / 4)
    }
  })

  it('잘린 입력과 과도한 크기를 거부한다', () => {
    expect(() => decodeTga(new ArrayBuffer(4))).toThrow('헤더가 잘렸습니다')
    const oversized = new Uint8Array(18)
    const view = new DataView(oversized.buffer)
    oversized[2] = 2
    view.setUint16(12, 9000, true)
    view.setUint16(14, 1, true)
    oversized[16] = 24
    expect(() => decodeTga(oversized.buffer)).toThrow('지원하지 않는 텍스처 크기')
  })
})
