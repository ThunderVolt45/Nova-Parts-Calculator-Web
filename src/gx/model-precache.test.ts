import { describe, expect, it, vi } from 'vitest'

import { LocalResourceIndex, type LocalResourceFile } from './local-files.ts'
import type { ModelCacheRepository } from './model-cache.ts'
import { precacheMappedModels, uniqueMappedGxSources } from './model-precache.ts'
import type { ModelPipelineWorker } from './model-pipeline.ts'

describe('부품 GX 일괄 GLB 캐시', () => {
  it('229개 부품 매핑을 고유 GX 222개로 중복 제거한다', () => {
    expect(uniqueMappedGxSources()).toHaveLength(222)
  })

  it('누락된 GX는 기록하고 나머지 모델 변환을 계속한다', async () => {
    const first = uniqueMappedGxSources()[0]
    const file = new File(['gx'], first)
    const source: LocalResourceFile = {
      name: first,
      relativePath: first,
      size: file.size,
      lastModified: file.lastModified,
      source: 'directory-input',
      getFile: async () => file,
    }
    const cache = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => ({ glb: new ArrayBuffer(0) })),
    } as unknown as ModelCacheRepository
    const worker = {
      parseGxFile: vi.fn(async () => ({
        parserVersion: '1', byteLength: 3, chunkCount: 0, frames: [], meshes: [], diagnostics: [],
      })),
      parseXfiFile: vi.fn(),
      convertGlb: vi.fn(async () => ({
        glb: new ArrayBuffer(8),
        metadata: {
          formatVersion: 1 as const,
          parserVersion: '1',
          sourceName: first,
          meshCount: 0,
          frameCount: 0,
          animationNames: [],
          textureReferences: [],
          missingTextures: [],
          diagnostics: [],
        },
      })),
    } satisfies ModelPipelineWorker

    const result = await precacheMappedModels({
      index: new LocalResourceIndex([source]),
      cache,
      worker,
    })

    expect(result).toMatchObject({ total: 222, completed: 222, converted: 1, failed: 221 })
    expect(worker.convertGlb).toHaveBeenCalledTimes(1)
  })
})
