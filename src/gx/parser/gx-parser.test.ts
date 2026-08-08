import { describe, expect, it } from 'vitest'

import { GxParseError } from './binary.ts'
import {
  materialImpliesBlackBackgroundBlend,
  materialImpliesBlendAlpha,
  meshUsesBlackBlendTexture,
  parseGx,
  textureReferenceImpliesAlpha,
} from './gx-parser.ts'
import type { GxMatrix } from './types.ts'

const TOKENS = {
  frame: '4294901778d{',
  texture: '4294901779d{',
  geometry: '4294901781d{',
  keyframe: '4294901782d{',
  material: '4294901783d{',
  close: '4294901766d',
} as const

const identity: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

function ascii(value: string) {
  return new TextEncoder().encode(value)
}

function uint32(...values: number[]) {
  const result = new Uint8Array(values.length * 4)
  const view = new DataView(result.buffer)
  values.forEach((value, index) => view.setUint32(index * 4, value, true))
  return result
}

function uint16(...values: number[]) {
  const result = new Uint8Array(values.length * 2)
  const view = new DataView(result.buffer)
  values.forEach((value, index) => view.setUint16(index * 2, value, true))
  return result
}

function float32(...values: number[]) {
  const result = new Uint8Array(values.length * 4)
  const view = new DataView(result.buffer)
  values.forEach((value, index) => view.setFloat32(index * 4, value, true))
  return result
}

function concat(...parts: readonly Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function bufferOf(...parts: readonly Uint8Array[]) {
  return concat(...parts).buffer
}

function matrixBytes(matrix: GxMatrix) {
  return float32(...matrix)
}

function translated(x: number, y: number, z: number): GxMatrix {
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1,
  ]
}

function framePayload(name: string, matrix = identity) {
  const nameBytes = concat(ascii(name), new Uint8Array([0]))
  return concat(uint32(nameBytes.length), nameBytes, matrixBytes(matrix))
}

function geometryArrays(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
) {
  return concat(float32(...positions), float32(...normals), float32(...uvs), uint16(...indices))
}

const triangleArrays = geometryArrays(
  [0, 0, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 0, 1],
  [0, 0, 1, 0, 0, 1],
  [0, 1, 2],
)

function standardGeometry(indices = [0, 1, 2]) {
  const arrays = geometryArrays(
    [0, 0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 1],
    [0, 0, 1, 0, 0, 1],
    indices,
  )
  return concat(new Uint8Array([0]), uint32(11, 22, 3, 3), arrays)
}

function gxWithGeometry(payload: Uint8Array) {
  return bufferOf(ascii(TOKENS.geometry), payload, ascii(TOKENS.close))
}

