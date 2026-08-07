import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'

import type {
  GlbConversionResult,
  GxTextureInput,
} from './glb-converter.ts'
import {
  LocalResourceIndex,
  type LocalResourceFile,
} from './local-files.ts'
import { createModelCacheRepository } from './model-cache.ts'
import {
  loadCachedModel,
  loadOrBuildModel,
  ModelAccessError,
  type ModelPipelineWorker,
} from './model-pipeline.ts'
import type {
  GxParseResult,
  XfiParseResult,
} from './parser/types.ts'

function parsedFixture(): GxParseResult {
  return {
    parserVersion: '1',
    byteLength: 10,
    chunkCount: 1,
    frames: [],
    diagnostics: [],
    meshes: [{
      index: 0,
      name: 'mesh_000',
      frameIndex: null,
      frameName: null,
      texture: 'effect.bmp',
      textureImpliesAlpha: false,
      materialImpliesAlpha: false,
      usesBlackBlendTexture: false,
      requiresAlpha: false,
      material: null,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: {
        positions: new Float32Array([0, 0, 0]),
        normals: new Float32Array([0, 1, 0]),
        uvs: new Float32Array([0, 0]),
        indices: new Uint32Array([0]),
        sourceIndexBase: 0,
        metadata: { variant: 'standard', unknown0: 0, unknown1: 0 },
      },
    }],
  }
}

function convertedFixture(): GlbConversionResult {
  return {
    glb: new ArrayBuffer(20),
    metadata: {
      formatVersion: 1,
      parserVersion: '1',
      sourceName: 'part.gx',
      meshCount: 1,
      frameCount: 0,
      animationNames: [],
      textureReferences: ['effect.bmp'],
      missingTextures: [],
      diagnostics: [],
    },
  }
}

function entry(file: File, source: LocalResourceFile['source'] = 'directory-input') {
  return {
    name: file.name,
    relativePath: file.name,
    size: file.size,
    lastModified: file.lastModified,
    source,
    getFile: vi.fn(async () => file),
  } satisfies LocalResourceFile
}

function worker() {
  const xfi: XfiParseResult = {
    partType: 0,
    matrices: [],
    animationRanges: [],
    diagnostics: [],
  }
  return {
    parseGxFile: vi.fn(async () => parsedFixture()),
    parseXfiFile: vi.fn(async () => xfi),
    convertGlb: vi.fn(async (
      _parsed: GxParseResult,
      _options: { readonly textures?: readonly GxTextureInput[] },
    ) => convertedFixture()),
  } satisfies ModelPipelineWorker
}

