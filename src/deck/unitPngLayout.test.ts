import { describe, expect, it } from 'vitest'

import { partsCatalog } from '../data/catalog/catalog.ts'
import type { SavedUnit } from '../domain/deck/schema.ts'
import { createUnitPngLayout, UNIT_PNG_EXPORT_SIZE } from './unitPngLayout.ts'

const denseAbilityUnit: SavedUnit = {
  name: 'ABILITY UNIT',
  schemaVersion: 1,
  catalogVersion: partsCatalog.catalogVersion,
  partIds: { leg: 24, body: 40, weapon: 33, accessory: 61 },
  subcoreIds: { leg: 0, body: 0, weapon: 0 },
  reinforcement: {
    leg: { watt: 12, health: 8, damage: 4 },
    body: { watt: 10, health: 20, damage: 3 },
    weapon: { watt: 9, health: 2, damage: 30 },
  },
  accessoryRandomOptions: { health: 100, damage: 10, armor: 5 },
}

describe('유닛 PNG 출력 레이아웃 데이터', () => {
  it('4개 부품과 강화, 최종 스펙, 모든 부품 특수 능력을 보존한다', () => {
    const layout = createUnitPngLayout(denseAbilityUnit)

    expect(UNIT_PNG_EXPORT_SIZE).toEqual({ width: 1600, height: 1000 })
    expect(layout.parts.map((part) => part.name)).toEqual([
      '스플리터',
      '킹핀',
      '리코일건N',
      'P쥬얼',
    ])
    expect(layout.parts[0].primaryStats[0]).toMatchObject({
      label: '와트',
      reinforcementLevel: 12,
    })
    expect(layout.parts[0].primaryStats[0].bonus).toMatch(/^−/)
    expect(layout.parts[3].reinforcement).toContain('체력 100')
    expect(layout.primaryStats.map((stat) => stat.label)).toEqual([
      '와트',
      '체력',
      '공격력',
    ])
    expect(layout.secondaryStats.map((stat) => stat.label)).toContain('방어력')
    expect(layout.weight).toMatchObject({ used: '90', capacity: '105' })
    expect(layout.abilities.map((ability) => ability.partName)).toEqual([
      '스플리터',
      '킹핀',
      '리코일건N',
      'P쥬얼',
    ])
  })
})
