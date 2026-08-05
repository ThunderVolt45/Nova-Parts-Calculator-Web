import { describe, expect, it } from 'vitest'

import { partsCatalog } from '../data/catalog/catalog.ts'
import { LocalResourceIndex } from './local-files.ts'
import {
  getPartResourceMapping,
  gxResourceMap,
  resolvePartModel,
} from './resource-map.ts'

describe('GX 부품 리소스 매핑', () => {
  it('현재 카탈로그의 모든 실제 부품을 안정적인 ID로 포함한다', () => {
    const catalogPartCount = Object.values(partsCatalog.parts).reduce(
      (count, parts) => count + parts.filter((part) => part.id !== 0).length,
      0,
    )

    expect(gxResourceMap.catalogVersion).toBe(partsCatalog.catalogVersion)
    expect(gxResourceMap.items).toHaveLength(catalogPartCount)
    expect(new Set(gxResourceMap.items.map((item) => `${item.kind}:${item.partId}`)).size).toBe(
      catalogPartCount,
    )
  })

  it('검증된 파일명과 명시적인 미해결 상태를 보존한다', () => {
    expect(getPartResourceMapping('leg', 1)).toMatchObject({
      partName: '로드런너',
      mappingStatus: 'mapped',
      sourceGx: 'legs1_rdrn.gx',
    })
    expect(
      gxResourceMap.items.find((item) => item.partName === '오스트릭'),
    ).toMatchObject({
      mappingStatus: 'unresolved',
      sourceGx: null,
      confidence: 'unresolved',
    })
  })

  it('승인된 파일 인덱스에서 사용 가능/누락/미해결을 구분한다', () => {
    const file = new File(['gx'], 'LEGS1_RDRN.GX', { lastModified: 123 })
    const index = new LocalResourceIndex([
      {
        name: file.name,
        relativePath: file.name,
        size: file.size,
        lastModified: file.lastModified,
        source: 'directory-input',
        getFile: async () => file,
      },
    ])

    expect(resolvePartModel('leg', 1, index).status).toBe('available')
    expect(resolvePartModel('body', 1, index).status).toBe('missing-source')
    const unresolved = gxResourceMap.items.find(
      (item) => item.mappingStatus === 'unresolved',
    )
    expect(unresolved).toBeDefined()
    expect(
      resolvePartModel(unresolved!.kind, unresolved!.partId, index).status,
    ).toBe('unresolved')
    expect(resolvePartModel('leg', 9999, index).status).toBe('unknown-part')
  })
})

