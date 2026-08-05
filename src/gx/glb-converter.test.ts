import { describe, expect, it } from 'vitest'

import { convertGxToGlb } from './glb-converter.ts'
import type {
  GxMatrix,
  GxParseResult,
} from './parser/types.ts'

const identity: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

const translated: GxMatrix = [
  1, 0, 0, 10,
  0, 1, 0, 20,
  0, 0, 1, 30,
  0, 0, 0, 1,
]

function fixture(texture: string | null = 'effect.bmp'): GxParseResult {
  return {
    parserVersion: '1',
    byteLength: 100,
    chunkCount: 4,
    diagnostics: [],
    frames: [{
      index: 0,
      name: 'root',
      parentIndex: null,
      localMatrix: identity,
      worldMatrix: identity,
      keyframes: {
        matrices: [identity, translated],
        timelineIndices: new Uint16Array([0, 1]),
      },
    }],
    meshes: [{
      index: 0,
      name: 'mesh_000',
      frameIndex: 0,
      frameName: 'root',
      texture,
      textureImpliesAlpha: false,
      materialImpliesAlpha: false,
      usesBlackBlendTexture: false,
      requiresAlpha: false,
      material: null,
      transform: identity,
      geometry: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
        sourceIndexBase: 0,
        metadata: { variant: 'standard', unknown0: 0, unknown1: 0 },
      },
    }],
  }
}

function tga() {
  const bytes = new Uint8Array(21)
  const view = new DataView(bytes.buffer)
  bytes[2] = 2
  view.setUint16(12, 1, true)
  view.setUint16(14, 1, true)
  bytes[16] = 24
  bytes[17] = 0x20
  bytes.set([0, 0, 255], 18)
  return bytes.buffer
}

function glbJson(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  expect(view.getUint32(0, true)).toBe(0x46546c67)
  expect(view.getUint32(4, true)).toBe(2)
  expect(view.getUint32(8, true)).toBe(buffer.byteLength)
  const jsonLength = view.getUint32(12, true)
  expect(view.getUint32(16, true)).toBe(0x4e4f534a)
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trim(),
  ) as Record<string, unknown>
}

describe('GX → GLB 변환기', () => {
  it('프레임 계층, 메시, 내장 PNG와 XFI 애니메이션을 GLB로 만든다', async () => {
    const result = await convertGxToGlb(fixture(), {
      sourceName: 'sample.gx',
      textures: [{
        reference: 'effect.bmp',
        fileName: 'effect.tga',
        buffer: tga(),
      }],
      xfi: {
        partType: 0,
        matrices: [],
        diagnostics: [],
        animationRanges: [
          { animationId: 0, start: 0, end: 1, clip: 'idle' },
        ],
      },
    })
    const json = glbJson(result.glb)

    expect(json.asset).toMatchObject({ version: '2.0' })
    expect(json.nodes).toHaveLength(2)
    expect(json.meshes).toHaveLength(1)
    expect(json.images).toMatchObject([{ mimeType: 'image/png' }])
    expect(json.animations).toMatchObject([{ name: 'sample_idle' }])
    expect(result.metadata).toMatchObject({
      meshCount: 1,
      frameCount: 1,
      animationNames: ['sample_idle'],
      textureReferences: ['effect.bmp'],
      missingTextures: [],
    })
  })

  it('누락된 텍스처를 진단하되 지오메트리는 GLB에 보존한다', async () => {
    const result = await convertGxToGlb(fixture('missing.bmp'), {
      sourceName: 'missing.gx',
    })
    const json = glbJson(result.glb)

    expect(json.meshes).toHaveLength(1)
    expect(json.images).toBeUndefined()
    expect(result.metadata.missingTextures).toEqual(['missing.bmp'])
    expect(result.metadata.diagnostics[0].code).toBe('MISSING_TEXTURE')
  })
})