describe('GX 바이너리 파서', () => {
  it('프레임, 키프레임, 텍스처, 재질과 표준 지오메트리를 연결한다', () => {
    const texture = concat(ascii('a_alp_effect.bmp'), new Uint8Array([0]))
    const keyframe = concat(
      ascii('2d'),
      matrixBytes(translated(10, 20, 30)),
      matrixBytes(translated(40, 50, 60)),
      ascii('3d'),
      uint16(0, 1, 0),
    )
    const buffer = bufferOf(
      ascii(TOKENS.frame),
      framePayload('models/root.gx'),
      ascii(TOKENS.texture),
      uint32(texture.length),
      texture,
      ascii(TOKENS.material),
      uint32(1, 2, 3, 4, 5, 6, 7, 0x00050003),
      ascii(TOKENS.keyframe),
      keyframe,
      ascii(TOKENS.geometry),
      standardGeometry(),
      ascii(TOKENS.close),
    )

    const result = parseGx(buffer)

    expect(result.frames).toHaveLength(1)
    expect(result.frames[0]).toMatchObject({
      name: 'root',
      parentIndex: null,
      localMatrix: translated(10, 20, 30),
    })
    expect(Array.from(result.frames[0].keyframes!.timelineIndices)).toEqual([0, 1, 0])
    expect(result.meshes).toHaveLength(1)
    expect(result.meshes[0]).toMatchObject({
      frameName: 'root',
      texture: 'a_alp_effect.bmp',
      textureImpliesAlpha: true,
      materialImpliesAlpha: true,
      usesBlackBlendTexture: false,
      requiresAlpha: true,
      transform: translated(10, 20, 30),
      material: { flags: 0x00050003 },
    })
    expect(result.meshes[0].geometry.metadata).toEqual({
      variant: 'standard',
      unknown0: 11,
      unknown1: 22,
    })
    expect(Array.from(result.meshes[0].geometry.indices)).toEqual([0, 1, 2])
  })

  it('1 기반 인덱스를 Three.js용 0 기반으로 정규화한다', () => {
    const result = parseGx(gxWithGeometry(standardGeometry([1, 2, 3])))
    expect(result.meshes[0].geometry.sourceIndexBase).toBe(1)
    expect(Array.from(result.meshes[0].geometry.indices)).toEqual([0, 1, 2])
  })

  it('대형 type 1/6 테이블 지오메트리를 보수적으로 읽는다', () => {
    const prefix = concat(
      new Uint8Array([6]),
      uint32(77, 2, 99_999_999, 88_888_888, 3, 3),
      triangleArrays,
    )
    const payload = concat(prefix, new Uint8Array(10_000 - prefix.length))
    const result = parseGx(gxWithGeometry(payload))
    const metadata = result.meshes[0].geometry.metadata

    expect(metadata.variant).toBe('table')
    if (metadata.variant === 'table') {
      expect(metadata.tableType).toBe(6)
      expect(metadata.unknownCount).toBe(77)
      expect(Array.from(metadata.table)).toEqual([99_999_999, 88_888_888])
    }
  })

  it('type 7 첫 지오메트리 샘플과 테이블을 읽는다', () => {
    const payload = concat(
      new Uint8Array([7]),
      uint32(5, 2, 99_999_999, 88_888_888, 3, 3),
      triangleArrays,
    )
    const result = parseGx(gxWithGeometry(payload))
    const metadata = result.meshes[0].geometry.metadata

    expect(metadata.variant).toBe('type7')
    if (metadata.variant === 'type7') {
      expect(metadata.firstCount).toBe(5)
      expect(Array.from(metadata.table)).toEqual([99_999_999, 88_888_888])
    }
  })

  it('스프라이트 변형의 UV 프레임과 타임라인을 보존한다', () => {
    const positions = [
      -1, -1, 0,
      1, -1, 0,
      1, 1, 0,
      -1, 1, 0,
    ]
    const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]
    const baseUvs = [0, 0, 0.5, 0, 0.5, 1, 0, 1]
    const nextUvs = [0.5, 0, 1, 0, 1, 1, 0.5, 1]
    const payload = concat(
      new Uint8Array([1]),
      uint32(2, 2, 0, 1, 4, 6),
      geometryArrays(positions, normals, baseUvs, [0, 1, 2, 0, 2, 3]),
      uint32(4, 6),
      float32(...new Array<number>(51).fill(0)),
      uint32(4, 6),
      float32(...nextUvs),
      new Uint8Array(8),
    )
    const result = parseGx(gxWithGeometry(payload))
    const metadata = result.meshes[0].geometry.metadata

    expect(metadata.variant).toBe('sprite')
    if (metadata.variant === 'sprite') {
      expect(metadata.spriteCount).toBe(2)
      expect(Array.from(metadata.animation.timelineIndices)).toEqual([0, 1])
      expect(Array.from(metadata.animation.uvFrames[1])).toEqual(nextUvs)
      expect(metadata.animation.deformationVectors).toHaveLength(51)
    }
  })

  it('손상된 개수와 범위 초과 입력을 건너뛰고 진단한다', () => {
    const corrupt = concat(
      new Uint8Array([0]),
      uint32(0, 0, 0xffff_ffff, 0xffff_ffff),
    )
    const result = parseGx(gxWithGeometry(corrupt))

    expect(result.meshes).toHaveLength(0)
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'UNSUPPORTED_GEOMETRY_CHUNK',
      'NO_SUPPORTED_GEOMETRY',
    ])
    expect(() => parseGx(new ArrayBuffer(32))).toThrowError(GxParseError)
  })

  it('8 MiB 손상 입력을 2초 안에 선형 스캔하고 중단한다', () => {
    const input = new ArrayBuffer(8 * 1024 * 1024)
    const startedAt = performance.now()

    expect(() => parseGx(input)).toThrowError(GxParseError)

    expect(performance.now() - startedAt).toBeLessThan(2_000)
  })

  it('알파 텍스처 이름 규칙을 기준 도구와 동일하게 적용한다', () => {
    expect(textureReferenceImpliesAlpha('a_alp2_2.bmp')).toBe(true)
    expect(textureReferenceImpliesAlpha('foo_alp_glow.tga')).toBe(true)
    expect(textureReferenceImpliesAlpha('opaque.bmp')).toBe(false)
  })

  it('재질 플래그와 검은 배경 블렌딩의 알파 규칙을 보존한다', () => {
    const flagMaterial = {
      unknown0: 1,
      unknown1: 0,
      ambient: 0,
      diffuse: 0,
      specular: 0,
      emissive: 0,
      extra: 0,
      flags: 3,
      raw: [1, 0, 0, 0, 0, 0, 0, 3],
    }
    const blackBlendMaterial = {
      ...flagMaterial,
      unknown0: 2,
      unknown1: 1,
      flags: 0,
      raw: [2, 1, 0, 0, 0, 0, 0, 0],
    }

    expect(materialImpliesBlendAlpha(flagMaterial)).toBe(true)
    expect(materialImpliesBlackBackgroundBlend(blackBlendMaterial)).toBe(true)
    expect(meshUsesBlackBlendTexture('opaque.bmp', flagMaterial)).toBe(true)
    expect(meshUsesBlackBlendTexture('a_alp_effect.bmp', flagMaterial)).toBe(false)
  })
})