describe('GX 모델 로드·캐시 파이프라인', () => {
  it('동일한 모델의 동시 요청은 진행 중인 하나의 변환을 공유한다', async () => {
    const source = entry(new File(['gx'], 'part.gx', { lastModified: 10 }))
    const index = new LocalResourceIndex([source])
    const cache = createModelCacheRepository(`pipeline-${crypto.randomUUID()}`)
    const firstWorker = worker()
    const secondWorker = worker()
    let releaseParse: ((parsed: GxParseResult) => void) | undefined
    firstWorker.parseGxFile.mockImplementation(() => new Promise((resolve) => {
      releaseParse = resolve
    }))

    const first = loadOrBuildModel({
      source,
      index,
      worker: firstWorker,
      cache,
      includeSocketMetadata: true,
    })
    const second = loadOrBuildModel({
      source,
      index,
      worker: secondWorker,
      cache,
      includeSocketMetadata: true,
    })

    expect(second).toBe(first)
    await vi.waitFor(() => expect(releaseParse).toBeTypeOf('function'))
    releaseParse!(parsedFixture())
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(secondResult).toBe(firstResult)
    expect(firstWorker.convertGlb).toHaveBeenCalledTimes(1)
    expect(secondWorker.parseGxFile).not.toHaveBeenCalled()
    expect(secondWorker.convertGlb).not.toHaveBeenCalled()
  })

  it('첫 변환을 저장하고 다음 요청에서는 변환과 텍스처 읽기를 생략한다', async () => {
    const source = entry(new File(['gx'], 'part.gx', { lastModified: 10 }))
    const texture = entry(new File(['tga'], 'effect.tga', { lastModified: 20 }))
    const xfi = entry(new File(['0,'], 'part.xfi', { lastModified: 30 }))
    const index = new LocalResourceIndex([source, texture, xfi])
    const parser = worker()
    const cache = createModelCacheRepository(`pipeline-${crypto.randomUUID()}`)

    const firstProgress: string[] = []

    const first = await loadOrBuildModel({
      source,
      index,
      worker: parser,
      cache,
      onProgress: (stage) => firstProgress.push(stage),
    })
    const second = await loadOrBuildModel({ source, index, worker: parser, cache })

    expect(first.cacheStatus).toBe('miss')
    expect(second.cacheStatus).toBe('hit')
    expect(parser.parseGxFile).toHaveBeenCalledTimes(2)
    expect(parser.convertGlb).toHaveBeenCalledTimes(1)
    expect(parser.parseXfiFile).toHaveBeenCalledTimes(1)
    expect(texture.getFile).toHaveBeenCalledTimes(1)
    expect(firstProgress).toEqual([
      'checking-permission',
      'parsing-gx',
      'checking-cache',
      'loading-resources',
      'converting-glb',
      'saving-cache',
    ])
  })

  it('텍스처 수정 시 의존성 서명이 바뀌어 캐시를 무효화한다', async () => {
    const source = entry(new File(['gx'], 'part.gx', { lastModified: 10 }))
    const oldTexture = entry(new File(['old'], 'effect.tga', { lastModified: 20 }))
    const newTexture = entry(new File(['new'], 'effect.tga', { lastModified: 21 }))
    const parser = worker()
    const cache = createModelCacheRepository(`pipeline-${crypto.randomUUID()}`)

    const oldResult = await loadOrBuildModel({
      source,
      index: new LocalResourceIndex([source, oldTexture]),
      worker: parser,
      cache,
    })
    const newResult = await loadOrBuildModel({
      source,
      index: new LocalResourceIndex([source, newTexture]),
      worker: parser,
      cache,
    })

    expect(oldResult.fingerprint.dependencySignature).not.toBe(
      newResult.fingerprint.dependencySignature,
    )
    expect(newResult.cacheStatus).toBe('miss')
    expect(parser.convertGlb).toHaveBeenCalledTimes(2)
    expect((await cache.stats()).entryCount).toBe(1)
  })

  it('File System Access 소스는 캐시 적중 전에도 권한을 다시 확인한다', async () => {
    const source = entry(
      new File(['gx'], 'part.gx', { lastModified: 10 }),
      'file-system-access',
    )
    const options = {
      source,
      index: new LocalResourceIndex([source]),
      worker: worker(),
      cache: createModelCacheRepository(`pipeline-${crypto.randomUUID()}`),
    }

    await expect(loadOrBuildModel(options)).rejects.toBeInstanceOf(ModelAccessError)
    expect(source.getFile).not.toHaveBeenCalled()
    await expect(loadOrBuildModel({
      ...options,
      verifyReadPermission: async () => false,
    })).rejects.toMatchObject({ code: 'READ_PERMISSION_DENIED' })
    expect(source.getFile).not.toHaveBeenCalled()
  })

  it('조립용 소켓 메타데이터도 캐시하여 XFI 재파싱 없이 돌려준다', async () => {
    const source = entry(new File(['gx'], 'part.gx', { lastModified: 10 }))
    const xfi = entry(new File(['0,'], 'part.xfi', { lastModified: 30 }))
    const parser = worker()
    const options = {
      source,
      index: new LocalResourceIndex([source, xfi]),
      worker: parser,
      cache: createModelCacheRepository(`pipeline-${crypto.randomUUID()}`),
      includeSocketMetadata: true,
    }

    const first = await loadOrBuildModel(options)
    const second = await loadOrBuildModel(options)

    expect(first.socketMetadata).toMatchObject({
      primaryFrameName: null,
      xfi: { partType: 0 },
    })
    expect(second.socketMetadata).toEqual(first.socketMetadata)
    expect(parser.parseXfiFile).toHaveBeenCalledTimes(1)
    expect(parser.convertGlb).toHaveBeenCalledTimes(1)
  })

  it('원본 폴더 인덱스 없이 저장된 GLB와 소켓 메타데이터를 복원한다', async () => {
    const source = entry(new File(['gx'], 'part.gx', { lastModified: 10 }))
    const xfi = entry(new File(['0,'], 'part.xfi', { lastModified: 30 }))
    const cache = createModelCacheRepository(`pipeline-${crypto.randomUUID()}`)
    await loadOrBuildModel({
      source,
      index: new LocalResourceIndex([source, xfi]),
      worker: worker(),
      cache,
      includeSocketMetadata: true,
    })

    const cached = await loadCachedModel('PART.GX', cache)

    expect(cached).toMatchObject({
      cacheStatus: 'hit',
      socketMetadata: { xfi: { partType: 0 } },
    })
  })
})
