import { describe, expect, it } from 'vitest'

import type { LabUiSpriteKey } from './lab-ui-atlas.ts'
import { createLabUiSpriteCacheRepository } from './lab-ui-sprite-cache.ts'

describe('IndexedDB lab_ui 스프라이트 캐시', () => {
  it('추출한 타입·서브코어 스프라이트를 저장하고 오프라인 조회 및 전체 삭제를 지원한다', async () => {
    const cache = createLabUiSpriteCacheRepository(
      `sprite-cache-${crypto.randomUUID()}`,
      () => '2026-08-05T00:00:00.000Z',
    )
    const fingerprint = {
      sourceId: 'ui/lab_ui.png',
      size: 2048,
      lastModified: 1234,
      extractorVersion: '1',
    }
    const sprites = new Map<LabUiSpriteKey, Blob>([
      ['mount:arm', new Blob(['arm'])],
      ['subcore:1', new Blob(['core'])],
    ])

    await cache.put(fingerprint, sprites)

    const exact = await cache.get(fingerprint)
    const offline = await cache.findLatest('1')
    expect([...exact?.keys() ?? []]).toEqual(['mount:arm', 'subcore:1'])
    expect([...exact?.values() ?? []].map((sprite) => sprite.size)).toEqual([3, 4])
    expect([...offline?.keys() ?? []]).toEqual(['mount:arm', 'subcore:1'])
    expect(await cache.stats()).toEqual({ entryCount: 2, totalBytes: 7 })

    await cache.clear()
    expect(await cache.findLatest('1')).toBeNull()
    expect(await cache.stats()).toEqual({ entryCount: 0, totalBytes: 0 })
  })
})
