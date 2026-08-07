import { describe, expect, it } from 'vitest'

import type { GxMatrix, GxParseResult, XfiParseResult } from './parser/types.ts'
import {
  buildPartialUnitSocketAssembly,
  buildUnitSocketAssembly,
  describePartSockets,
  gxMatrixToGltf,
  transformGltfPoint,
  UnitSocketAssemblyError,
} from './socket-assembly.ts'

const identity: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

function gxTransform(scaleX: number, translateX: number): GxMatrix {
  return [
    scaleX, 0, 0, translateX,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

function xfiTranslation(x: number, y = 0, z = 0): GxMatrix {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]
}

function parsed(frames: GxParseResult['frames']): GxParseResult {
  return {
    parserVersion: '1',
    byteLength: 0,
    chunkCount: 0,
    frames,
    meshes: [],
    diagnostics: [],
  }
}

function xfi(partType: number, matrices: readonly GxMatrix[]): XfiParseResult {
  return { partType, matrices, animationRanges: [], diagnostics: [] }
}

describe('일반 유닛 소켓 조립', () => {
  it('첫 애니메이션 프레임의 부모 계층까지 정적 GX 변환을 계산한다', () => {
    const metadata = describePartSockets(parsed([
      {
        index: 0,
        name: 'root',
        parentIndex: null,
        localMatrix: gxTransform(1, 10),
        worldMatrix: identity,
        keyframes: null,
      },
      {
        index: 1,
        name: 'primary',
        parentIndex: 0,
        localMatrix: identity,
        worldMatrix: identity,
        keyframes: { matrices: [gxTransform(2, 3)], timelineIndices: new Uint16Array([0]) },
      },
    ]), null)

    expect(metadata.primaryFrameName).toBe('primary')
    expect(metadata.primaryFrameIndex).toBe(1)
    expect(transformGltfPoint(
      // GX root(translate 10) × primary(scale 2, translate 3)
      gxMatrixToGltf(metadata.primaryFrameTransform),
      [1, 0, 0],
    )).toEqual([15, 0, 0])
  })

  it('GX와 XFI 규칙을 구분해 몸통과 무기 변환 순서를 보존한다', () => {
    const legs = describePartSockets(parsed([{
      index: 0,
      name: 'legs',
      parentIndex: null,
      localMatrix: gxTransform(2, 10),
      worldMatrix: identity,
      keyframes: { matrices: [gxTransform(2, 10)], timelineIndices: new Uint16Array([0]) },
    }]), xfi(0, [xfiTranslation(5)]))
    const body = describePartSockets(parsed([{
      index: 0,
      name: 'body',
      parentIndex: null,
      localMatrix: gxTransform(3, 7),
      worldMatrix: identity,
      keyframes: { matrices: [gxTransform(3, 7)], timelineIndices: new Uint16Array([0]) },
    }]), xfi(1, [identity, identity, xfiTranslation(1), identity, identity]))

    const assembly = buildUnitSocketAssembly(legs, body)

    expect(transformGltfPoint(assembly.bodyTransform, [0, 0, 0]))
      .toEqual([20, 0, 0])
    expect(transformGltfPoint(assembly.weaponTransform, [0, 0, 0]))
      .toEqual([40, 0, 0])
    expect(assembly.weaponSocketIndex).toBe(2)
  })

  it('잘못된 XFI 타입과 누락된 소켓을 명확히 거부한다', () => {
    const base = describePartSockets(parsed([]), xfi(0, [identity]))
    const wrongBody = describePartSockets(parsed([]), xfi(0, [identity]))
    expect(() => buildUnitSocketAssembly(base, wrongBody)).toThrowError(
      expect.objectContaining({ code: 'BODY_XFI_TYPE' }),
    )

    const shortBody = describePartSockets(parsed([]), xfi(1, [identity]))
    try {
      buildUnitSocketAssembly(base, shortBody)
    } catch (error) {
      expect(error).toBeInstanceOf(UnitSocketAssemblyError)
      expect(error).toMatchObject({ code: 'BODY_SOCKET_MISSING' })
    }
  })

  it('다리가 없어도 몸통 소켓을 기준으로 무기를 표시한다', () => {
    const body = describePartSockets(parsed([{
      index: 0,
      name: 'body',
      parentIndex: null,
      localMatrix: gxTransform(3, 7),
      worldMatrix: identity,
      keyframes: { matrices: [gxTransform(3, 7)], timelineIndices: new Uint16Array([0]) },
    }]), xfi(1, [identity, identity, xfiTranslation(1)]))

    const assembly = buildPartialUnitSocketAssembly(null, body)

    expect(transformGltfPoint(assembly.bodyTransform, [0, 0, 0])).toEqual([0, 0, 0])
    expect(transformGltfPoint(assembly.weaponTransform, [0, 0, 0])).toEqual([10, 0, 0])
    expect(assembly.bodyAttached).toBe(false)
    expect(assembly.weaponAttached).toBe(true)
  })

  it('몸통이 없으면 무기를 다리의 몸통 소켓 변환에 둔다', () => {
    const legs = describePartSockets(parsed([{
      index: 0,
      name: 'legs',
      parentIndex: null,
      localMatrix: gxTransform(2, 10),
      worldMatrix: identity,
      keyframes: { matrices: [gxTransform(2, 10)], timelineIndices: new Uint16Array([0]) },
    }]), xfi(0, [xfiTranslation(5)]))

    const assembly = buildPartialUnitSocketAssembly(legs, null)

    expect(transformGltfPoint(assembly.bodyTransform, [0, 0, 0])).toEqual([20, 0, 0])
    expect(transformGltfPoint(assembly.weaponTransform, [0, 0, 0])).toEqual([20, 0, 0])
    expect(assembly.bodyAttached).toBe(true)
    expect(assembly.weaponAttached).toBe(true)
    expect(assembly.diagnostics).toContain('몸통이 없어 무기를 다리의 몸통 소켓에 표시합니다.')
  })
})
