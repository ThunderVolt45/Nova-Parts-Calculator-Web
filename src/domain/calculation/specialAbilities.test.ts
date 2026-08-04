import { describe, expect, it } from 'vitest'

import { collectAssemblyAbilities } from './specialAbilities.ts'

describe('collectAssemblyAbilities', () => {
  it('keeps every passive ability in part order', () => {
    const result = collectAssemblyAbilities({
      leg: { name: '다리 패시브', special: '첫 번째 패시브' },
      body: { name: '몸통 패시브', special: '두 번째 패시브' },
      weapon: { name: '무기 패시브', special: '세 번째 패시브' },
    })

    expect(result.passives.map((ability) => ability.partName)).toEqual([
      '다리 패시브',
      '몸통 패시브',
      '무기 패시브',
    ])
    expect(result.active).toBeNull()
  })

  it('keeps only the last active ability by leg-body-weapon-accessory priority', () => {
    const result = collectAssemblyAbilities({
      leg: { name: '다리 액티브', special: '특수 기술(C키)를 사용합니다.' },
      body: { name: '몸통 액티브', special: '특수 기술 ( C키 )를 사용합니다.' },
      weapon: { name: '무기 액티브', special: '특수 기술 (C 키)를 사용합니다.' },
      accessory: { name: '액세서리 액티브', special: '특수 기술(C키) 버튼을 누릅니다.' },
    })

    expect(result.passives).toEqual([])
    expect(result.active).toMatchObject({
      slot: 'accessory',
      partName: '액세서리 액티브',
      type: 'active',
    })
  })

  it('retains passives while active abilities override independently', () => {
    const result = collectAssemblyAbilities({
      leg: { name: '패시브 다리', special: '조건 달성 시 속도가 증가합니다.' },
      weapon: { name: '액티브 무기', special: '특수 기술(C키)를 사용합니다.' },
      accessory: { name: '패시브 액세서리', special: '체력이 증가합니다.' },
    })

    expect(result.passives.map((ability) => ability.partName)).toEqual([
      '패시브 다리',
      '패시브 액세서리',
    ])
    expect(result.active?.partName).toBe('액티브 무기')
  })
})
