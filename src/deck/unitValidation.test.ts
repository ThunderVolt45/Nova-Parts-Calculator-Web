import { describe, expect, it } from 'vitest'

import { partsCatalog } from '../data/catalog/catalog.ts'
import { createDeck, type SavedUnit } from '../domain/deck/schema.ts'
import {
  assertSavedUnitIsValid,
  getSavedUnitValidation,
  removeInvalidUnitsFromDecks,
} from './unitValidation.ts'

function getValidPartIds() {
  const body = partsCatalog.parts.bodies.find((part) => part.id !== 0)!
  const weapon = partsCatalog.parts.weapons.find(
    (part) => part.id !== 0 && part.mountType === body.mountType,
  )!
  const leg = partsCatalog.parts.legs.find(
    (part) => part.id !== 0 && part.loadCapacity >= body.weight + weapon.weight,
  )!

  return { leg: leg.id, body: body.id, weapon: weapon.id, accessory: 0 }
}

function createUnit(partIds = getValidPartIds()): SavedUnit {
  return {
    name: '테스트 유닛',
    schemaVersion: 1,
    catalogVersion: partsCatalog.catalogVersion,
    partIds,
    subcoreIds: { leg: 0, body: 0, weapon: 0 },
    reinforcement: {
      leg: { watt: 0, health: 0, damage: 0 },
      body: { watt: 0, health: 0, damage: 0 },
      weapon: { watt: 0, health: 0, damage: 0 },
    },
    accessoryRandomOptions: { health: 0, damage: 0, armor: 0 },
  }
}

describe('덱 유닛 유효성', () => {
  it('유효한 조합만 덱 유닛으로 허용한다', () => {
    expect(getSavedUnitValidation(createUnit()).isValid).toBe(true)
    expect(() => assertSavedUnitIsValid(createUnit())).not.toThrow()

    const missingWeapon = createUnit({ ...getValidPartIds(), weapon: 0 })
    expect(getSavedUnitValidation(missingWeapon).isValid).toBe(false)
    expect(() => assertSavedUnitIsValid(missingWeapon)).toThrow(/무기 부품이 없습니다/)
  })

  it('기존 저장소의 유효하지 않은 유닛을 빈 슬롯으로 정리한다', () => {
    const deck = createDeck('ALPHA', partsCatalog.catalogVersion, { id: 'deck-1' })
    deck.slots[0] = createUnit({ leg: 0, body: 0, weapon: 0, accessory: 0 })

    const result = removeInvalidUnitsFromDecks([deck])

    expect(result.decks[0].slots[0]).toBeNull()
    expect(result.removed).toEqual(['ALPHA 1번 슬롯'])
  })
})
