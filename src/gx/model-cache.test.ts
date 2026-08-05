import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import type { GlbConversionResult } from './glb-converter.ts'
import {
  buildModelCacheKey,
  createModelCacheRepository,
  type ModelSourceFingerprint,
} from './model-cache.ts'

const fingerprint: ModelSourceFingerprint = {
  sourceId: 'file-system-access:models/part.gx',
  size: 100,
  lastModified: 123,
  parserVersion: '1',
  dependencySignature: 'abc',
}

function result(byteLength = 16): GlbConversionResult {
  return {
    glb: new ArrayBuffer(byteLength),
    metadata: {
      formatVersion: 1,
      parserVersion: '1',
      sourceName: 'part.gx',
      meshCount: 1,
      frameCount: 1,
      animationNames: [],
      textureReferences: [],
      missingTextures: [],
      diagnostics: [],
    },
  }
}

describe('IndexedDB 모델 캐시', () => {
  it('소스·크기·수정 시각·파서·의존성으로 캐시 키를 구분한다', () => {
    const base = buildModelCacheKey(fingerprint)
    expect(buildModelCacheKey({ ...fingerprint, size: 101 })).not.toBe(base)
    expect(buildModelCacheKey({ ...fingerprint, lastModified: 124 })).not.toBe(base)
    expect(buildModelCacheKey({ ...fingerprint, parserVersion: '2' })).not.toBe(base)
    expect(buildModelCacheKey({ ...fingerprint, dependencySignature: 'def' })).not.toBe(base)
  })

  it('GLB 저장·적중·용량 계산·전체 삭제를 지원한다', async () => {
    const timestamps = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']
    const cache = createModelCacheRepository(
      `model-cache-${crypto.randomUUID()}`,
      () => timestamps.shift() ?? '2026-01-03T00:00:00.000Z',
    )

    await cache.put(fingerprint, result(32))
    const hit = await cache.get(fingerprint)
    expect(hit).toMatchObject({ byteSize: 32, lastAccessedAt: '2026-01-02T00:00:00.000Z' })
    expect(await cache.stats()).toEqual({
      entryCount: 1,
      totalBytes: 32,
      oldestAccessedAt: '2026-01-02T00:00:00.000Z',
      newestAccessedAt: '2026-01-02T00:00:00.000Z',
    })
    await cache.clear()
    expect((await cache.stats()).entryCount).toBe(0)
  })

  it('같은 소스의 오래된 변환 결과를 새 입력 저장 시 제거한다', async () => {
    const cache = createModelCacheRepository(`model-cache-${crypto.randomUUID()}`)
    await cache.put(fingerprint, result())
    const current = { ...fingerprint, dependencySignature: 'new-texture' }
    await cache.put(current, result(24))

    expect(await cache.get(fingerprint)).toBeNull()
    expect(await cache.get(current)).toMatchObject({ byteSize: 24 })
    expect((await cache.stats()).entryCount).toBe(1)
  })

  it('원본 폴더가 없어도 파일명과 파서 버전으로 최신 GLB를 찾는다', async () => {
    const cache = createModelCacheRepository(`model-cache-${crypto.randomUUID()}`)
    const socketMetadata = {
      primaryFrameName: 'root',
      primaryFrameTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      xfi: null,
    } as const
    await cache.put(fingerprint, result(40), socketMetadata)

    expect(await cache.findLatest('PART.GX', '1')).toMatchObject({
      byteSize: 40,
      socketMetadata: { primaryFrameName: 'root' },
    })
    expect(await cache.findLatest('part.gx', '2')).toBeNull()
  })
})
